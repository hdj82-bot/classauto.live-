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
 * 디자인: v2 라이트 베이지 + 골드(LightMarketingShell chrome). 차트는 학술 논문
 * 도판 톤(Y축·격자·마커·범례·figure 캡션). 의미색은 차트 한정. 데이터는 시연용.
 */

// ── 측정 데이터(시연용 고정) ────────────────────────────────────────
const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SERIES = {
  completion: [58, 61, 64, 68, 72, 76, 80, 84, 87, 90],
  understanding: [55, 57, 60, 63, 66, 69, 73, 77, 80, 83],
  engagement: [40, 44, 49, 54, 59, 64, 69, 73, 77, 80],
};

const GROUP = {
  high: [66, 69, 72, 76, 80, 84, 88, 91, 93, 95],
  low: [50, 53, 56, 59, 63, 67, 71, 75, 78, 82],
};

const DIST = [
  { no: 1, dist: [1, 2, 6, 12, 9], avg: 3.9 },
  { no: 2, dist: [2, 3, 7, 10, 8], avg: 3.6 },
];

const SCALE_COLORS = ["#DC2626", "#F59E0B", "#FACC15", "#84CC16", "#16A34A"];
const COLOR = { completion: "#15803D", understanding: "#B88308", engagement: "#2563EB" };
const AXIS = "#94A3B8";
const AXIS_TEXT = "#64748B";
const GRID = "#EEF2F6";

type Shape = "circle" | "square" | "triangle";
const SERIES_META: { key: keyof typeof SERIES; shape: Shape }[] = [
  { key: "completion", shape: "circle" },
  { key: "understanding", shape: "square" },
  { key: "engagement", shape: "triangle" },
];

// ── 좌표 헬퍼 ──────────────────────────────────────────────────────
function project(
  vals: number[],
  box: { x: number; y: number; w: number; h: number },
  domain: [number, number]
) {
  const [min, max] = domain;
  const span = max - min || 1;
  return vals.map((v, i) => ({
    x: box.x + (vals.length === 1 ? 0 : (i / (vals.length - 1)) * box.w),
    y: box.y + (1 - (v - min) / span) * box.h,
  }));
}
const poly = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const areaUnder = (pts: { x: number; y: number }[], baseY: number) =>
  `M ${pts[0].x.toFixed(1)},${baseY} ` +
  pts.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
  ` L ${pts[pts.length - 1].x.toFixed(1)},${baseY} Z`;

