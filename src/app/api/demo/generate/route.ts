import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  DEMO_STYLE_LIBRARY,
  THEME_OUTFITS,
  buildCharacterPrompt,
  buildPaperDollPrompt,
  buildColorPrompt,
} from '@/lib/demoStyles'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

// 얼굴 레퍼런스 이미지 캐시 (서버 시작 시 1회 로드)
let faceRefBase64: string | null = null
try {
  const refPath = join(process.cwd(), 'public', 'previews', 'face-reference.jpg')
  faceRefBase64 = readFileSync(refPath).toString('base64')
} catch { /* 레퍼런스 없으면 무시 */ }

async function generateImage(prompt: string, referenceBase64?: string, refMime = 'image/png'): Promise<string | null> {
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = []

  // 참조 이미지가 있으면 data: URL 프리픽스 제거 후 전달
  if (referenceBase64) {
    let cleanBase64 = referenceBase64
    let mime = refMime
    if (cleanBase64.startsWith('data:')) {
      const match = cleanBase64.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mime = match[1]
        cleanBase64 = match[2]
      }
    }
    parts.push({ inlineData: { mimeType: mime, data: cleanBase64 } })
  }

  parts.push({ text: prompt })

  console.log(`[demo-generate] prompt length: ${prompt.length}, hasRef: ${!!referenceBase64}, refSize: ${referenceBase64 ? Math.round(referenceBase64.length / 1024) + 'KB' : 'none'}`)

  const response = await genai.models.generateContent({
    model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'] as const,
    },
  })

  const partsOut = response.candidates?.[0]?.content?.parts
  if (!partsOut) return null

  for (const p of partsOut) {
    const part = p as { inlineData?: { data?: string } }
    if (part?.inlineData?.data) return part.inlineData.data
  }

  return null
}

function clampStep(step: string): 'character' | 'paperdoll' | 'color' | null {
  if (step === 'character' || step === 'paperdoll' || step === 'color') return step
  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const step = clampStep(body.step)
    if (!step) {
      return NextResponse.json({ error: '잘못된 step' }, { status: 400 })
    }

    const styleId = body.style || 'simple'
    const style = DEMO_STYLE_LIBRARY[styleId] ?? DEMO_STYLE_LIBRARY.simple

    const ratioOverride = body.ratioOverride || ''
    const extraDetail = body.extraDetail || ''

    if (step === 'character') {
      const featuresText = body.featuresText || body.summary || '귀여운 만화 캐릭터로 변환'
      const lineArtOnly = body.lineArtOnly === true
      const prompt = buildCharacterPrompt(featuresText, style, {
        ratioOverride,
        extraDetail,
        lineArtOnly,
      })

      // 얼굴 레퍼런스 이미지를 함께 전달 → 얼굴 퀄리티 기준선 확보
      const imageBase64 = await generateImage(
        prompt,
        faceRefBase64 || undefined,
        'image/jpeg'
      )
      if (!imageBase64) {
        return NextResponse.json({ error: '캐릭터 생성 실패' }, { status: 500 })
      }

      return NextResponse.json({
        step: 'character_done',
        characterBase64: imageBase64,
        characterImageUrl: `data:image/png;base64,${imageBase64}`,
      })
    }

    if (step === 'paperdoll') {
      const characterBase64 = body.characterBase64
      if (!characterBase64) {
        return NextResponse.json({ error: 'characterBase64가 필요합니다' }, { status: 400 })
      }

      const lineArtOnly = body.lineArtOnly !== false // default true
      const themeId = body.themeId || ''
      const themeOutfits = themeId && THEME_OUTFITS[themeId] ? THEME_OUTFITS[themeId] : undefined
      const prompt = buildPaperDollPrompt(style, {
        lineArtOnly,
        ratioOverride,
        extraDetail,
        themeOutfits,
      })

      const imageBase64 = await generateImage(prompt, characterBase64, body.characterMime || 'image/png')
      if (!imageBase64) {
        return NextResponse.json({ error: '도안 생성 실패' }, { status: 500 })
      }

      return NextResponse.json({
        step: 'paperdoll_done',
        coloringBase64: imageBase64,
        coloringImageUrl: `data:image/png;base64,${imageBase64}`,
      })
    }

    // step === color
    const coloringBase64 = body.coloringBase64
    if (!coloringBase64) {
      return NextResponse.json({ error: 'coloringBase64가 필요합니다' }, { status: 400 })
    }

    const colorPreset = body.colorPreset || 'balanced'
    const prompt = buildColorPrompt(style, {
      colorPreset,
      extraDetail,
    })

    const imageBase64 = await generateImage(prompt, coloringBase64, body.coloringMime || 'image/png')
    if (!imageBase64) {
      return NextResponse.json({ error: '컬러 생성 실패' }, { status: 500 })
    }

    return NextResponse.json({
      step: 'color_done',
      colorBase64: imageBase64,
      colorImageUrl: `data:image/png;base64,${imageBase64}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '생성 중 오류가 발생했습니다'
    console.error('Demo generate error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 60
