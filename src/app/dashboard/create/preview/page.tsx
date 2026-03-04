'use client'

import { useState } from 'react'
import Header from '@/components/Header'

export default function PreviewPage() {
  const [viewMode, setViewMode] = useState<'color' | 'coloring'>('color')
  const [popupImage, setPopupImage] = useState<string | null>(null)

  // 더미 데이터
  const dummyColor = '/previews/color/preview-simple.png'
  const dummyColoring = '/previews/preview-simple.png'
  const currentImage = viewMode === 'color' ? dummyColor : dummyColoring

  const handlePrint = () => alert('🖨️ 인쇄 다이얼로그 (더미)')
  const handleDownloadPNG = () => alert('📥 PNG 다운로드 (더미)')
  const handleDownloadPDF = () => alert('📄 PDF 다운로드 (더미)')
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: '페이퍼돌리 도안', text: '내가 만든 종이인형 도안이야!', url: window.location.href })
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(window.location.href)
      alert('링크가 복사됐어요! 📋')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">✂️</div>
          <h1 className="text-2xl font-bold">도안이 완성됐어요!</h1>
          <p className="text-gray-500 text-sm mt-1">🐾 동물친구 · ✏️ 심플</p>
        </div>

        {/* 도안 이미지 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          <div className="cursor-pointer hover:opacity-95 transition" onClick={() => setPopupImage(currentImage)}>
            <img src={currentImage} alt="도안" className="w-full" />
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

        {/* 주요 액션 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">저장 & 인쇄</div>
          <div className="space-y-2">
            <button onClick={handlePrint}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold hover:shadow-lg transition">
              <span className="text-xl">🖨️</span>
              <div className="text-left">
                <div>바로 인쇄하기</div>
                <div className="text-xs font-normal text-pink-100">A4 용지에 맞춰 인쇄돼요</div>
              </div>
            </button>
            <button onClick={handleDownloadPNG}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
              <span className="text-xl">📥</span>
              <div className="text-left">
                <div>이미지 저장 (PNG)</div>
                <div className="text-xs text-gray-400">{viewMode === 'color' ? '컬러' : '흑백'} 버전 · 고화질 원본</div>
              </div>
            </button>
            <button onClick={handleDownloadPDF}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition">
              <span className="text-xl">📄</span>
              <div className="text-left">
                <div>PDF 저장 (A4)</div>
                <div className="text-xs text-gray-400">{viewMode === 'color' ? '컬러' : '흑백'} 버전 · 인쇄 최적화</div>
              </div>
            </button>
            <button onClick={handleShare}
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
            <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-purple-200 text-purple-700 font-medium hover:bg-purple-50 transition">
              <span className="text-xl">🎭</span>
              <div className="text-left">
                <div>같은 캐릭터, 다른 테마</div>
                <div className="text-xs text-purple-400">캐릭터는 유지하고 의상만 바꿔요</div>
              </div>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition">
              <span className="text-xl">✨</span>
              <div className="text-left">
                <div>새 캐릭터로 처음부터</div>
                <div className="text-xs text-gray-400">다른 사진으로 새로 만들기</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 팝업 */}
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
                📥 다운로드
              </button>
              <button onClick={handlePrint}
                className="px-5 py-2 rounded-full text-sm font-medium bg-white/90 text-gray-700 hover:bg-white transition">
                🖨️ 인쇄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
