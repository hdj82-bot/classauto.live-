import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* 네비게이션 */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
              IFL
            </span>
            <span className="text-sm font-semibold text-gray-900">IFL Platform</span>
          </div>
          <Link
            href="/auth/login"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition"
          >
            시작하기
          </Link>
        </div>
      </header>

      {/* 히어로 */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
          AI로 만드는<br />
          <span className="text-indigo-600">인터랙티브 플립드 러닝</span>
        </h1>
        <p className="mt-6 text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
          PPT만 업로드하면 AI가 강의 영상, 스크립트, 평가 문제를 자동 생성합니다.
          학생의 집중도를 실시간 추적하고, RAG 기반 Q&A로 학습 효과를 극대화하세요.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/login"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-8 py-3.5 text-sm font-semibold transition shadow-lg shadow-indigo-200"
          >
            무료로 시작하기
          </Link>
          <a
            href="#features"
            className="border border-gray-300 hover:border-gray-400 text-gray-700 rounded-xl px-8 py-3.5 text-sm font-semibold transition"
          >
            기능 살펴보기
          </a>
        </div>
      </section>

      {/* 기능 소개 */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4">
            왜 IFL Platform인가요?
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            교수자와 학습자 모두에게 최적화된 플립드 러닝 경험을 제공합니다
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "AI 영상 자동 생성",
                desc: "PPT를 업로드하면 AI 아바타가 스크립트를 읽어 강의 영상을 자동 생성합니다.",
                icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
              },
              {
                title: "RAG 기반 Q&A",
                desc: "강의 자료를 임베딩하여 학생의 질문에 정확한 컨텍스트 기반 답변을 제공합니다.",
                icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
              },
              {
                title: "실시간 집중도 추적",
                desc: "학습자의 시청 진행도와 응답률을 실시간 모니터링하고, 무반응 시 경고합니다.",
                icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
              },
              {
                title: "자동 평가 시스템",
                desc: "AI가 강의 내용 기반으로 형성평가/총괄평가 문제를 자동 출제하고 채점합니다.",
                icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
              },
              {
                title: "학습 분석 대시보드",
                desc: "출석률, 정답률, 참여도, 비용까지 한눈에 파악하는 교수자 전용 대시보드.",
                icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
              },
              {
                title: "다국어 번역 지원",
                desc: "스크립트를 다국어로 자동 번역하여 유학생도 모국어로 학습할 수 있습니다.",
                icon: "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                  <svg
                    className="w-5 h-5 text-indigo-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={f.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 플로우 설명 */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-12">
            3단계로 시작하는 플립드 러닝
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "PPT 업로드", desc: "기존 강의 자료를 그대로 업로드하세요" },
              { step: "2", title: "AI 스크립트 편집", desc: "AI가 생성한 스크립트를 검토하고 승인하세요" },
              { step: "3", title: "학생에게 공유", desc: "영상 링크를 공유하면 학습 분석이 자동으로 시작됩니다" },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center">
                <span className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold mb-4">
                  {s.step}
                </span>
                <h3 className="font-semibold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            지금 바로 시작하세요
          </h2>
          <p className="text-indigo-200 mb-8">
            무료 플랜으로 월 2편의 강의 영상을 생성할 수 있습니다
          </p>
          <Link
            href="/auth/login"
            className="inline-block bg-white text-indigo-700 font-semibold rounded-xl px-8 py-3.5 text-sm hover:bg-indigo-50 transition shadow-lg"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-gray-400">
            &copy; 2025 IFL Platform — Interactive Flipped Learning. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
