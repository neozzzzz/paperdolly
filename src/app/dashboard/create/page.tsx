'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { jsPDF } from 'jspdf'

type Features = {
  gender: string; age: string; hair_style: string; face_shape: string;
  eyes: string; glasses: string | null; body_type: string;
  accessories: string; distinctive: string; summary: string;
}

type StyleResult = {
  coloringUrl: string
  colorUrl: string | null
}

type Outfit = { name: string; name_en: string; desc: string }
type Theme = {
  id: string; name: string; description: string; icon: string;
  outfits: Outfit[]; isFavorite: boolean;
}

export default function CreatePage() {
  const [step, setStep] = useState(1)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [features, setFeatures] = useState<Features | null>(null)
  const [featureText, setFeatureText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [characterUrl, setCharacterUrl] = useState<string | null>(null)
  const [characterBase64, setCharacterBase64] = useState<string | null>(null)
  const [timestamp, setTimestamp] = useState(0)
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<Record<string, StyleResult>>({})
  const [viewMode, setViewMode] = useState<'coloring' | 'color'>('color')
  const [waitingCharConfirm, setWaitingCharConfirm] = useState(false)

  // 테마
  const [themes, setThemes] = useState<Theme[]>([])
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null)
  const [showThemeStep, setShowThemeStep] = useState(false)

  const [isDragging, setIsDragging] = useState(false)
  const [popupImage, setPopupImage] = useState<string | null>(null)
  const [limitPopup, setLimitPopup] = useState(false)
  const [popupFilename, setPopupFilename] = useState<string>('')

  const openPopup = (url: string, filename: string) => {
    setPopupImage(url)
    setPopupFilename(filename)
  }

  const handleDownloadPNG = async () => {
    if (!popupImage) return
    try {
      const res = await fetch(popupImage)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${popupFilename}.png`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { alert('다운로드 실패') }
  }

  const handlePrint = async (imageUrl?: string) => {
    const target = imageUrl || popupImage
    if (!target) return
    try {
      const res = await fetch(target)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      document.body.appendChild(iframe)
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return
      doc.open()
      doc.write(`<html><head><style>@media print{@page{margin:10mm}body{margin:0}}body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:white}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${blobUrl}" /></body></html>`)
      doc.close()
      const img = doc.querySelector('img')
      if (img) {
        img.onload = () => {
          iframe.contentWindow?.print()
          setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl) }, 1000)
        }
      }
    } catch { alert('인쇄 준비 실패') }
  }

  // 테마 로드
  useEffect(() => {
    fetch('/api/themes').then(r => r.json()).then(d => {
      if (d.themes) setThemes(d.themes)
    }).catch(() => {})
  }, [])

  // 즐겨찾기 토글
  const toggleFavorite = async (theme: Theme) => {
    const action = theme.isFavorite ? 'remove' : 'add'
    setThemes(prev => prev.map(t =>
      t.id === theme.id ? { ...t, isFavorite: !t.isFavorite } : t
    ))
    await fetch('/api/themes/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: theme.id, action }),
    })
  }

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      const res = await fetch('/api/analyze', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.features) {
        setFeatures(data.features)
        setFeatureText(data.features.summary)
      } else throw new Error(data.error)
    } catch (err: unknown) {
      alert('사진 분석 실패: ' + (err instanceof Error ? err.message : '다시 시도해주세요'))
    } finally { setAnalyzing(false) }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
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
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  // 캐릭터 생성
  const handleGenerateCharacter = async () => {
    if (!featureText.trim() && !features) return alert('사진을 먼저 업로드해주세요!')
    if (!selectedStyle) return alert('스타일을 선택해주세요!')
    setGenerating(true)
    setStep(2)
    const ts = Date.now()
    setTimestamp(ts)
    const featureData = features || { summary: featureText } as Features
    try {
      setProgress('🎨 캐릭터를 그리는 중...')
      const charRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'character', features: featureData, timestamp: ts }),
      })
      const charData = await charRes.json()
      if (!charRes.ok) {
        if (charData.error === 'daily_limit') { setLimitPopup(true); setStep(1); return }
        throw new Error(charData.error)
      }
      setCharacterUrl(charData.characterUrl)
      setCharacterBase64(charData.characterBase64)
      setWaitingCharConfirm(true)
    } catch (err: unknown) {
      alert('생성 실패: ' + (err instanceof Error ? err.message : '다시 시도해주세요'))
      setStep(1)
    } finally { setGenerating(false); setProgress('') }
  }

  const handleRetryCharacter = () => {
    setCharacterUrl(null); setCharacterBase64(null); setWaitingCharConfirm(false)
    handleGenerateCharacter()
  }

  // 캐릭터 확인 → 테마 선택 단계로
  const handleCharConfirm = () => {
    setWaitingCharConfirm(false)
    setShowThemeStep(true)
  }

  // 도안 + 컬러 생성
  const handleContinueGenerate = async () => {
    if (!selectedStyle || !characterBase64 || !selectedTheme) return
    setShowThemeStep(false)
    setGenerating(true)

    const featureData = features || { summary: featureText } as Features
    const styleNames: Record<string, string> = { sd: 'SD 귀여운', simple: '심플 일러스트', fashion: '패션 일러스트' }
    const styleName = styleNames[selectedStyle] || selectedStyle

    try {
      setProgress(`✏️ ${styleName} · ${selectedTheme.name} 도안 생성 중... (1/2)`)
      const dollRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'paperdoll', style: selectedStyle, characterBase64,
          features: featureData, timestamp, themeOutfits: selectedTheme.outfits,
        }),
      })
      const dollData = await dollRes.json()
      if (!dollRes.ok) throw new Error(dollData.error)

      setProgress(`🎨 ${styleName} · ${selectedTheme.name} 컬러링 중... (2/2)`)
      const colorRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'color', style: selectedStyle, coloringBase64: dollData.coloringBase64,
          timestamp, themeOutfits: selectedTheme.outfits,
        }),
      })
      const colorData = await colorRes.json()

      const newResults: Record<string, StyleResult> = {
        [selectedStyle]: {
          coloringUrl: dollData.coloringUrl,
          colorUrl: colorRes.ok ? colorData.colorUrl : null,
        },
      }
      setResults(newResults)

      fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: featureData.summary || featureText,
          style: `${selectedStyle}:${selectedTheme.name}`,
          coloringUrl: newResults[selectedStyle]?.coloringUrl,
          colorUrl: newResults[selectedStyle]?.colorUrl,
        }),
      }).catch(() => {})

      setStep(3)
    } catch (err: unknown) {
      alert('생성 실패: ' + (err instanceof Error ? err.message : '다시 시도해주세요'))
      setStep(1)
    } finally { setGenerating(false); setProgress('') }
  }

  const downloadPDF = async (imageUrl: string, filename: string) => {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const imgData = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const img = new Image()
      img.src = imgData
      await new Promise((resolve) => { img.onload = resolve })
      const ratio = Math.min(190 / img.width, 277 / img.height)
      const w = img.width * ratio, h = img.height * ratio
      pdf.addImage(imgData, 'PNG', (210 - w) / 2, (297 - h) / 2, w, h)
      pdf.save(`${filename}.pdf`)
    } catch { alert('PDF 생성 실패') }
  }

  const STYLES = [
    { id: 'sd', name: '🧸 SD 귀여운', desc: '2등신 · 아기자기한 스타일', image: '/icons/style-sd.png' },
    { id: 'simple', name: '✏️ 심플', desc: '4등신 · 깔끔한 일러스트', image: '/icons/style-simple.png' },
    { id: 'fashion', name: '👗 패션', desc: '6등신 · 세련된 스타일', image: '/icons/style-fashion.png' },
  ]

  const activeResult = selectedStyle ? results[selectedStyle] : null

  // 테마 정렬: 즐찾 먼저
  const sortedThemes = [...themes].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1
    if (!a.isFavorite && b.isFavorite) return 1
    return 0
  })

  const resetAll = () => {
    setStep(1); setResults({}); setFeatures(null); setFeatureText('')
    setPhoto(null); setPhotoPreview(null); setCharacterUrl(null); setCharacterBase64(null)
    setSelectedStyle(null); setWaitingCharConfirm(false); setShowThemeStep(false); setSelectedTheme(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* 프로그레스 바 */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {['사진 업로드', '캐릭터', '테마 선택', '완성!'].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="text-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs mx-auto ${
                  (step === 1 && i === 0) || (step === 2 && !showThemeStep && i <= 1) || (step === 2 && showThemeStep && i <= 2) || (step === 3 && i <= 3)
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}>{i + 1}</div>
                <div className="text-xs text-gray-400 mt-1">{label}</div>
              </div>
              {i < 3 && <div className={`w-6 h-1 rounded ${
                (step === 2 && !showThemeStep && i < 1) || (step === 2 && showThemeStep && i < 2) || (step === 3 && i < 3)
                  ? 'bg-pink-400' : 'bg-gray-200'
              }`} />}
            </div>
          ))}
        </div>

        {/* Step 1: 사진 업로드 + 스타일 선택 */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold mb-6 text-center">📸 사진 업로드</h2>

            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer mb-6 ${
                isDragging ? 'border-pink-500 bg-pink-50 scale-[1.02]' : 'border-pink-200 hover:border-pink-400'
              }`}
              onClick={() => document.getElementById('photo-input')?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {photoPreview ? (
                <div>
                  <img src={photoPreview} alt="업로드됨" className="max-h-56 mx-auto rounded-lg" />
                  {analyzing && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-pink-500">
                      <div className="text-lg animate-[search_1.5s_ease-in-out_infinite]">🔍</div>
                      <span className="text-sm font-medium">AI가 특징을 분석하는 중...</span>
                    </div>
                  )}
                  {!analyzing && features && (
                    <p className="mt-4 text-sm text-green-600 font-medium">✅ 특징 분석 완료!</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-5xl mb-3">{isDragging ? '📥' : '📷'}</div>
                  <p className="text-gray-600 font-medium text-lg">{isDragging ? '여기에 놓으세요!' : '사진을 올려주세요'}</p>
                  <p className="text-sm text-gray-400 mt-2">클릭, 드래그 앤 드롭, 또는 Ctrl+V 붙여넣기</p>
                  <p className="text-xs text-gray-300 mt-1">정면 전신 사진이 가장 좋아요 · 사진은 서버에 저장되지 않습니다</p>
                </>
              )}
              <input id="photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            {features && (
              <div className="bg-pink-50 rounded-xl p-4 mb-6">
                <div className="text-sm font-medium text-pink-600 mb-2">🔍 AI 분석 결과</div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  <div>👤 {features.gender}, {features.age}</div>
                  <div>💇 {features.hair_style}</div>
                  <div>😊 {features.face_shape}</div>
                  <div>👓 {features.glasses && features.glasses !== 'null' ? features.glasses : '착용안함'}</div>
                  <div>💍 {features.accessories && features.accessories !== 'null' ? features.accessories : '착용안함'}</div>
                </div>
                <textarea
                  value={featureText}
                  onChange={(e) => setFeatureText(e.target.value)}
                  className="w-full mt-3 p-3 border border-pink-200 rounded-lg text-sm resize-none h-20 focus:outline-none focus:border-pink-400"
                  placeholder="분석 결과를 수정할 수 있어요"
                />
              </div>
            )}

            {features && (
              <div className="mb-6">
                <div className="text-sm font-medium text-gray-700 mb-3">🎨 스타일을 선택해주세요</div>
                <div className="grid grid-cols-3 gap-3">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStyle(s.id)}
                      className={`p-3 rounded-xl border-2 text-center transition ${
                        selectedStyle === s.id
                          ? 'border-pink-500 bg-pink-50 shadow-md'
                          : 'border-gray-200 hover:border-pink-300 hover:bg-pink-50/50'
                      }`}
                    >
                      <img src={s.image} alt={s.name} className="w-full aspect-[3/4] object-contain rounded-lg mb-2" />
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateCharacter}
              disabled={analyzing || (!features && !featureText.trim()) || !selectedStyle}
              className={`w-full py-4 rounded-xl font-bold text-lg transition ${
                analyzing || (!features && !featureText.trim()) || !selectedStyle
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:shadow-lg'
              }`}
            >
              {analyzing ? '분석 중...' : !selectedStyle ? '스타일을 선택해주세요' : '✨ 캐릭터 만들기'}
            </button>
          </div>
        )}

        {/* Step 2: 캐릭터 확인 */}
        {step === 2 && waitingCharConfirm && characterUrl && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="text-5xl mb-4">🎨</div>
            <h2 className="text-xl font-bold mb-2">캐릭터가 완성됐어요!</h2>
            <p className="text-gray-500 mb-6 text-sm">마음에 드시면 다음 단계로 진행해주세요</p>
            <div className="border rounded-xl overflow-hidden mb-6 max-w-xs mx-auto">
              <img src={characterUrl} alt="캐릭터" className="w-full" />
            </div>
            <div className="flex gap-3 max-w-sm mx-auto">
              <button onClick={handleRetryCharacter}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition">
                🔄 다시 만들기
              </button>
              <button onClick={handleCharConfirm}
                className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-bold hover:shadow-lg transition">
                ✨ 다음: 테마 선택
              </button>
            </div>
          </div>
        )}

        {/* Step 2.5: 테마 선택 */}
        {step === 2 && showThemeStep && (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold mb-2 text-center">🎭 테마를 선택해주세요</h2>
            <p className="text-gray-500 text-sm text-center mb-6">어떤 의상을 입혀볼까요?</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {sortedThemes.map((theme) => (
                <div key={theme.id} className="relative">
                  <button
                    onClick={() => setSelectedTheme(theme)}
                    className={`w-full p-4 rounded-xl border-2 text-center transition ${
                      selectedTheme?.id === theme.id
                        ? 'border-pink-500 bg-pink-50 shadow-md'
                        : 'border-gray-200 hover:border-pink-300 hover:bg-pink-50/50'
                    }`}
                  >
                    <div className="text-3xl mb-2">{theme.icon}</div>
                    <div className="text-sm font-medium">{theme.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{theme.description}</div>
                    <div className="flex flex-wrap gap-1 mt-2 justify-center">
                      {theme.outfits.slice(0, 4).map((o, i) => (
                        <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{o.name}</span>
                      ))}
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(theme) }}
                    className="absolute top-2 right-2 text-lg hover:scale-125 transition"
                  >
                    {theme.isFavorite ? '⭐' : '☆'}
                  </button>
                </div>
              ))}
            </div>

            {selectedTheme && (
              <div className="bg-purple-50 rounded-xl p-4 mb-6">
                <div className="text-sm font-medium text-purple-600 mb-2">{selectedTheme.icon} {selectedTheme.name} 의상 구성</div>
                <div className="grid grid-cols-2 gap-2">
                  {selectedTheme.outfits.map((o, i) => (
                    <div key={i} className="text-sm text-gray-700 bg-white rounded-lg p-2">
                      <span className="font-medium">{o.name}</span>
                      <span className="text-gray-400 text-xs ml-1">({o.name_en})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowThemeStep(false); setWaitingCharConfirm(true) }}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition">
                ← 캐릭터로 돌아가기
              </button>
              <button
                onClick={handleContinueGenerate}
                disabled={!selectedTheme}
                className={`flex-1 py-3 rounded-xl font-bold transition ${
                  !selectedTheme
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:shadow-lg'
                }`}
              >
                ✨ 도안 만들기
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 생성 중 */}
        {step === 2 && !waitingCharConfirm && !showThemeStep && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="animate-pulse">
              <div className="text-5xl mb-4">🎨</div>
              <h2 className="text-xl font-bold mb-2">도안을 만들고 있어요!</h2>
              <p className="text-gray-600 mb-6">{progress}</p>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                <div className="bg-gradient-to-r from-pink-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: progress.includes('1/2') ? '50%' : '100%' }} />
              </div>
              <p className="text-sm text-gray-400">도안 → 컬러 = 총 2단계</p>
            </div>
          </div>
        )}

        {/* Step 3: 결과 */}
        {step === 3 && activeResult && (
          <div>
            {/* 헤더 */}
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">✂️</div>
              <h1 className="text-2xl font-bold">도안이 완성됐어요!</h1>
              {selectedTheme && (
                <p className="text-gray-500 text-sm mt-1">{selectedTheme.icon} {selectedTheme.name} · {STYLES.find(s => s.id === selectedStyle)?.name}</p>
              )}
            </div>

            {/* 도안 이미지 */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
              <div className="cursor-pointer hover:opacity-95 transition" onClick={() => {
                const url = viewMode === 'color' && activeResult.colorUrl ? activeResult.colorUrl : activeResult.coloringUrl
                openPopup(url, `도안-${selectedStyle}-${viewMode === 'color' ? '컬러' : '흑백'}`)
              }}>
                <img
                  src={viewMode === 'color' && activeResult.colorUrl ? activeResult.colorUrl : activeResult.coloringUrl}
                  alt="도안" className="w-full"
                />
              </div>
            </div>

            {/* 컬러/흑백 토글 */}
            <div className="flex justify-center gap-2 mb-8">
              <button onClick={() => setViewMode('color')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition ${
                  viewMode === 'color' ? 'bg-pink-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}>
                🎨 컬러
              </button>
              <button onClick={() => setViewMode('coloring')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition ${
                  viewMode === 'coloring' ? 'bg-gray-800 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}>
                ✏️ 흑백
              </button>
            </div>

            {/* 저장 & 인쇄 */}
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">저장 & 인쇄</div>
              <div className="space-y-2">
                <button onClick={() => {
                    const url = viewMode === 'color' && activeResult.colorUrl ? activeResult.colorUrl : activeResult.coloringUrl
                    handlePrint(url)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold hover:shadow-lg transition">
                  <span className="text-xl">🖨️</span>
                  <div className="text-left">
                    <div>바로 인쇄하기</div>
                    <div className="text-xs font-normal text-pink-100">A4 용지에 맞춰 인쇄돼요</div>
                  </div>
                </button>
                <button onClick={async () => {
                    const url = viewMode === 'color' && activeResult.colorUrl ? activeResult.colorUrl : activeResult.coloringUrl
                    try {
                      const res = await fetch(url)
                      const blob = await res.blob()
                      const blobUrl = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = blobUrl; a.download = `도안-${selectedStyle}-${viewMode === 'color' ? '컬러' : '흑백'}.png`
                      document.body.appendChild(a); a.click()
                      document.body.removeChild(a); URL.revokeObjectURL(blobUrl)
                    } catch { alert('다운로드 실패') }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
                  <span className="text-xl">📥</span>
                  <div className="text-left">
                    <div>이미지 저장 (PNG)</div>
                    <div className="text-xs text-gray-400">{viewMode === 'color' ? '컬러' : '흑백'} 버전 · 고화질 원본</div>
                  </div>
                </button>
                <button onClick={() => {
                    const url = viewMode === 'color' && activeResult.colorUrl ? activeResult.colorUrl : activeResult.coloringUrl
                    downloadPDF(url, `도안-${selectedStyle}-${viewMode === 'color' ? '컬러' : '흑백'}`)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
                  <span className="text-xl">📄</span>
                  <div className="text-left">
                    <div>PDF 저장 (A4)</div>
                    <div className="text-xs text-gray-400">{viewMode === 'color' ? '컬러' : '흑백'} 버전 · 인쇄 최적화</div>
                  </div>
                </button>
                <button onClick={async () => {
                    const url = viewMode === 'color' && activeResult.colorUrl ? activeResult.colorUrl : activeResult.coloringUrl
                    if (navigator.share) {
                      try {
                        const res = await fetch(url)
                        const blob = await res.blob()
                        const file = new File([blob], `도안.png`, { type: 'image/png' })
                        await navigator.share({ title: '페이퍼돌리 도안', text: '내가 만든 종이인형 도안이야!', files: [file] })
                      } catch { /* cancelled */ }
                    } else {
                      await navigator.clipboard.writeText(window.location.href)
                      alert('링크가 복사됐어요! 📋')
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
                  <span className="text-xl">📤</span>
                  <div className="text-left">
                    <div>공유하기</div>
                    <div className="text-xs text-gray-400">카톡, 인스타 등으로 공유</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 더 만들기 */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">더 만들기</div>
              <div className="space-y-2">
                <button onClick={() => { setStep(2); setShowThemeStep(true); setSelectedTheme(null); setResults({}) }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-purple-200 text-purple-700 font-medium hover:bg-purple-50 transition">
                  <span className="text-xl">🎭</span>
                  <div className="text-left">
                    <div>같은 캐릭터, 다른 테마</div>
                    <div className="text-xs text-purple-400">캐릭터는 유지하고 의상만 바꿔요</div>
                  </div>
                </button>
                <button onClick={resetAll}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition">
                  <span className="text-xl">✨</span>
                  <div className="text-left">
                    <div>새 캐릭터로 처음부터</div>
                    <div className="text-xs text-gray-400">다른 사진으로 새로 만들기</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 팝업 */}
      {popupImage && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPopupImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPopupImage(null)}
              className="absolute -top-3 -right-3 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-pink-500 transition z-10 text-xl font-bold">
              ✕
            </button>
            <img src={popupImage} alt="도안 크게 보기" className="max-h-[80vh] w-auto object-contain rounded-xl" />
            <div className="flex gap-3 mt-4">
              <button onClick={handleDownloadPNG}
                className="px-5 py-2 rounded-full text-sm font-medium bg-white/90 text-gray-700 hover:bg-white transition">
                📥 PNG 다운로드
              </button>
              <button onClick={() => downloadPDF(popupImage!, popupFilename)}
                className="px-5 py-2 rounded-full text-sm font-medium bg-white/90 text-gray-700 hover:bg-white transition">
                📄 PDF 다운로드
              </button>
              <button onClick={() => handlePrint()}
                className="px-5 py-2 rounded-full text-sm font-medium bg-white/90 text-gray-700 hover:bg-white transition">
                🖨️ 인쇄
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 사용 제한 팝업 */}
      {limitPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setLimitPopup(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-4">🎨</div>
            <h2 className="text-xl font-bold mb-2">오늘의 생성 횟수를 다 썼어요</h2>
            <p className="text-gray-500 text-sm mb-2">무료 계정은 하루 1회 생성할 수 있어요.</p>
            <p className="text-gray-400 text-xs mb-6">내일 다시 만들어보세요!</p>
            <button onClick={() => setLimitPopup(false)}
              className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-bold hover:shadow-lg transition">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
