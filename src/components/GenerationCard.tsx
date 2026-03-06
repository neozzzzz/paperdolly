'use client'

import { useState } from 'react'

type Generation = {
  id: string
  features: string
  style: string
  color_url: string | null
  coloring_url: string
  created_at: string
}

export default function GenerationCard({ gen }: { gen: Generation }) {
  const [popupImage, setPopupImage] = useState<string | null>(null)

  const handlePrint = async () => {
    if (!popupImage) return
    try {
      const res = await fetch(popupImage)
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

  const baseStyle = gen.style.includes(':') ? gen.style.split(':')[0] : gen.style
  const themeName = gen.style.includes(':') ? gen.style.split(':')[1] : ''
  const baseName = baseStyle === 'sd' ? 'SD' : baseStyle === 'simple' ? '심플' : baseStyle === 'fashion' ? '패션' : baseStyle
  const styleLabel = themeName ? `${baseName} · ${themeName}` : baseName

  return (
    <>
      <div className="border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition">
        <div className="aspect-[3/4] relative bg-gray-50 cursor-pointer" onClick={() => setPopupImage(gen.color_url || gen.coloring_url)}>
          <img src={gen.color_url || gen.coloring_url} alt="도안" className="w-full h-full object-contain" />
        </div>
        <div className="p-3">
          <p className="text-sm text-gray-700 truncate">{gen.features}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              {new Date(gen.created_at).toLocaleDateString('ko-KR')}
            </span>
            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-600 rounded-full">{styleLabel}</span>
          </div>
          <div className="flex gap-2 mt-2">
            {gen.coloring_url && (
              <button onClick={() => setPopupImage(gen.coloring_url)} className="text-xs text-gray-500 hover:text-gray-800">✏️ 흑백</button>
            )}
            {gen.color_url && (
              <button onClick={() => setPopupImage(gen.color_url)} className="text-xs text-purple-500 hover:text-purple-700">🎨 컬러</button>
            )}
          </div>
        </div>
      </div>

      {/* 팝업 */}
      {popupImage && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPopupImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPopupImage(null)}
              className="absolute -top-3 -right-3 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-pink-500 transition z-10 text-xl font-bold">
              ✕
            </button>
            <img src={popupImage} alt="도안 크게 보기" className="max-h-[80vh] w-auto mx-auto object-contain rounded-xl" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              {gen.coloring_url && (
                <button onClick={() => setPopupImage(gen.coloring_url)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${popupImage === gen.coloring_url ? 'bg-gray-800 text-white' : 'bg-white/90 text-gray-700 hover:bg-white'}`}>
                  ✏️ 흑백
                </button>
              )}
              {gen.color_url && (
                <button onClick={() => setPopupImage(gen.color_url)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${popupImage === gen.color_url ? 'bg-pink-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-white'}`}>
                  🎨 컬러
                </button>
              )}
              <button onClick={async () => {
                  if (!popupImage) return
                  try {
                    const res = await fetch(popupImage)
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `도안.png`
                    document.body.appendChild(a); a.click()
                    document.body.removeChild(a); URL.revokeObjectURL(url)
                  } catch { alert('다운로드 실패') }
                }}
                className="px-4 py-2 rounded-full text-sm font-medium bg-white/90 text-gray-700 hover:bg-white transition">
                📥 다운로드
              </button>
              <button onClick={handlePrint}
                className="px-4 py-2 rounded-full text-sm font-medium bg-white/90 text-gray-700 hover:bg-white transition">
                🖨️ 인쇄
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