// 시리즈별 마커(원·사각·삼각) — 흑백 인쇄에서도 구분되는 학술 도판 관행.
function Marker({ shape, cx, cy, color, r = 3.4 }: { shape: Shape; cx: number; cy: number; color: string; r?: number }) {
  const common = { fill: color, stroke: "#fff", strokeWidth: 1.3 };
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
  if (shape === "triangle")
    return <polygon points={`${cx},${cy - r * 1.25} ${cx - r * 1.1},${cy + r * 0.85} ${cx + r * 1.1},${cy + r * 0.85}`} {...common} />;
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

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
    trendSub: "교육공학 3대 학습참여 지표(행동·인지·정의)를 1~10주로 추적",
    trendDelta: "1주 대비",
    trendAxis: "주차 (Week)",
    yAxis: "지표 점수 (%)",
    trendFig:
      "그림 1. 주차별 학습참여 지표 추이(완주율·이해도·대면 참여도) — 측정 1~10주. 색상은 Fredricks et al.(2004) 학습참여 3차원 모형에 대응. 시연용 예시 데이터.",
    legend: {
      completion: { label: "완주율", construct: "행동적 참여 (Behavioral)", delta: 32 },
      understanding: { label: "평균 이해도", construct: "인지적 참여 (Cognitive)", delta: 28 },
      engagement: { label: "대면 참여도", construct: "정의적 참여 (Affective)", delta: 40 },
    },

    surveyTitle: "학기말 설문 자동생성",
    surveySub: "AI 제시 문항을 선행연구 원문과 나란히 — 채택할지 수정할지는 연구자가 결정",
    surveyWarn:
      "⚠️ AI 생성물은 반드시 교수자 검토가 필요합니다. 특히 DOI는 실재 여부를 확인하세요.",
    colAi: "AI가 제시하는 설문문항",
    colOrig: "선행연구 설문문항 원문",
    colDecision: "채택 / 수정",
    colAiHint: "건의한 연구방향에 맞춘 문항 + 설계 근거",
    colOrigHint: "근거가 된 선행연구의 실제 문항 · 출처",
    colDecisionHint: "그대로 쓸지, 조정할지 연구자가 선택",
    rationaleLabel: "설계 근거",
    refLabel: "출처",
    adopt: "채택",
    modify: "수정",
    scale: "5점 리커트",

    distTitle: "응답 결과 시각화",
    distSub: "문항별 5점 척도 분포와 평균",
    distAvg: "평균",

    reviewTitle: "학기 총평",
    reviewProBadge: "PRO",
    reviewSub: "교육공학 이론 렌즈로 본 결론을 근거 그래프와 함께 제시",
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
    trendSub: "Tracks the three ed-tech engagement dimensions (behavioral·cognitive·affective) over weeks 1–10",
    trendDelta: "vs. week 1",
    trendAxis: "Week",
    yAxis: "Score (%)",
    trendFig:
      "Figure 1. Weekly engagement-indicator trend (completion, understanding, in-class engagement), weeks 1–10. Colors map to the three-dimensional engagement model of Fredricks et al. (2004). Demonstration data.",
    legend: {
      completion: { label: "Completion", construct: "Behavioral engagement", delta: 32 },
      understanding: { label: "Understanding", construct: "Cognitive engagement", delta: 28 },
      engagement: { label: "In-class engagement", construct: "Affective engagement", delta: 40 },
    },

    surveyTitle: "Auto-generated end-of-term survey",
    surveySub: "AI items shown next to the original prior-research wording — the researcher decides to adopt or revise",
    surveyWarn:
      "⚠️ AI output requires instructor review. In particular, verify that each DOI actually exists.",
    colAi: "AI-suggested item",
    colOrig: "Original prior-research item",
    colDecision: "Adopt / Revise",
    colAiHint: "Item fit to your research direction + rationale",
    colOrigHint: "The actual item from the source study · citation",
    colDecisionHint: "Use as-is or adjust — your call",
    rationaleLabel: "Rationale",
    refLabel: "Source",
    adopt: "Adopt",
    modify: "Revise",
    scale: "5-pt Likert",

    distTitle: "Response visualization",
    distSub: "Per-item 5-point distribution and average",
    distAvg: "Avg",

    reviewTitle: "Semester review",
    reviewProBadge: "PRO",
    reviewSub: "Conclusions through an ed-tech lens, each paired with its evidence graph",
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

type Decision = "adopt" | "modify";
const SURVEY_ITEMS: Record<
  "ko" | "en",
  { no: number; aiText: string; origText: string; origRef: string; rationale: string; citation: string; decision: Decision }[]
> = {
  ko: [
    {
      no: 1,
      aiText: "사전학습 영상이 대면 수업 이해에 도움이 되었다.",
      origText: "수업 전에 제공된 동영상 강의는 대면 수업 활동을 준비하는 데 도움이 되었다.",
      origRef: "플립러닝 인식 문항 (대표 예시)",
      rationale: "플립러닝의 핵심 가정(사전학습→대면 심화)에 대한 학습자 인식 측정.",
      citation: "Bishop & Verleger (2013), ASEE",
      decision: "adopt",
    },
    {
      no: 2,
      aiText: "나는 이 과목의 핵심 개념을 스스로 적용할 수 있다고 느낀다.",
      origText: "나는 이 수업에서 다루는 가장 어려운 내용도 이해할 수 있다고 확신한다.",
      origRef: "학업적 자기효능감 문항 (대표 예시)",
      rationale: "취약 개념에 대한 자기효능감(Self-efficacy) 측정 — 적용·전이 단계로 조정 가능.",
      citation: "Bandura (1977); cf. MSLQ — Pintrich et al. (1991)",
      decision: "modify",
    },
  ],
  en: [
    {
      no: 1,
      aiText: "The pre-class videos helped me understand the in-class session.",
      origText: "The video lectures provided before class helped me prepare for the in-class activities.",
      origRef: "Flipped-learning perception item (representative)",
      rationale: "Measures learner perception of the core flipped-learning premise.",
      citation: "Bishop & Verleger (2013), ASEE",
      decision: "adopt",
    },
    {
      no: 2,
      aiText: "I feel able to apply this course's core concepts on my own.",
      origText: "I'm confident I can understand the most difficult material presented in this course.",
      origRef: "Academic self-efficacy item (representative)",
      rationale: "Measures self-efficacy on weak concepts — adjustable toward the apply/transfer stage.",
      citation: "Bandura (1977); cf. MSLQ — Pintrich et al. (1991)",
      decision: "modify",
    },
  ],
};

type EvidenceKind = "spark-completion" | "survey-gap" | "group-gap";
const REVIEW = {
  ko: {
    overview:
      "한 학기 동안 완주율·이해도·대면 참여도가 꾸준히 상승했습니다. 사전학습→대면 심화 구조가 학습 행동에 누적 효과를 낸 것으로 보입니다.",
    lens: "플립러닝 · 인지부하 이론 · 자기조절학습",
    evidence: [
      {
        tone: "strength" as const,
        kind: "spark-completion" as EvidenceKind,
        conclusion: "완주율이 한 학기 +32%p로 가장 큰 폭으로 상승 — 사전학습 루틴이 정착했습니다.",
        caption: "근거 · 주차별 완주율 추이 (1→10주)",
      },
      {
        tone: "weakness" as const,
        kind: "survey-gap" as EvidenceKind,
        conclusion: "이해도(Q1 3.9)에 비해 자기효능감(Q2 3.6)이 0.3점 낮아 취약 개념 보강이 필요합니다.",
        caption: "근거 · 학기말 설문 문항별 평균",
      },
      {
        tone: "improve" as const,
        kind: "group-gap" as EvidenceKind,
        conclusion: "상·하위 그룹 완주율 격차가 후반부까지 약 13%p 잔존 — 또래 설명·하위 그룹 보충이 유효합니다.",
        caption: "근거 · 완주율 상위/하위 그룹 비교",
      },
    ],
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
    evidence: [
      {
        tone: "strength" as const,
        kind: "spark-completion" as EvidenceKind,
        conclusion: "Completion rose the most, +32%p over the term — the pre-class routine took hold.",
        caption: "Evidence · Weekly completion trend (weeks 1→10)",
      },
      {
        tone: "weakness" as const,
        kind: "survey-gap" as EvidenceKind,
        conclusion: "Self-efficacy (Q2 3.6) trails understanding (Q1 3.9) by 0.3 — weak concepts need reinforcement.",
        caption: "Evidence · End-of-term survey item averages",
      },
      {
        tone: "improve" as const,
        kind: "group-gap" as EvidenceKind,
        conclusion: "A ~13%p completion gap between high and low groups persists late — peer instruction / low-group supplements help.",
        caption: "Evidence · Completion, high vs. low group",
      },
    ],
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

// ── 메인 추이 차트 (학술 figure 톤) ────────────────────────────────
function TrendChart({ c }: { c: Copy }) {
  const W = 640;
  const H = 332;
  const m = { l: 52, r: 40, t: 18, b: 56 };
  const box = { x: m.l, y: m.t, w: W - m.l - m.r, h: H - m.t - m.b };
  const baseY = box.y + box.h;
  const yTicks = [0, 20, 40, 60, 80, 100];
  const xOf = (i: number) => box.x + (i / (WEEKS.length - 1)) * box.w;
  const yOf = (v: number) => box.y + (1 - v / 100) * box.h;

  // 선 끝 값 라벨 — 겹침 방지(아래로 최소 간격 확보).
  const ends = SERIES_META.map((s) => ({
    color: COLOR[s.key],
    v: SERIES[s.key][SERIES[s.key].length - 1],
    y: yOf(SERIES[s.key][SERIES[s.key].length - 1]),
  })).sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const e of ends) {
    e.y = Math.max(e.y, prev + 13);
    prev = e.y;
  }

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label={c.trendTitle}>
        <defs>
          {SERIES_META.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR[s.key]} stopOpacity={0.14} />
              <stop offset="100%" stopColor={COLOR[s.key]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {/* 격자 + Y축 눈금 */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={box.x} y1={yOf(t)} x2={box.x + box.w} y2={yOf(t)} stroke={GRID} strokeWidth={1} />
            <line x1={box.x - 4} y1={yOf(t)} x2={box.x} y2={yOf(t)} stroke={AXIS} strokeWidth={1} />
            <text x={box.x - 8} y={yOf(t) + 3.5} textAnchor="end" fontSize={10.5} fill={AXIS_TEXT} className="tabular-nums">
              {t}
            </text>
          </g>
        ))}

        {/* 축선 */}
        <line x1={box.x} y1={box.y} x2={box.x} y2={baseY} stroke={AXIS} strokeWidth={1.2} />
        <line x1={box.x} y1={baseY} x2={box.x + box.w} y2={baseY} stroke={AXIS} strokeWidth={1.2} />

        {/* X축 눈금·라벨 */}
        {WEEKS.map((wk, i) => (
          <g key={wk}>
            <line x1={xOf(i)} y1={baseY} x2={xOf(i)} y2={baseY + 4} stroke={AXIS} strokeWidth={1} />
            <text x={xOf(i)} y={baseY + 16} textAnchor="middle" fontSize={10.5} fill={AXIS_TEXT} className="tabular-nums">
              {wk}
            </text>
          </g>
        ))}

        {/* 축 제목 */}
        <text x={box.x + box.w / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={AXIS_TEXT}>
          {c.trendAxis}
        </text>
        <text
          x={14}
          y={box.y + box.h / 2}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={AXIS_TEXT}
          transform={`rotate(-90 14 ${box.y + box.h / 2})`}
        >
          {c.yAxis}
        </text>

        {/* 면적 음영 (가장 옅게) + 선 + 마커 */}
        {SERIES_META.map((s) => {
          const pts = SERIES[s.key].map((v, i) => ({ x: xOf(i), y: yOf(v) }));
          return (
            <g key={s.key}>
              <path d={areaUnder(pts, baseY)} fill={`url(#g-${s.key})`} />
              <polyline points={poly(pts)} fill="none" stroke={COLOR[s.key]} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <Marker key={i} shape={s.shape} cx={p.x} cy={p.y} color={COLOR[s.key]} />
              ))}
            </g>
          );
        })}

        {/* 선 끝 값 라벨 */}
        {ends.map((e, i) => (
          <text key={i} x={box.x + box.w + 7} y={e.y + 3.5} fontSize={11} fontWeight={700} fill={e.color} className="tabular-nums">
            {e.v}
          </text>
        ))}

        {/* 범례 박스 (플롯 좌상단 여백) */}
        <g transform={`translate(${box.x + 12}, ${box.y + 10})`}>
          <rect x={-8} y={-8} width={158} height={SERIES_META.length * 18 + 12} rx={7} fill="#fff" fillOpacity={0.92} stroke={GRID} strokeWidth={1} />
          {SERIES_META.map((s, i) => {
            const y = i * 18 + 4;
            return (
              <g key={s.key}>
                <line x1={0} y1={y} x2={22} y2={y} stroke={COLOR[s.key]} strokeWidth={2.4} strokeLinecap="round" />
                <Marker shape={s.shape} cx={11} cy={y} color={COLOR[s.key]} r={3.2} />
                <text x={30} y={y + 3.5} fontSize={11} fill="#374151">
                  {c.legend[s.key].label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="mt-2 text-[11px] leading-relaxed text-gray-400">{c.trendFig}</figcaption>
    </figure>
  );
}

// ── 학기 총평 근거 미니 도판 ────────────────────────────────────────
function EvidenceVisual({ kind, locale }: { kind: EvidenceKind; locale: "ko" | "en" }) {
  const W = 232;
  const H = 104;
  const box = { x: 12, y: 14, w: W - 24, h: 62 };
  const baseY = box.y + box.h;
  const axis = (
    <>
      <line x1={box.x} y1={box.y} x2={box.x} y2={baseY} stroke={AXIS} strokeWidth={1} />
      <line x1={box.x} y1={baseY} x2={box.x + box.w} y2={baseY} stroke={AXIS} strokeWidth={1} />
    </>
  );

  if (kind === "spark-completion") {
    const dom: [number, number] = [52, 92];
    const pts = project(SERIES.completion, box, dom);
    const last = pts[pts.length - 1];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label="completion trend">
        <defs>
          <linearGradient id="ev-comp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR.completion} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COLOR.completion} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.5].map((g) => (
          <line key={g} x1={box.x} y1={box.y + box.h * g} x2={box.x + box.w} y2={box.y + box.h * g} stroke={GRID} strokeWidth={1} />
        ))}
        {axis}
        <path d={areaUnder(pts, baseY)} fill="url(#ev-comp)" />
        <polyline points={poly(pts)} fill="none" stroke={COLOR.completion} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (i % 3 === 0 || i === pts.length - 1 ? <Marker key={i} shape="circle" cx={p.x} cy={p.y} color={COLOR.completion} r={2.6} /> : null))}
        <text x={box.x} y={baseY + 13} fontSize={9} fill={AXIS_TEXT}>1{locale === "ko" ? "주" : "w"}</text>
        <text x={box.x + box.w} y={baseY + 13} textAnchor="end" fontSize={9} fill={AXIS_TEXT}>10{locale === "ko" ? "주" : "w"}</text>
        <text x={last.x - 2} y={last.y - 7} textAnchor="end" fontSize={11} fontWeight={700} fill={COLOR.completion} className="tabular-nums">
          +32%p
        </text>
      </svg>
    );
  }

  if (kind === "survey-gap") {
    const bars = [
      { label: "Q1", val: 3.9, color: COLOR.completion },
      { label: "Q2", val: 3.6, color: "#DC2626" },
    ];
    const bw = 40;
    const slot = box.w / 2;
    const refY = box.y + (1 - 3 / 5) * box.h;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label="survey averages">
        {[1, 2, 3, 4].map((t) => (
          <line key={t} x1={box.x} y1={box.y + (1 - t / 5) * box.h} x2={box.x + box.w} y2={box.y + (1 - t / 5) * box.h} stroke={GRID} strokeWidth={1} />
        ))}
        {axis}
        {/* 중앙값 기준선 */}
        <line x1={box.x} y1={refY} x2={box.x + box.w} y2={refY} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="3 3" />
        <text x={box.x + box.w} y={refY - 3} textAnchor="end" fontSize={8.5} fill="#94A3B8">{locale === "ko" ? "중앙값 3.0" : "mid 3.0"}</text>
        {bars.map((b, i) => {
          const cx = box.x + slot * (i + 0.5);
          const h = (b.val / 5) * box.h;
          const y = baseY - h;
          return (
            <g key={b.label}>
              <rect x={cx - bw / 2} y={y} width={bw} height={h} rx={3} fill={b.color} fillOpacity={0.88} />
              <text x={cx} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={b.color} className="tabular-nums">
                {b.val.toFixed(1)}
              </text>
              <text x={cx} y={baseY + 13} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>{b.label}</text>
            </g>
          );
        })}
        <text x={box.x - 4} y={box.y + 4} textAnchor="end" fontSize={9} fill={AXIS_TEXT}>5</text>
        <text x={box.x - 4} y={baseY} textAnchor="end" fontSize={9} fill={AXIS_TEXT}>0</text>
      </svg>
    );
  }

  // group-gap — 두 선 + 격차 음영
  const dom: [number, number] = [Math.min(...GROUP.low) - 4, Math.max(...GROUP.high) + 4];
  const hi = project(GROUP.high, box, dom);
  const lo = project(GROUP.low, box, dom);
  const between = `M ${poly(hi)} L ${poly([...lo].reverse())} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label="group gap">
      {[0.5].map((g) => (
        <line key={g} x1={box.x} y1={box.y + box.h * g} x2={box.x + box.w} y2={box.y + box.h * g} stroke={GRID} strokeWidth={1} />
      ))}
      {axis}
      <path d={between} fill="#2563EB" fillOpacity={0.08} />
      <polyline points={poly(hi)} fill="none" stroke="#2563EB" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={poly(lo)} fill="none" stroke="#DC2626" strokeWidth={2.2} strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" />
      {hi.map((p, i) => (i % 3 === 0 || i === hi.length - 1 ? <Marker key={`h${i}`} shape="circle" cx={p.x} cy={p.y} color="#2563EB" r={2.4} /> : null))}
      <text x={box.x + box.w} y={hi[hi.length - 1].y - 5} textAnchor="end" fontSize={9.5} fontWeight={700} fill="#2563EB">{locale === "ko" ? "상위" : "High"}</text>
      <text x={box.x + box.w} y={lo[lo.length - 1].y + 12} textAnchor="end" fontSize={9.5} fontWeight={700} fill="#DC2626">{locale === "ko" ? "하위" : "Low"}</text>
      <text x={box.x} y={baseY + 13} fontSize={9} fill={AXIS_TEXT}>1{locale === "ko" ? "주" : "w"}</text>
      <text x={box.x + box.w} y={baseY + 13} textAnchor="end" fontSize={9} fill={AXIS_TEXT}>10{locale === "ko" ? "주" : "w"}</text>
    </svg>
  );
}

export default function ComprehensiveAnalysisPage() {
  const { locale } = useI18n();
  const c: Copy = COPY[locale] ?? COPY.ko;
  const survey = SURVEY_ITEMS[locale] ?? SURVEY_ITEMS.ko;
  const review = REVIEW[locale] ?? REVIEW.ko;

  const cards = SERIES_META.map((s) => ({ key: s.key, color: COLOR[s.key], ...c.legend[s.key] }));
  const toneColor = { strength: "text-green-700", weakness: "text-red-700", improve: "text-amber-700" } as const;
  const toneLabel = { strength: c.reviewStrength, weakness: c.reviewWeakness, improve: c.reviewImprove } as const;

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
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
            {c.heroTitle}
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-[15px] leading-relaxed text-gray-600">{c.heroBody}</p>
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
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {cards.map((l) => (
              <div key={l.key} className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                  <span className="text-xs font-semibold text-gray-700">{l.label}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">{l.construct}</p>
                <p className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">
                  +{l.delta}
                  <span className="text-sm font-medium text-gray-400">%p</span>
                </p>
                <p className="text-[11px] text-gray-400">{c.trendDelta}</p>
              </div>
            ))}
          </div>
          <TrendChart c={c} />
        </section>

        {/* (b) 설문 자동생성 — AI 제시 / 선행연구 원문(+출처) / 채택·수정 3열 */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-8 border border-[var(--line,rgba(10,10,10,0.08))]">
          <SectionTitle title={c.surveyTitle} sub={c.surveySub} />
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" role="note">
            {c.surveyWarn}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200">
            {/* 헤더 (데스크톱) */}
            <div className="hidden md:grid grid-cols-[1.2fr_1.3fr_0.7fr] bg-gray-50 border-b border-gray-200">
              {[
                { t: c.colAi, h: c.colAiHint },
                { t: c.colOrig, h: c.colOrigHint },
                { t: c.colDecision, h: c.colDecisionHint },
              ].map((col, i) => (
                <div key={i} className={`px-4 py-2.5 ${i < 2 ? "border-r border-gray-200" : ""}`}>
                  <p className="text-xs font-bold text-gray-700">{col.t}</p>
                  <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{col.h}</p>
                </div>
              ))}
            </div>
            {/* 행 */}
            {survey.map((q) => (
              <div key={q.no} className="grid grid-cols-1 md:grid-cols-[1.2fr_1.3fr_0.7fr] border-b border-gray-100 last:border-b-0">
                {/* AI 제시 문항 */}
                <div className="px-4 py-4 md:border-r border-gray-100">
                  <p className="md:hidden text-[10px] font-bold text-amber-700 mb-1">{c.colAi}</p>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-bold text-amber-700">Q{q.no}</span>
                    <p className="text-sm font-medium text-gray-900">{q.aiText}</p>
                  </div>
                  <span className="inline-block mt-2 ml-6 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.scale}</span>
                  <p className="mt-2 ml-6 text-[11px] text-gray-600">
                    <span className="font-semibold text-gray-500">{c.rationaleLabel}: </span>
                    {q.rationale}
                  </p>
                </div>

                {/* 선행연구 원문 + 출처 */}
                <div className="px-4 py-4 md:border-r border-gray-100 bg-gray-50/40">
                  <p className="md:hidden text-[10px] font-bold text-gray-500 mb-1">{c.colOrig}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">“{q.origText}”</p>
                  <p className="mt-1.5 text-[11px] text-gray-400">{q.origRef}</p>
                  <p className="mt-2 pt-2 border-t border-gray-200/70 text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-500">{c.refLabel}: </span>
                    {q.citation} · DOI: <span className="italic">10.____/______</span>
                  </p>
                </div>

                {/* 채택 / 수정 */}
                <div className="px-4 py-4 flex md:flex-col gap-2 md:justify-center">
                  <p className="md:hidden text-[10px] font-bold text-gray-500 self-center mr-1">{c.colDecision}</p>
                  <span
                    className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      q.decision === "adopt" ? "bg-[#FFB627] text-[#1A1A1A]" : "border border-gray-200 text-gray-400"
                    }`}
                  >
                    {q.decision === "adopt" ? "✓ " : ""}
                    {c.adopt}
                  </span>
                  <span
                    className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      q.decision === "modify" ? "bg-amber-100 text-amber-800 border border-amber-300" : "border border-gray-200 text-gray-400"
                    }`}
                  >
                    {q.decision === "modify" ? "✎ " : ""}
                    {c.modify}
                  </span>
                </div>
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
                        style={{ width: `${(count / total) * 100}%`, background: SCALE_COLORS[i], minWidth: count ? 18 : 0 }}
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

        {/* (d) 학기 총평 [PRO] — 결론 + 근거 도판 */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-10 border border-[var(--line,rgba(10,10,10,0.08))]">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
              {c.reviewTitle}
            </h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white">{c.reviewProBadge}</span>
          </div>
          <p className="text-sm text-gray-500 mb-4">{c.reviewSub}</p>
          <p className="text-sm text-gray-700 mb-2">{review.overview}</p>
          <p className="text-xs text-amber-700 mb-5">{review.lens}</p>

          <div className="grid md:grid-cols-3 gap-3 mb-6">
            {review.evidence.map((ev, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col">
                <p className={`text-xs font-bold mb-2 ${toneColor[ev.tone]}`}>{toneLabel[ev.tone]}</p>
                <p className="text-[13px] text-gray-800 leading-snug mb-3">{ev.conclusion}</p>
                <div className="mt-auto rounded-lg bg-white border border-gray-100 px-2 py-2">
                  <EvidenceVisual kind={ev.kind} locale={locale} />
                </div>
                <p className="mt-2 text-[10px] italic text-gray-400">{ev.caption}</p>
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
