import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview'
const UNLIMITED_EMAILS = (process.env.UNLIMITED_EMAILS || 'bloody80@gmail.com').split(',')
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '1', 10)

async function generateImage(prompt: string, referenceBase64?: string, refMime?: string): Promise<Buffer | null> {
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = []
  if (referenceBase64) {
    parts.push({ inlineData: { mimeType: refMime || 'image/png', data: referenceBase64 } })
  }
  parts.push({ text: prompt })

  const response = await genai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['TEXT', 'IMAGE'] } as Record<string, unknown>,
  })

  const resParts = response.candidates?.[0]?.content?.parts
  if (!resParts) {
    console.error('[generateImage] No response parts from Gemini')
    return null
  }
  for (const part of resParts) {
    const inlineData = (part as { inlineData?: { data: string | Uint8Array } }).inlineData
    if (inlineData) {
      const data = inlineData.data
      if (typeof data === 'string') return Buffer.from(data, 'base64')
      if (data instanceof Uint8Array || Buffer.isBuffer(data)) return Buffer.from(data)
    }
  }
  console.error('[generateImage] No image data found in response parts')
  return null
}

async function uploadImage(path: string, buffer: Buffer): Promise<string> {
  const { error } = await supabaseAdmin.storage.from('paperdolly_images').upload(path, buffer, { contentType: 'image/png' })
  if (error) {
    console.error(`[uploadImage] Failed to upload ${path}:`, error.message)
    throw new Error(`이미지 저장 실패: ${error.message}`)
  }
  const { data } = supabaseAdmin.storage.from('paperdolly_images').getPublicUrl(path)
  return data.publicUrl
}

const SIMPLELINE_BASE = {
  sizeRule: 'character about 15cm tall on A4, centered, front-facing',
  poseRule: 'front-facing, arms slightly away, full body visible',
  clothingRule: 'base outfit is white tank + white shorts for tracing',
}

