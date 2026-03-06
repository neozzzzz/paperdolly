'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { DEMO_STYLE_LIBRARY, THEME_OUTFITS, type StyleModule } from '@/lib/demoStyles'
import { jsPDF } from 'jspdf'

type DemoResult = {
  characterBase64?: string
  coloringBase64?: string
  colorBase64?: string
  characterImageUrl: string
  coloringImageUrl?: string
  colorImageUrl?: string
}

const STYLE_OPTIONS: StyleModule[] = Object.values(DEMO_STYLE_LIBRARY)

type ColorPreset = 'soft' | 'balanced' | 'bold'

type ThemePreset = {
  id: string
  name: string
  description: string
}

type AnalyzeResponse = {
  features: {
    summary?: string
    [key: string]: unknown
  }
  error?: string
}

type GenerateCharacterResponse = {
  characterBase64: string
  characterImageUrl: string
  error?: string
}

type GeneratePaperdollResponse = {
  coloringBase64: string
  coloringImageUrl: string
  error?: string
}

type GenerateColorResponse = {
  colorBase64: string
  colorImageUrl: string
  error?: string
}

const DEMO_ANALYZE_PROMPT_TEXT = `이 사진의 인물을 종이인형 캐릭터로 만들기 위해 외형 특징을 추출해줘.

반드시 아래 형식의 JSON으로만 답변:
{
  "gender": "여자/남자/기타",
  "age": "추정 나이",
  "skin_tone": "피부톤(예: 밝은 웜톤, 올리브톤 등)",
  "hair_style": "머리 스타일 상세(길이, 색상, 결, 앞머리)",
  "hair_color": "헤어 컬러(확실하면)",
  "eye_color": "눈동자/속눈썹/인상 포인트",
  "face_shape": "얼굴형",
  "face_features": "콧날/입술/광대/턱선 등 특징",
  "eyes": "눈 특징",
  "glasses": "안경 정보 (없으면 null)",
  "body_type": "체형",
  "posture": "기본 자세/비율 참고 포인트",
  "clothing_style_hint": "기존 옷 느낌(캐주얼, 포멀, 한복 등)",
  "accessories": "액세서리 목록",
  "distinctive": "기타 특징적인 요소",
  "emotion": "기본 표정/분위기",
  "summary": "종이인형 변환용 2~3문장 한국어 요약"
}
요구사항:
- JSON 외 텍스트/코드블록/마크다운은 금지
- 값이 불명확하면 "null" 또는 "unknown"로 처리
`;

const THEME_PRESETS: ThemePreset[] = [
  { id: 'princess', name: '공주님', description: '우아한 드레스/티아라/글래스 슈즈 톤. 얼굴형·색감만 유지하고 의상은 화려하게.' },
  { id: 'casual', name: '캐주얼', description: '일상복 톤. 과하지 않은 디테일, 동작은 안정적인 정면 자세 유지.' },
  { id: 'hanbok', name: '한복', description: '국적적인 색감과 매듭, 단추, 매듭끈 디테일 반영.' },
  { id: 'adventurer', name: '탐험가', description: '베이스는 유지하되 베어링/악세서리, 가방, 장비 실루엣 강화.' },
  { id: 'ballet', name: '발레리나', description: '소프트한 플레어/리본/포인트 슈즈 중심의 균형 잡힌 우아함.' },
  { id: 'school', name: '교복', description: '실루엣은 유지하고 단정한 교복 라인 및 모자, 액세서리 정돈.' },
  { id: 'summer', name: '여름 휴가', description: '명쾌한 채색과 라이트한 캐주얼, 햇빛·썬햇 계열 포인트.' },
  { id: 'night', name: '야경/무드', description: '명암은 너무 과하지 않게, 눈/얼굴 식별성을 유지한 채 다크 톤 유지.' },
]

