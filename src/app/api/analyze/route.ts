import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const formData = await request.formData()
  const photo = formData.get('photo') as File
  if (!photo) return NextResponse.json({ error: '사진을 업로드해주세요' }, { status: 400 })

  try {
    const bytes = await photo.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = photo.type || 'image/jpeg'

    // Step 1: 특징 추출
    const response = await genai.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: `이 사진의 인물을 종이인형 캐릭터로 만들기 위해 외형 특징을 추출해줘.

반드시 아래 형식의 JSON으로만 답변해. 다른 텍스트 없이 JSON만:
{
  "gender": "여자/남자",
  "age": "추정 나이 (예: 7살)",
  "hair_style": "머리 스타일 상세 (길이, 색상, 직모/곱슬, 앞머리 등)",
  "face_shape": "얼굴형",
  "eyes": "눈 특징",
  "glasses": "안경 정보 (없으면 null)",
  "body_type": "체형",
  "accessories": "액세서리 목록 (목걸이, 헤어밴드 등)",
  "distinctive": "기타 특징적인 요소",
  "summary": "종이인형 도안용 한 문단 요약 (한국어, 구체적)"
}` }
        ],
      }],
    })

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return NextResponse.json({ error: '특징 분석에 실패했습니다' }, { status: 500 })

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: '분석 결과 파싱 실패' }, { status: 500 })

    const features = JSON.parse(jsonMatch[0])

    return NextResponse.json({ features, photoBase64: base64, photoMime: mimeType })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다'
    console.error('Analyze error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 30