// Step별 처리
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // Body size check (reject >10MB)
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
  if (contentLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '요청이 너무 큽니다 (최대 10MB)' }, { status: 413 })
  }

  const body = await request.json()
  const { step, features, timestamp: ts } = body
  const timestamp = ts || Date.now()

  // 사용량 제한 체크 (모든 생성 step에서)
  if (['character', 'paperdoll', 'color'].includes(step) && !UNLIMITED_EMAILS.includes(user.email || '')) {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).toISOString().split('T')[0]
    const { count } = await supabaseAdmin
      .from('paperdolly_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', `${today}T00:00:00.000Z`)
    if ((count || 0) >= DAILY_LIMIT) {
      return NextResponse.json({
        error: 'daily_limit',
        message: '오늘의 무료 생성 횟수를 모두 사용했어요. 내일 다시 만들어보세요!',
      }, { status: 429 })
    }
  }

  try {
    // ─── Step 2: 기본 캐릭터 일러스트 생성 (참조용) ───
    if (step === 'character') {
      const prompt = `Create a single character reference illustration based on this description. This will be used as a reference for paper doll creation.

Character: ${features.summary}

Draw the character standing front-facing, arms slightly away from body, in a simple white tank top and white shorts. Full body visible from head to toe.

Style: Clean cute illustration, clean line and shape separation, white background, no other elements. The character should look like a paper doll base - clear outlines, clear silhouette, friendly expression.

Important: Keep the character's distinctive features accurate - ${features.hair_style}, ${features.face_shape}.
${features.glasses ? `The character wears glasses: ${features.glasses}. Draw the exact same glasses shape and style on the character.` : 'The character does NOT wear glasses. Do NOT draw any glasses on the character.'}
${features.accessories ? `Accessories: ${features.accessories}` : 'No accessories.'}`

      const charBuffer = await generateImage(prompt)
      if (!charBuffer) return NextResponse.json({ error: '캐릭터 생성 실패' }, { status: 500 })

      const charPath = `${user.id}/${timestamp}-character.png`
      const characterUrl = await uploadImage(charPath, charBuffer)

      return NextResponse.json({
        step: 'character_done',
        characterUrl,
        characterBase64: charBuffer.toString('base64'),
        timestamp,
      })
    }

    // ─── Step 3: 스타일별 도안 생성 (흑백) ───
    if (step === 'paperdoll') {
      const { style, characterBase64, themeOutfits } = body

      const styleMap: Record<string, { name: string; ratio: string; desc: string }> = {
        sd: {
          name: 'SD 귀여운',
          ratio: '3-head-tall',
          desc: 'cute SD/kawaii style based on Simple Line proportions, slight head emphasis, bright eyes, soft outlines, print-first line structure',
        },
        simple: {
          name: '심플라인',
          ratio: '4-head-tall',
          desc: 'Simple Line base format. clean cute illustration, clear contour, balanced 4-head-tall proportions, face/hair features must stay very readable',
        },
        fashion: {
          name: '패션 일러스트',
          ratio: '5.5-head-tall',
          desc: 'fashion illustration upgraded from Simple Line, slightly taller proportions, richer fabric drape, premium edge while preserving base pose',
        },
      }

      const s = styleMap[style] || styleMap.simple

      // Build outfits string from theme data
      const outfitsStr = (themeOutfits as { name: string; name_en: string; desc: string }[])
        .map((o, i) => `${i + 1}. ${o.name} (${o.name_en}) - ${o.desc}`)
        .join('\n')

      const prompt = `Create a high-quality paper doll printable sheet. This should look like a professionally designed children's activity page.

STYLE: ${s.desc}

Base format rule: ${SIMPLELINE_BASE.sizeRule}; ${SIMPLELINE_BASE.poseRule}; ${SIMPLELINE_BASE.clothingRule}.
Keep the character's face, hair, and distinctive features from the reference image but redraw in ${s.ratio} ${s.name} style.
${features?.glasses ? `The character wears glasses: ${features.glasses}. Keep the exact same glasses shape and style.` : 'The character does NOT wear glasses. Do NOT add glasses.'}
${features?.accessories ? `Accessories: ${features.accessories}` : ''}

LAYOUT on pure white background, A4 vertical format:

TOP CENTER: The character in base outfit, standing ${SIMPLELINE_BASE.poseRule}. Dashed cutting line around the character.

BOTTOM: ${themeOutfits.length} detailed outfit sets arranged in ${themeOutfits.length <= 4 ? '2x2' : '2x3'} grid. Each outfit is designed to be cut out and placed ON TOP of the doll (overlay style, no folding tabs). Dashed cutting lines around each piece. Each outfit should include matching shoes/accessories as separate pieces where noted.

OUTFITS (with detailed accessories):
${outfitsStr}

Korean label (한글) under each outfit name.

COLORING BOOK VERSION: Black line art outlines ONLY. NO color, NO shading, NO gray fill, NO gradients. Pure crisp black lines on pure white background. Lines should be clean and detailed enough for coloring - include fabric pattern outlines, texture details, decorative elements all as line art. Professional coloring book quality.`

      const dollBuffer = await generateImage(prompt, characterBase64, 'image/png')
      if (!dollBuffer) return NextResponse.json({ error: '도안 생성 실패' }, { status: 500 })

      const dollPath = `${user.id}/${timestamp}-${style}-coloring.png`
      const coloringUrl = await uploadImage(dollPath, dollBuffer)

      return NextResponse.json({
        step: 'paperdoll_done',
        coloringUrl,
        coloringBase64: dollBuffer.toString('base64'),
        style,
        timestamp,
      })
    }

    // ─── Step 4: 컬러 버전 생성 ───
    if (step === 'color') {
      const { coloringBase64, style: styleId, themeOutfits: colorThemeOutfits } = body

      // Build dynamic color guide from theme outfits
      let colorGuide = ''
      if (colorThemeOutfits && Array.isArray(colorThemeOutfits)) {
        colorGuide = colorThemeOutfits
          .map((o: { name: string; desc: string }) => `- ${o.name}: vibrant appropriate colors for ${o.desc}`)
          .join('\n')
      }

      const prompt = `Take this exact black and white line art paper doll sheet and add beautiful, rich full color. Keep EVERYTHING exactly the same - same layout, same poses, same outlines, same proportions, same positions, same dashed cutting lines. 

Color guide:
- Character: warm natural skin tone, accurate hair color from the original design
${colorGuide}

Apply colors with depth - use subtle shading and highlights to make each outfit look vibrant and appealing. Fabric patterns (flowers, stars, embroidery) should be colored in detail. Keep white background. Keep all dashed cutting lines visible. Identical layout to the line art.`

      const colorBuffer = await generateImage(prompt, coloringBase64, 'image/png')
      if (!colorBuffer) return NextResponse.json({ error: '컬러 생성 실패' }, { status: 500 })

      const colorPath = `${user.id}/${timestamp}-${styleId}-color.png`
      const colorUrl = await uploadImage(colorPath, colorBuffer)

      return NextResponse.json({
        step: 'color_done',
        colorUrl,
        style: styleId,
        timestamp,
      })
    }

    return NextResponse.json({ error: '잘못된 step' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '생성 중 오류가 발생했습니다'
    console.error('Generation error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 60
