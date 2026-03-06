/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

type Generation = {
  id: string
  style: string
  coloring_url: string
  color_url: string | null
  created_at: string
}

export default function GalleryPage() {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [viewImage, setViewImage] = useState<string | null>(null)

  const fetchGallery = async () => {
    const res = await fetch('/api/gallery')
    if (res.ok) {
      const data = await res.json()
      setGenerations(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchGallery()
  }, [])

  const getBaseStyle = (s: string) => s.includes(':') ? s.split(':')[0] : s
  const getThemeName = (s: string) => s.includes(':') ? s.split(':')[1] : ''
  const filtered = filter === 'all' ? generations : generations.filter(g => getBaseStyle(g.style) === filter)

  const styleLabel = (s: string) => {
    const base = getBaseStyle(s)
    const theme = getThemeName(s)
    const baseName = base === 'sd' ? 'SD' : base === 'simple' ? '심플' : '패션'
    return theme ? `${baseName} · ${theme}` : baseName
  }
  const styleColor = (s: string) => {
    const base = getBaseStyle(s)
    return base === 'sd' ? 'bg-pink-100 text-pink-600' : base === 'simple' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header basePath="" />

      <div className="max-w-6xl mx-auto px-4 py-10 flex-1">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">🎨 도안 갤러리</h1>
          <p className="text-gray-500">다른 사용자들이 만든 도안을 구경해보세요</p>
        </div>

        {/* 필터 */}
        <div className="flex justify-center gap-2 mb-8">
          {[
            { id: 'all', label: '전체' },
            { id: 'sd', label: '🧸 SD 귀여운' },
            { id: 'simple', label: '✏️ 심플' },
            { id: 'fashion', label: '👗 패션' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                filter === f.id
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-pink-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin text-4xl mb-4">🎨</div>
            <p className="text-gray-400">로딩 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🖼️</div>
            <p className="text-gray-400">아직 공유된 도안이 없어요</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((gen) => (
              <div
                key={gen.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition cursor-pointer group"
                onClick={() => setViewImage(gen.color_url || gen.coloring_url)}
              >
                <div className="aspect-[3/4] relative bg-gray-50 overflow-hidden">
                  <img
                    src={gen.color_url || gen.coloring_url}
                    alt="도안"
                    className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {new Date(gen.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${styleColor(gen.style)}`}>
                      {styleLabel(gen.style)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 이미지 뷰어 모달 */}
      {viewImage && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setViewImage(null)}
        >
          <div className="max-w-2xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img src={viewImage} alt="도안" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <button
              onClick={() => setViewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <Footer  />
    </div>
  )
}
