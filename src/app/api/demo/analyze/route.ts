import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const { checkRateLimit } = await import('@/lib/rateLimit')
  if (!checkRateLimit(`demo-analyze:${ip}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: '너무 많은 요청이에요. 잠시 후 다시 시도해주세요.' }, { status: 429 })
  }

  const formData = await request.formData()
  const photo = formData.get('photo') as File
  if (!photo) return NextResponse.json({ error: '사진을 업로드해주세요' }, { status: 400 })

  try {
    const bytes = await photo.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = photo.type || 'image/jpeg'

    const response = await genai.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: `이 사진의 인물을 종이인형 캐릭터로 만들기 위해 외형 특징을 추출해줘.

반드시 아래 형식의 JSON으로만 응답:
{
  "gender": "여자/남자/기타",
  "age": "추정 나이",
  "skin_tone": "피부톤(예: 밝은 웜톤, 올리브톤 등)",
  "hair_style": "머리 스타일 상세(길이, 색상, 결, 앞머리)",
  "hair_color": "헤어 컬러(확실하면)",
  "eye_color": "눈동자/속눈썹/인상 포인트",
  "face_shape": "얼굴형",
  "face_features": "콧날, 입술, 광대, 턱선 등 핵심 특징",
  "eyes": "눈 특징",
  "glasses": "안경 정보 (없으면 null)",
  "body_type": "체형",
  "posture": "기본 자세/비율 참고 포인트",
  "clothing_style_hint": "기존 옷 느낌(캐주얼, 포멀, 한복 등 큰 카테고리)",
  "accessories": "액세서리 목록",
  "distinctive": "기타 특징적인 요소",
  "summary": "종이인형 변환용 2~3문장 한국어 요약",
  "emotion": "기본 표정/분위기"
}
요구사항:
- JSON 외 텍스트/코드블록/마크다운은 금지
- 값이 불명확하면 "null" 또는 "unknown"로 처리
`,
            },
          ],
        },
      ],
    })

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return NextResponse.json({ error: '특징 분석에 실패했습니다' }, { status: 500 })

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: '분석 결과 파싱 실패' }, { status: 500 })

    const features = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      features,
      photoBase64: base64,
      photoMime: mimeType,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다'
    console.error('Demo analyze error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 30