const DEMO_PIPELINE_TEXT = `이미지 업로드 직후 진행되는 기본 흐름
1) 업로드 파일을 Base64로 변환하여 Gemini 2.0 Flash에 이미지+텍스트 프롬프트로 전달
2) 응답 텍스트에서 첫 JSON 블록만 파싱
3) 파싱된 summary를 특징 텍스트로 사용해 캐릭터/도안/컬러 생성 프롬프트에 주입
4) 추출된 feature(헤어/얼굴/액세서리/안경/표정/피부톤/옷감 느낌)는 각 스타일 생성 시 extraDetail, 비율 옵션과 함께 적용`

export default function DemoPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [featuresText, setFeaturesText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState<Record<string, DemoResult>>({})
  const resultsRef = React.useRef<Record<string, DemoResult>>({})
  const updateResults = (updater: (prev: Record<string, DemoResult>) => Record<string, DemoResult>) => {
    setResults((prev) => {
      const next = updater(prev)
      resultsRef.current = next
      return next
    })
  }
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')

  // 튜닝 옵션
  const [selectedStyles, setSelectedStyles] = useState<string[]>(['simple', 'fashion', 'pastelpixel'])
  const [previewTab, setPreviewTab] = useState<'lineart' | 'color'>('lineart')
  const [showHistory, setShowHistory] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([])
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>(['coloring'])
  const [selectedThemes, setSelectedThemes] = useState<string[]>(['casual'])
  const [ratioMode, setRatioMode] = useState<'auto' | 'custom'>('auto')
  const [ratioCustom, setRatioCustom] = useState('')
  const [lineArtOnly, setLineArtOnly] = useState(true)
  const [colorPreset, setColorPreset] = useState<ColorPreset>('balanced')
  const [extraDetail, setExtraDetail] = useState('')

  const [activeStyle, setActiveStyle] = useState<string>('sd')
  const [viewMode, setViewMode] = useState<'character' | 'coloring' | 'color'>('coloring')

  const selectedList = useMemo(() => {
    const list = STYLE_OPTIONS.filter((s) => selectedStyles.includes(s.id))
    if (list.length === 0) return [STYLE_OPTIONS[0]]
    return list
  }, [selectedStyles])

  const ratioText = useMemo(() => {
    if (ratioMode === 'custom' && ratioCustom.trim()) return ratioCustom.trim()
    return ''
  }, [ratioMode, ratioCustom])

  const selectedThemeList = useMemo(
    () => THEME_PRESETS.filter((t) => selectedThemes.includes(t.id)),
    [selectedThemes]
  )

  const effectiveExtraDetail = useMemo(() => {
    const themeText = selectedThemeList.length
      ? `Theme lock: ${selectedThemeList.map((t) => `${t.name}(${t.description})`).join('; ')}`
      : ''

    return [extraDetail.trim(), themeText].filter(Boolean).join('\n')
  }, [extraDetail, selectedThemeList])

  const wantCharacter = selectedOutputs.includes('character')
  const wantColoring = selectedOutputs.includes('coloring')
  const wantColor = selectedOutputs.includes('color')

  const estimatedImageCount = selectedStyles.length * selectedOutputs.length
  const selectedStyleNames = useMemo(() => {
    const names = STYLE_OPTIONS.filter((s) => selectedStyles.includes(s.id)).map((s) => s.name)
    return names.length > 0 ? names : ['(미선택)']
  }, [selectedStyles])

  const toggleOutput = (id: string) => {
    setSelectedOutputs((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
  }

  const OUTPUT_OPTIONS = [
    { id: 'character', name: '캐릭터', emoji: '🧑' },
    { id: 'coloring', name: '흑백 도안', emoji: '✏️' },
    { id: 'color', name: '컬러 도안', emoji: '🎨' },
  ] as const

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setPhotoPreview(URL.createObjectURL(file))
    setAnalyzing(true)

    try {
      const form = new FormData()
      form.append('photo', file)

      const res = await fetch('/api/demo/analyze', { method: 'POST', body: form })
      const data = (await res.json()) as AnalyzeResponse

      if (!res.ok) throw new Error(data.error || '분석 실패')
      const features = data.features || {}
      // 주요 특징을 구조화된 텍스트로 변환 (summary만 쓰면 세부 정보 손실)
      const keyFields = [
        features.gender && `성별: ${features.gender}`,
        features.age && `나이: ${features.age}`,
        features.skin_tone && `피부톤: ${features.skin_tone}`,
        features.hair_style && `머리 스타일: ${features.hair_style}`,
        features.hair_color && `머리 색상: ${features.hair_color}`,
        features.face_shape && `얼굴형: ${features.face_shape}`,
        features.face_features && `얼굴 특징: ${features.face_features}`,
        features.eyes && `눈: ${features.eyes}`,
        features.eye_color && `눈 색상: ${features.eye_color}`,
        features.glasses && features.glasses !== 'null' && `안경: ${features.glasses}`,
        features.body_type && `체형: ${features.body_type}`,
        features.accessories && features.accessories !== 'null' && `액세서리: ${features.accessories}`,
        features.emotion && `표정: ${features.emotion}`,
        features.distinctive && features.distinctive !== 'null' && `특이사항: ${features.distinctive}`,
      ].filter(Boolean).join('\n')

      const summaryLine = features.summary ? `요약: ${features.summary}` : ''
      setFeaturesText([keyFields, summaryLine].filter(Boolean).join('\n\n'))
      setStep(1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '다시 시도해주세요'
      alert(`분석 실패: ${msg}`)
      setFeaturesText('')
    } finally {
      setAnalyzing(false)
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const toggleStyle = (id: string) => {
    setSelectedStyles((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
  }

  const toggleTheme = (id: string) => {
    setSelectedThemes((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) processFile(file)
          break
        }
      }
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem('paperdolly-history') || '[]'))
    } catch { /* ignore */ }
  }, [showHistory])

  const runSingleStyle = async (styleId: string) => {
    const style = DEMO_STYLE_LIBRARY[styleId] || STYLE_OPTIONS[0]
    const needCharacter = wantCharacter || wantColoring || wantColor // 캐릭터는 도안/컬러의 전제
    const needColoring = wantColoring || wantColor // 흑백은 컬러의 전제

    let characterBase64 = ''
    let coloringBase64 = ''

    // 1) 캐릭터 (도안/컬러 선택 시에도 필수)
    if (needCharacter) {
      setProgress(`${style.name} 캐릭터 생성 중...`)
      const charRes = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'character',
          style: style.id,
          featuresText,
          ratioOverride: ratioText,
          extraDetail: effectiveExtraDetail,
          lineArtOnly,
        }),
      })
      const charData = (await charRes.json()) as GenerateCharacterResponse
      if (!charRes.ok) throw new Error(charData.error || `${style.name} 캐릭터 생성 실패`)
      characterBase64 = charData.characterBase64

      if (wantCharacter) {
        updateResults((prev) => ({
          ...prev,
          [style.id]: {
            ...prev[style.id],
            characterBase64,
            characterImageUrl: charData.characterImageUrl,
          },
        }))
      }
    }

    // 2) 흑백/라인도안 (컬러 선택 시에도 필수)
    if (needColoring && characterBase64) {
      setProgress(`${style.name} 흑백 도안 생성 중...`)
      const dollRes = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'paperdoll',
          style: style.id,
          characterBase64,
          characterMime: 'image/png',
          ratioOverride: ratioText,
          extraDetail: effectiveExtraDetail,
          lineArtOnly,
          themeId: selectedThemes[0] || '',
        }),
      })
      const dollData = (await dollRes.json()) as GeneratePaperdollResponse
      if (!dollRes.ok) throw new Error(dollData.error || `${style.name} 도안 생성 실패`)
      coloringBase64 = dollData.coloringBase64

      if (wantColoring) {
        updateResults((prev) => ({
          ...prev,
          [style.id]: {
            ...prev[style.id],
            coloringBase64,
            coloringImageUrl: dollData.coloringImageUrl,
          },
        }))
      }
    }

    // 3) 컬러
    if (wantColor && coloringBase64) {
      setProgress(`${style.name} 컬러 도안 생성 중...`)
      const colorRes = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'color',
          style: style.id,
          coloringBase64,
          ratioOverride: ratioText,
          extraDetail: effectiveExtraDetail,
          colorPreset,
        }),
      })
      const colorData = (await colorRes.json()) as GenerateColorResponse
      if (!colorRes.ok) throw new Error(colorData.error || `${style.name} 컬러 생성 실패`)

      updateResults((prev) => ({
        ...prev,
        [style.id]: {
          ...prev[style.id],
          colorBase64: colorData.colorBase64,
          colorImageUrl: colorData.colorImageUrl,
        },
      }))
    }

    // 초기 결과 없으면 빈 슬롯이라도 넣어줘야 탭이 보임
    updateResults((prev) => ({
      ...prev,
      [style.id]: prev[style.id] || { characterImageUrl: '' },
    }))
  }

  const handleGenerate = async () => {
    if (!featuresText.trim()) {
      alert('먼저 사진 업로드 후 특징 추출을 완료해주세요.')
      return
    }
    if (selectedStyles.length === 0) {
      alert('최소 1개 스타일을 선택해주세요.')
      return
    }
    if (selectedOutputs.length === 0) {
      alert('최소 1개 출력 단계를 선택해주세요.')
      return
    }

    setGenerating(true)
    setStep(2)
    updateResults(() => ({}))

    try {
      for (const styleId of selectedStyles) {
        await runSingleStyle(styleId)
      }
      // 히스토리에 저장
      try {
        const historyEntry = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          featuresText: featuresText.substring(0, 200),
          styles: selectedStyles,
          outputs: selectedOutputs,
          themes: selectedThemes,
          results: Object.fromEntries(
            Object.entries(resultsRef.current).map(([k, v]) => [k, {
              characterImageUrl: (v as Record<string, string>)?.characterImageUrl || '',
              coloringImageUrl: (v as Record<string, string>)?.coloringImageUrl || '',
              colorImageUrl: (v as Record<string, string>)?.colorImageUrl || '',
            }])
          ),
        }
        const prev = JSON.parse(localStorage.getItem('paperdolly-history') || '[]')
        prev.unshift(historyEntry)
        localStorage.setItem('paperdolly-history', JSON.stringify(prev.slice(0, 50)))
      } catch { /* localStorage full or unavailable */ }

      setStep(3)
      setActiveStyle(selectedStyles[0] || 'sd')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '다시 시도해주세요'
      alert(`생성 실패: ${msg}`)
      setStep(1)
    } finally {
      setGenerating(false)
      setProgress('')
    }
  }

  const downloadDataAs = (base64?: string, filename = 'file.png') => {
    if (!base64) return
    const a = document.createElement('a')
    a.href = `data:image/png;base64,${base64}`
    a.download = filename
    a.click()
  }

  const downloadPDF = async (imgDataUrl: string, filename: string) => {
    if (!imgDataUrl) return

    const img = new Image()
    img.src = imgDataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('이미지 로드 실패'))
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const ratio = Math.min(190 / img.width, 277 / img.height)
    const w = img.width * ratio
    const h = img.height * ratio
    pdf.addImage(imgDataUrl, 'PNG', (210 - w) / 2, (297 - h) / 2, w, h)
    pdf.save(`${filename}.pdf`)
  }

  const hasData = Object.keys(results).length > 0
  const activeResult = results[activeStyle]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl md:text-3xl font-black text-center mb-3">🧪 로그인 없이 데모 테스트</h1>
        <p className="text-center text-gray-500 text-sm md:text-base mb-8">
          로그인 없이 바로 접근 가능한 기능 테스트 페이지입니다. 스타일·비율·컬러 깊이를 바꿔가며 즉시 검증하세요.
        </p>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <h2 className="text-lg font-bold">1) 사진 업로드 & 특징 추출</h2>

            <details className="border border-violet-200 rounded-xl bg-violet-50 p-3 text-sm text-gray-700">
              <summary className="cursor-pointer font-bold text-violet-800">데모 전용: 업로드/특징 추출 기본 로직 보기</summary>
              <div className="mt-3 space-y-2 text-xs md:text-sm text-gray-700">
                <p className="font-semibold text-gray-900">요청되는 분석 프롬프트(원문)</p>
                <pre className="bg-white/80 border border-violet-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{DEMO_ANALYZE_PROMPT_TEXT}</pre>
                <p className="font-semibold text-gray-900">핵심 처리 로직</p>
                <pre className="bg-white/80 border border-violet-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{DEMO_PIPELINE_TEXT}</pre>
              </div>
            </details>

            <div
              className="border-2 border-dashed border-pink-200 rounded-2xl p-6 text-center hover:border-pink-400 transition"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('demo-photo-input')?.click()}
            >
              {photoPreview ? (
                <div>
                  <img src={photoPreview} alt="업로드 이미지" className="max-h-56 mx-auto rounded-xl" />
                  <p className="text-xs text-gray-400 mt-2">클릭/드래그/붙여넣기(Ctrl+V)로 교체 가능</p>
                </div>
              ) : (
                <div>
                  <div className="text-5xl">📷</div>
                  <p className="mt-2 text-gray-600 font-medium">사진을 올려주세요</p>
                  <p className="text-sm text-gray-400 mt-1">정면 정지 사진이 가장 안정적입니다</p>
                </div>
              )}
              <input
                id="demo-photo-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            {analyzing && <p className="text-sm text-purple-600">🔍 AI가 특징을 분석 중입니다...</p>}

            <label className="block text-sm font-semibold text-gray-700">특징 요약 (수정 가능)</label>
            <textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              className="w-full h-28 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
              placeholder="이미지 분석 전까지는 비워둬도 됩니다"
            />

            <div>
              <h3 className="font-bold text-gray-700 mb-2">테마 프리셋 (기본: 공주님)</h3>
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map((theme) => {
                  const checked = selectedThemes.includes(theme.id)
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => toggleTheme(theme.id)}
                      className={`px-3 py-1.5 rounded-full border text-sm text-left ${
                        checked
                          ? 'bg-fuchsia-500 text-white border-fuchsia-500'
                          : 'bg-white text-gray-700 border-gray-300'
                      }`}
                      title={theme.description}
                    >
                      {theme.name}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">선택한 테마는 생성 프롬프트에 우선 반영되어 캐릭터/도안 특징 보정을 강화합니다.</p>
            </div>

            <div>
              <h3 className="font-bold text-gray-700 mb-2">튜닝 옵션</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-500">스타일</span>
                    <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('lineart')}
                        className={`px-3 py-1 rounded-md transition font-medium ${previewTab === 'lineart' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        ✏️ 도안
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('color')}
                        className={`px-3 py-1 rounded-md transition font-medium ${previewTab === 'color' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        🎨 컬러
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {STYLE_OPTIONS.map((s) => {
                      const checked = selectedStyles.includes(s.id)
                      const imgId = s.id === 'kawaiiMax' ? 'kawaiimax' : s.id
                      const imgSrc = previewTab === 'color'
                        ? `/previews/color/preview-${imgId}.png`
                        : `/previews/preview-${imgId}.png`
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleStyle(s.id)}
                          className={`relative rounded-xl border-2 p-1 text-center transition ${
                            checked ? 'border-purple-500 bg-purple-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          {checked && <span className="absolute top-1 right-1 text-purple-500 text-xs">✓</span>}
                          <img
                            src={imgSrc}
                            alt={s.name}
                            className="w-full aspect-[3/4] object-cover rounded-lg"
                          />
                          <p className={`text-xs mt-1 font-semibold ${checked ? 'text-purple-700' : 'text-gray-600'}`}>
                            {s.name}
                          </p>
                          <p className="text-[10px] text-gray-400">{s.ratioDisplay}</p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="text-sm text-gray-500 mt-3 mb-1">출력 단계</div>
                  <div className="flex flex-wrap gap-2">
                    {OUTPUT_OPTIONS.map((o) => {
                      const checked = selectedOutputs.includes(o.id)
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOutput(o.id)}
                          className={`px-3 py-1.5 rounded-full border text-sm ${
                            checked ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          {o.emoji} {o.name}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">컬러 선택 시 캐릭터+흑백도 자동 생성됩니다 (전제 의존)</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">비율 방식</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={ratioMode}
                        onChange={(e) => setRatioMode(e.target.value as 'auto' | 'custom')}
                        className="border border-gray-300 rounded-lg px-2 py-1.5"
                      >
                        <option value="auto">스타일 기본값 사용</option>
                        <option value="custom">수동 비율 강제</option>
                      </select>
                      <input
                        type="text"
                        value={ratioCustom}
                        onChange={(e) => setRatioCustom(e.target.value)}
                        placeholder="예: 5-head-tall"
                        disabled={ratioMode !== 'custom'}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </div>
                    <details className="text-xs border border-gray-100 rounded-lg p-2 bg-gray-50 mt-1">
                      <summary className="cursor-pointer font-semibold text-gray-600">비율 강제 예시 (3등신 vs 6등신)</summary>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <img src="/examples/example-ratio-3head.png" alt="3등신" className="w-full rounded-lg border" />
                          <p className="text-center mt-1 text-gray-500">3-head-tall (SD 기본)</p>
                        </div>
                        <div>
                          <img src="/examples/example-ratio-6head.png" alt="6등신" className="w-full rounded-lg border" />
                          <p className="text-center mt-1 text-gray-500">6-head-tall (강제 변경)</p>
                        </div>
                      </div>
                      <p className="text-gray-400 mt-1">입력 형식: <code className="bg-gray-100 px-1 rounded">N-head-tall</code> (예: 3-head-tall, 5-head-tall, 7-head-tall)</p>
                    </details>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={lineArtOnly}
                      onChange={(e) => setLineArtOnly(e.target.checked)}
                    />
                    흑백 버전을 라인아트 모드로 생성
                  </label>
                  <details className="text-xs border border-gray-100 rounded-lg p-2 bg-gray-50">
                    <summary className="cursor-pointer font-semibold text-gray-600">라인아트 ON/OFF 비교 예시</summary>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <img src="/examples/example-lineart-on.png" alt="라인아트 ON" className="w-full rounded-lg border" />
                        <p className="text-center mt-1 text-gray-500">✅ ON: 순수 흑백 선화</p>
                      </div>
                      <div>
                        <img src="/examples/example-lineart-off.png" alt="라인아트 OFF" className="w-full rounded-lg border" />
                        <p className="text-center mt-1 text-gray-500">⬜ OFF: 선화+음영 혼합</p>
                      </div>
                    </div>
                  </details>

                  <div>
                    <div className="text-sm text-gray-500 mb-1">컬러 강도</div>
                    <select
                      value={colorPreset}
                      onChange={(e) => setColorPreset(e.target.value as ColorPreset)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5"
                    >
                      <option value="soft">소프트</option>
                      <option value="balanced">밸런스</option>
                      <option value="bold">볼드</option>
                    </select>
                  </div>
                </div>
              </div>

              <label className="block text-sm text-gray-500 mt-3 mb-1">추가 제약/프롬프트 (옵션)</label>
              <textarea
                value={extraDetail}
                onChange={(e) => setExtraDetail(e.target.value)}
                placeholder="예: 배경은 완전 흰색, 선 두께 2px, 손끝 디테일 강화"
                className="w-full h-16 border border-gray-200 rounded-lg p-2 text-sm"
              />
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-sm text-purple-800">
              <p className="font-semibold mb-1">📊 예상 생성 수량</p>
              <p>
                스타일 <span className="font-bold">{selectedStyles.length}개</span>
                {' × '}출력 <span className="font-bold">{selectedOutputs.length}단계</span>
                {' = '}총 <span className="font-black text-lg">{estimatedImageCount}장</span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-purple-600">
                {selectedStyleNames.map((name) => (
                  <span key={name}>
                    {name}: {selectedOutputs.map((o) => OUTPUT_OPTIONS.find((x) => x.id === o)?.name).filter(Boolean).join(' → ')}
                  </span>
                ))}
              </div>
              {selectedOutputs.length === 0 && (
                <p className="text-xs text-red-500 mt-1">⚠️ 출력 단계를 1개 이상 선택해주세요</p>
              )}
            </div>

            <details className="border rounded-xl border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <summary className="cursor-pointer font-semibold">스타일별 생성 로직 빠르게 보기</summary>
              <div className="mt-2 space-y-3">
                {STYLE_OPTIONS.map((style) => (
                  <div key={style.id} className="border border-gray-100 rounded-lg p-3 bg-white/80">
                    <p className="font-bold text-sm">{style.name} ({style.ratioDisplay})</p>
                    <p className="text-xs text-gray-700 mt-1">{style.descKr}</p>
                    <p className="text-xs text-purple-700 mt-1 font-medium">톤 요약: {style.toneKr}</p>
                    <p className="text-xs text-gray-500 mt-1">의상: {style.outfits.map((o) => o.name).join(' · ')}</p>
                    <div className="mt-1">
                      <p className="text-xs text-gray-500 font-medium">강제 규칙 ({style.strictRulesKr.length}개):</p>
                      <ul className="text-xs text-gray-400 list-disc list-inside ml-1">
                        {style.strictRulesKr.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}
                        {style.strictRulesKr.length > 4 && <li>외 {style.strictRulesKr.length - 4}개...</li>}
                      </ul>
                    </div>
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer">AI 프롬프트 전문 보기 (영어)</summary>
                      <pre className="text-[10px] text-gray-400 mt-1 whitespace-pre-wrap bg-gray-50 rounded p-2 max-h-48 overflow-y-auto">{style.tone}</pre>
                    </details>
                  </div>
                ))}
              </div>
            </details>

            <button
              disabled={analyzing || generating || !featuresText.trim() || selectedOutputs.length === 0}
              onClick={handleGenerate}
              className={`w-full py-3 rounded-xl font-bold text-white transition ${
                analyzing || generating || !featuresText.trim() || selectedOutputs.length === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:shadow'
              }`}
            >
              {generating ? '생성 중...' : '데모 생성 시작'}
            </button>

            {progress && <p className="text-sm text-gray-600">{progress}</p>}
          </section>

          <section className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">2) 실시간 결과</h2>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                초기화
              </button>
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStyle(s.id)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      activeStyle === s.id ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {hasData ? (
                <>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    {[
                      { id: 'character' as const, label: '캐릭터' },
                      { id: 'coloring' as const, label: '흑백' },
                      { id: 'color' as const, label: '컬러' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setViewMode(tab.id)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          viewMode === tab.id
                            ? tab.id === 'color' ? 'bg-purple-500 text-white' : 'bg-gray-800 text-white'
                            : 'bg-gray-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeResult ? (
                    <>
                      <img
                        src={
                          viewMode === 'character'
                            ? activeResult.characterImageUrl
                            : viewMode === 'color'
                              ? activeResult.colorImageUrl || ''
                              : activeResult.coloringImageUrl || ''
                        }
                        alt="result"
                        className="w-full border rounded-xl bg-gray-50"
                      />

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          onClick={() => {
                            if (!activeResult.characterBase64) return
                            downloadDataAs(activeResult.characterBase64, `demo-${activeStyle}-character.png`)
                          }}
                          className="border rounded-lg py-2 text-sm"
                        >
                          캐릭터 PNG
                        </button>
                        <button
                          onClick={() => downloadDataAs(activeResult.coloringBase64, `demo-${activeStyle}-coloring.png`)}
                          className="border rounded-lg py-2 text-sm"
                        >
                          흑백 PNG
                        </button>
                        <button
                          onClick={() => {
                            if (!activeResult.colorBase64) return
                            downloadDataAs(activeResult.colorBase64, `demo-${activeStyle}-color.png`)
                          }}
                          className="border rounded-lg py-2 text-sm"
                        >
                          컬러 PNG
                        </button>
                        <button
                          onClick={() =>
                            downloadPDF(
                              activeResult.coloringImageUrl || '',
                              `demo-${activeStyle}-coloring-pdf`
                            )
                          }
                          className="border rounded-lg py-2 text-sm"
                        >
                          흑백 PDF
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400">선택한 스타일의 결과를 기다리는 중...</div>
                  )}
                </>
              ) : (
                <p className="text-gray-400 text-sm text-center py-16">
                  아직 결과가 없습니다. 먼저 사진을 넣고 생성해 주세요.
                </p>
              )}
            </div>

            <div className="mt-6 text-xs text-gray-400">단계: {step} / 생성 완료 시 3단계</div>
          </section>
        </div>
      </div>

      {/* 히스토리 토글 버튼 */}
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-purple-600 hover:text-purple-800 underline"
        >
          {showHistory ? '히스토리 닫기' : `📋 생성 히스토리 보기`}
        </button>
      </div>

      {/* 히스토리 패널 */}
      {showHistory && (
        <div className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-700">생성 히스토리 (최근 50건)</h3>
            <button
              type="button"
              onClick={() => {
                if (confirm('전체 히스토리를 삭제하시겠습니까?')) {
                  localStorage.removeItem('paperdolly-history')
                  setHistory([])
                }
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              전체 삭제
            </button>
          </div>
          {history.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">아직 생성 기록이 없습니다.</p>
          )}
          {history.map((h: { id: string; date: string; featuresText: string; styles: string[]; outputs: string[]; themes: string[]; results: Record<string, { characterImageUrl?: string; coloringImageUrl?: string; colorImageUrl?: string }> }) => (
            <div key={h.id} className="border rounded-xl p-4 bg-white">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xs text-gray-400">
                    {new Date(h.date).toLocaleString('ko-KR')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    스타일: {h.styles?.join(', ')} | 출력: {h.outputs?.join(', ')} | 테마: {h.themes?.join(', ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = history.filter((x: { id: string }) => x.id !== h.id)
                    localStorage.setItem('paperdolly-history', JSON.stringify(updated))
                    setHistory(updated)
                  }}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  삭제
                </button>
              </div>
              <p className="text-xs text-gray-600 mb-2 line-clamp-2">{h.featuresText}</p>
              <div className="flex gap-2 overflow-x-auto">
                {h.results && Object.entries(h.results).map(([styleId, r]) => (
                  <div key={styleId} className="flex-shrink-0">
                    <p className="text-[10px] text-gray-400 text-center mb-1">{styleId}</p>
                    <div className="flex gap-1">
                      {r?.characterImageUrl && (
                        <img src={r.characterImageUrl} alt="캐릭터" className="w-16 h-20 object-cover rounded border" />
                      )}
                      {r?.coloringImageUrl && (
                        <img src={r.coloringImageUrl} alt="도안" className="w-16 h-20 object-cover rounded border" />
                      )}
                      {r?.colorImageUrl && (
                        <img src={r.colorImageUrl} alt="컬러" className="w-16 h-20 object-cover rounded border" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
