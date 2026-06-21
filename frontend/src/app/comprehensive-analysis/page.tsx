"use client";

import Link from "next/link";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useI18n } from "@/contexts/I18nContext";

/**
 * `/comprehensive-analysis` — "종합분석" 홍보 쇼케이스 (껍데기).
 *
 * 학기 전체 분석(docs/planning/analytics-spec.md B블록 §3)을 잠재 사용자에게
 * 보여주기 위한 **정적 마케팅 페이지**다. 백엔드(/api/v1/analytics-pro/semester/*)
 * 와 연결하지 않고, 대표적인 결과물(주차별 추이·학기말 설문·응답 분포·학기 총평·
 * 논문 제안)을 고정 예시 데이터로 시연한다. 실제 교수자용 기능 화면은 별도
 * (`/professor/analytics-pro`)이며 이 페이지는 홍보용이다.
 *
 * 디자인: v2 라이트 베이지 + 골드(LightMarketingShell chrome). 의미색(빨강·녹색)은
 * 차트/등급 한정 사용. 데이터는 시연용 고정값.
 */

const W = 320;
const H = 120;

function poly(vals: number[]): string {
  const n = vals.length;
  return vals
    .map((v, i) => {
      const x = (i / (n - 1)) * W;
      const y = H - (v / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// 시연용 고정 추이(1주→14주, 우상향 — ClassAuto 도입 효과 가시화). locale 무관 수치.
const SERIES = {
  completion: [58, 62, 67, 71, 76, 80, 85, 90],
  understanding: [55, 58, 62, 66, 71, 75, 79, 83],
  engagement: [40, 46, 52, 58, 65, 71, 76, 80],
};

const SCALE_COLORS = ["#DC2626", "#F59E0B", "#FACC15", "#84CC16", "#16A34A"];

type Copy = typeof COPY.ko;

const COPY = {
  ko: {
    badge: "PREVIEW · 학기 종합분석",
    heroTitle: "학기 전체를, 한 장의 보고서로",
    heroBody:
      "10주차에 열리는 종합분석은 한 학기의 학습 데이터를 모아 추이·설문·총평·논문 방향까지 자동으로 정리합니다. 아래는 실제 결과물의 예시입니다.",
    heroCta: "베타 신청하기",
    heroNote: "※ 아래 화면은 시연용 예시 데이터입니다.",

    trendTitle: "주차별 학습효율 추이",
    trendSub: "1주 대비 상승폭으로 도입 효과를 한눈에",
    trendLegend: { completion: "완주율", understanding: "평균 이해도", engagement: "대면 참여도" },
    trendDelta: "1주 대비",

    surveyTitle: "학기말 설문 자동생성",
    surveySub: "문항마다 교수법 근거와 참고문헌(DOI)을 함께",
    surveyWarn:
      "⚠️ AI 생성물은 반드시 교수자 검토가 필요합니다. 특히 DOI는 실재 여부를 확인하세요.",
    surveyScale: "5점 리커트",
    surveyRationale: "설계 근거",
    surveyRef: "참고문헌",

    distTitle: "응답 결과 시각화",
    distSub: "문항별 5점 척도 분포와 평균",
    distAvg: "평균",

    reviewTitle: "학기 총평",
    reviewProBadge: "PRO",
    reviewSub: "교육공학 이론 렌즈로 본 장점·개선점, 그리고 논문 방향",
    reviewStrength: "강점",
    reviewWeakness: "보완점",
    reviewImprove: "개선 제안",
    paperTitle: "논문 제목·방향 제안",
    paperDirection: "주장 방향",
    paperMethod: "권장 방법",

    ctaTitle: "내 강의의 한 학기도 이렇게 정리됩니다",
    ctaBody: "베타 신청 후 종합분석을 직접 사용해 보세요.",
    ctaButton: "베타 신청",
  },
  en: {
    badge: "PREVIEW · Semester analysis",
    heroTitle: "A whole semester, in one report",
    heroBody:
      "Unlocked at week 10, comprehensive analysis gathers a semester of learning data and auto-compiles trends, surveys, a review, and even paper directions. Below is an example of the output.",
    heroCta: "Apply for beta",
    heroNote: "※ The screens below use example data for demonstration.",

    trendTitle: "Weekly learning-efficiency trend",
    trendSub: "See the effect at a glance via lift vs. week 1",
    trendLegend: { completion: "Completion", understanding: "Understanding", engagement: "In-class engagement" },
    trendDelta: "vs. week 1",

    surveyTitle: "Auto-generated end-of-term survey",
    surveySub: "Each item with pedagogical rationale and a reference (DOI)",
    surveyWarn:
      "⚠️ AI output requires instructor review. In particular, verify that each DOI actually exists.",
    surveyScale: "5-point Likert",
    surveyRationale: "Rationale",
    surveyRef: "Reference",

    distTitle: "Response visualization",
    distSub: "Per-item 5-point distribution and average",
    distAvg: "Avg",

    reviewTitle: "Semester review",
    reviewProBadge: "PRO",
    reviewSub: "Strengths and improvements through an ed-tech lens, plus paper directions",
    reviewStrength: "Strengths",
    reviewWeakness: "To improve",
    reviewImprove: "Suggestions",
    paperTitle: "Suggested paper titles & directions",
    paperDirection: "Direction",
    paperMethod: "Method",

    ctaTitle: "Your semester gets organized like this, too",
    ctaBody: "Apply for the beta and try comprehensive analysis yourself.",
    ctaButton: "Apply for beta",
  },
};

const SURVEY_ITEMS = {
  ko: [
    {
      no: 1,
      text: "사전학습 영상이 대면 수업 이해에 도움이 되었다.",
      rationale: "플립러닝의 핵심 가정(사전학습→대면 심화)에 대한 학습자 인식 측정.",
      citation: "Bishop, J. L., & Verleger, M. A. (2013). The flipped classroom: A survey of the research. ASEE.",
    },
    {
      no: 2,
      text: "나는 이 과목의 핵심 개념을 스스로 적용할 수 있다고 느낀다.",
      rationale: "취약 개념에 대한 자기효능감 측정(Self-efficacy).",
      citation: "Bandura, A. (1977). Self-efficacy. Psychological Review.",
    },
  ],
  en: [
    {
      no: 1,
      text: "The pre-class videos helped me understand the in-class session.",
      rationale: "Measures learner perception of the core flipped-learning premise.",
      citation: "Bishop, J. L., & Verleger, M. A. (2013). The flipped classroom: A survey of the research. ASEE.",
    },
    {
      no: 2,
      text: "I feel able to apply this course's core concepts on my own.",
      rationale: "Measures self-efficacy on the course's weak concepts.",
      citation: "Bandura, A. (1977). Self-efficacy. Psychological Review.",
    },
  ],
};

// 시연용 응답 분포(1~5점 응답 수). locale 무관.
const DIST = [
  { no: 1, dist: [1, 2, 6, 12, 9], avg: 3.9 },
  { no: 2, dist: [2, 3, 7, 10, 8], avg: 3.6 },
];

const REVIEW = {
  ko: {
    overview:
      "한 학기 동안 완주율·이해도·대면 참여도가 꾸준히 상승했습니다. 사전학습→대면 심화 구조가 학습 행동에 누적 효과를 낸 것으로 보입니다.",
    lens: "플립러닝 · 인지부하 이론 · 자기조절학습",
    strengths: ["사전학습 완주율의 꾸준한 상승", "대면 참여도 증가 — 토론·문제풀이 정착"],
    weaknesses: ["취약 개념의 자기효능감은 별도 보강 필요", "일부 주차에서 상·하위 격차 관찰"],
    improvements: ["취약 개념 전용 보충 영상·퀴즈로 하위 그룹 개별 보강", "또래 설명(peer instruction) 구조로 격차 완화"],
    papers: [
      {
        title: "플립러닝이 학습자의 완주율과 대면 참여에 미치는 영향",
        direction: "주차별 추이의 우상향을 도입 효과로 주장",
        method: "단일집단 사전-사후 + 반복측정",
      },
      {
        title: "취약 개념 자기효능감과 학습 전이의 관계",
        direction: "설문의 자기효능감·전이 문항 상관 분석",
        method: "설문 기반 상관·회귀 분석",
      },
    ],
  },
  en: {
    overview:
      "Completion, understanding, and in-class engagement rose steadily across the term, suggesting a cumulative effect of the pre-class-to-in-class structure.",
    lens: "Flipped learning · Cognitive load · Self-regulated learning",
    strengths: ["Steady rise in pre-class completion", "Higher in-class engagement — discussion took hold"],
    weaknesses: ["Self-efficacy on weak concepts needs reinforcement", "High/low gap seen in some weeks"],
    improvements: ["Targeted supplements for lower group on weak concepts", "Peer instruction to narrow the gap"],
    papers: [
      {
        title: "Effect of flipped learning on completion and in-class engagement",
        direction: "Argue the upward weekly trend as an adoption effect",
        method: "Single-group pre/post + repeated measures",
      },
      {
        title: "Relationship between weak-concept self-efficacy and transfer",
        direction: "Correlate survey self-efficacy and transfer items",
        method: "Survey-based correlation/regression",
      },
    ],
  },
};

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-gray-500">{sub}</p>
    </div>
  );
}

export default function ComprehensiveAnalysisPage() {
  const { locale } = useI18n();
  const c: Copy = COPY[locale] ?? COPY.ko;
  const survey = SURVEY_ITEMS[locale] ?? SURVEY_ITEMS.ko;
  const review = REVIEW[locale] ?? REVIEW.ko;

  const legend: { key: keyof typeof SERIES; label: string; color: string; delta: number }[] = [
    { key: "completion", label: c.trendLegend.completion, color: "#16A34A", delta: 32 },
    { key: "understanding", label: c.trendLegend.understanding, color: "#B88308", delta: 28 },
    { key: "engagement", label: c.trendLegend.engagement, color: "#2563EB", delta: 40 },
  ];

  return (
    <LightMarketingShell>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Hero */}
        <section className="text-center mb-12">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider"
            style={{ background: "linear-gradient(135deg,#FFC74D,#FFB627)", color: "#1A1A1A" }}
          >
            {c.badge}
          </span>
          <h1
            className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {c.heroTitle}
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-[15px] leading-relaxed text-gray-600">
            {c.heroBody}
          </p>
          <div className="mt-6">
            <Link
              href="/beta-apply"
              className="inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: "#FFB627", color: "#1A1A1A", boxShadow: "0 1px 2px rgba(184,131,8,0.2)" }}
            >
              {c.heroCta}
            </Link>
          </div>
          <p className="mt-3 text-xs text-gray-400">{c.heroNote}</p>
        </section>

        {/* (a) 주차별 추이 */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-8 border border-[var(--line,rgba(10,10,10,0.08))]">
          <SectionTitle title={c.trendTitle} sub={c.trendSub} />
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            {legend.map((l) => (
              <div key={l.key} className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                  <span className="text-xs text-gray-500">{l.label}</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                  +{l.delta}
                  <span className="text-sm font-medium text-gray-400">%p</span>
                </p>
                <p className="text-[11px] text-gray-400">{c.trendDelta}</p>
              </div>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img" aria-label={c.trendTitle}>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={0} y1={H * g} x2={W} y2={H * g} stroke="#eee" strokeWidth={1} />
            ))}
            {legend.map((l) => (
              <polyline
                key={l.key}
                points={poly(SERIES[l.key])}
                fill="none"
                stroke={l.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </section>

        {/* (b) 설문 자동생성 */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-8 border border-[var(--line,rgba(10,10,10,0.08))]">
          <SectionTitle title={c.surveyTitle} sub={c.surveySub} />
          <div
            className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
            role="note"
          >
            {c.surveyWarn}
          </div>
          <div className="space-y-3">
            {survey.map((q) => (
              <div key={q.no} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-xs font-bold text-amber-700">Q{q.no}</span>
                  <p className="text-sm font-medium text-gray-900">{q.text}</p>
                </div>
                <div className="mt-1 ml-6">
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {c.surveyScale}
                  </span>
                </div>
                <p className="mt-2 ml-6 text-xs text-gray-600">
                  <span className="font-semibold text-gray-500">{c.surveyRationale}: </span>
                  {q.rationale}
                </p>
                <p className="mt-1 ml-6 text-[11px] text-gray-400">
                  <span className="font-semibold">{c.surveyRef}: </span>
                  {q.citation} · DOI: <span className="italic">10.____/______</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* (c) 응답 분포 */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-8 border border-[var(--line,rgba(10,10,10,0.08))]">
          <SectionTitle title={c.distTitle} sub={c.distSub} />
          <div className="space-y-4">
            {DIST.map((d) => {
              const total = d.dist.reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={d.no}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500">Q{d.no}</span>
                    <span className="text-xs text-gray-400">
                      {c.distAvg} {d.avg.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex gap-1 h-6 rounded overflow-hidden">
                    {d.dist.map((count, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center text-[10px] text-white"
                        style={{
                          width: `${(count / total) * 100}%`,
                          background: SCALE_COLORS[i],
                          minWidth: count ? 18 : 0,
                        }}
                        title={`${i + 1}점: ${count}`}
                      >
                        {count || ""}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* (d) 학기 총평 [PRO] */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-10 border border-[var(--line,rgba(10,10,10,0.08))]">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
              {c.reviewTitle}
            </h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white">
              {c.reviewProBadge}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">{c.reviewSub}</p>
          <p className="text-sm text-gray-700 mb-2">{review.overview}</p>
          <p className="text-xs text-amber-700 mb-4">{review.lens}</p>

          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            {[
              { label: c.reviewStrength, items: review.strengths, color: "text-green-700" },
              { label: c.reviewWeakness, items: review.weaknesses, color: "text-red-700" },
              { label: c.reviewImprove, items: review.improvements, color: "text-amber-700" },
            ].map((col) => (
              <div key={col.label} className="rounded-xl bg-gray-50 p-3">
                <p className={`text-xs font-bold mb-2 ${col.color}`}>{col.label}</p>
                <ul className="space-y-1">
                  {col.items.map((it, i) => (
                    <li key={i} className="text-xs text-gray-600 leading-snug">
                      · {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-sm font-semibold text-gray-900 mb-2">{c.paperTitle}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {review.papers.map((p, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-3">
                <p className="text-sm font-medium text-gray-900">{p.title}</p>
                <p className="mt-1 text-xs text-gray-600">
                  <span className="font-semibold text-gray-500">{c.paperDirection}: </span>
                  {p.direction}
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  <span className="font-semibold text-gray-500">{c.paperMethod}: </span>
                  {p.method}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center rounded-2xl bg-[var(--gold-soft,#FBF3DE)] p-8">
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
            {c.ctaTitle}
          </h2>
          <p className="mt-2 text-sm text-gray-600">{c.ctaBody}</p>
          <div className="mt-5">
            <Link
              href="/beta-apply"
              className="inline-flex items-center rounded-xl px-6 py-3 text-sm font-semibold"
              style={{ backgroundColor: "#FFB627", color: "#1A1A1A" }}
            >
              {c.ctaButton}
            </Link>
          </div>
        </section>
      </main>
    </LightMarketingShell>
  );
}
