"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./analytics.css";

/**
 * AnalyticsPrototype — `/analytics-example` 학습 분석 콘솔의 React 재구현.
 *
 * 디자인/로직 근거: docs/prototypes/07-analytics.extracted.html
 *   (자기완결형 React SPA 번들. 본 컴포넌트는 그 안의 8개 babel 소스 모듈을
 *    하나의 TypeScript 클라이언트 컴포넌트로 충실히 이식한 것.)
 *
 * 정책:
 *   - localStorage 미사용 (CLAUDE.md 금지). 모든 상호작용은 React state.
 *   - 차트는 차트 라이브러리 없이 inline SVG 로 직접 그림 (원본과 동일 방식).
 *   - 모든 클래스는 analytics.css 의 `.an-root` 네임스페이스 하위에서만 적용.
 *   - dangerouslySetInnerHTML 은 한자 강조(`<span class="han">`) 등 정적·신뢰된
 *     마크업 문자열에만 사용 (원본 데이터 레이어와 동일, 외부 입력 없음).
 *
 * 책임 범위: 분석 리포트 "한 화면" 정적 미리보기. 사이드바/탑바 메뉴는 토스트만
 * 띄우는 시각적 chrome (마케팅 방문자 대상, 실제 라우팅 없음).
 */

/* ═══════════════ palette + icons ═══════════════ */

type PaletteKey = "success" | "violet" | "cyan" | "pink" | "gold" | "rose" | "gray";

const PALETTE: Record<PaletteKey, { stroke: string; area: string; flat: string }> = {
  success: { stroke: "url(#an-grad-success)", area: "url(#an-area-success)", flat: "#10B981" },
  violet: { stroke: "url(#an-grad-violet)", area: "url(#an-area-violet)", flat: "#6366F1" },
  cyan: { stroke: "url(#an-grad-cyan)", area: "url(#an-area-cyan)", flat: "#0EA5E9" },
  pink: { stroke: "url(#an-grad-pink)", area: "url(#an-area-pink)", flat: "#EC4899" },
  gold: { stroke: "url(#an-grad-gold)", area: "url(#an-area-gold)", flat: "#E89E0E" },
  rose: { stroke: "url(#an-grad-rose)", area: "url(#an-area-rose)", flat: "#E11D48" },
  gray: { stroke: "rgba(10,10,10,0.22)", area: "rgba(10,10,10,0.04)", flat: "rgba(10,10,10,0.30)" },
};

function GradientDefs() {
  const areaDefs: Array<[string, string]> = [
    ["an-area-success", "#10B981"],
    ["an-area-violet", "#6366F1"],
    ["an-area-cyan", "#0EA5E9"],
    ["an-area-pink", "#EC4899"],
    ["an-area-gold", "#E89E0E"],
    ["an-area-rose", "#E11D48"],
  ];
  const lineDefs: Array<[string, string, string]> = [
    ["an-grad-success", "#34D399", "#10B981"],
    ["an-grad-violet", "#A78BFA", "#6366F1"],
    ["an-grad-cyan", "#22D3EE", "#0EA5E9"],
    ["an-grad-pink", "#F472B6", "#EC4899"],
    ["an-grad-gold", "#FFB627", "#E89E0E"],
    ["an-grad-rose", "#FB7185", "#E11D48"],
  ];
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {lineDefs.map(([id, a, b]) => (
          <linearGradient key={id} id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={a} />
            <stop offset="100%" stopColor={b} />
          </linearGradient>
        ))}
        {areaDefs.map(([id, color]) => (
          <linearGradient key={id} id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

type IconName =
  | "chart"
  | "check"
  | "clock"
  | "chat"
  | "video"
  | "inbox"
  | "analytics"
  | "users"
  | "settings"
  | "card"
  | "chevron"
  | "download"
  | "sparkles"
  | "arrow-up"
  | "arrow-down"
  | "play";

function Icon({
  name,
  gradient,
  size = 18,
  strokeWidth = 1.8,
  style,
}: {
  name: IconName;
  gradient?: PaletteKey;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const stroke = gradient ? `url(#an-grad-${gradient})` : "currentColor";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style,
  };
  switch (name) {
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 3 6-7" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 12c0 4.4-4 8-9 8-1.4 0-2.8-.3-4-.8L3 21l1.8-4.5C4.3 15.2 4 13.6 4 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="14" rx="3" />
          <path d="M17 9l4-2v10l-4-2z" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M3 13h5l2 3h4l2-3h5" />
          <path d="M3 13l3-8h12l3 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <path d="M21 21H4a1 1 0 0 1-1-1V3" />
          <rect x="7" y="13" width="3" height="5" rx="0.5" />
          <rect x="12" y="9" width="3" height="9" rx="0.5" />
          <rect x="17" y="5" width="3" height="13" rx="0.5" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M17 14a5 5 0 0 1 5 5v1" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 11h18" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v11" />
          <path d="M7 12l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z" />
          <path d="M19 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...common}>
          <path d="M7 14l5-5 5 5" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg {...common}>
          <path d="M7 10l5 5 5-5" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} fill={gradient ? `url(#an-grad-${gradient})` : "currentColor"} stroke="none">
          <path d="M8 5l11 7-11 7z" />
        </svg>
      );
    default:
      return null;
  }
}

function StatIcon({ kind }: { kind: "success" | "violet" | "cyan" | "pink" }) {
  switch (kind) {
    case "success":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="url(#an-grad-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      );
    case "violet":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="url(#an-grad-violet)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <rect x="7" y="13" width="2.6" height="4" rx="0.4" fill="url(#an-grad-violet)" stroke="none" />
          <rect x="11" y="9" width="2.6" height="8" rx="0.4" fill="url(#an-grad-violet)" stroke="none" />
          <rect x="15" y="5" width="2.6" height="12" rx="0.4" fill="url(#an-grad-violet)" stroke="none" />
        </svg>
      );
    case "cyan":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="url(#an-grad-cyan)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2.5" />
        </svg>
      );
    case "pink":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="url(#an-grad-pink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12c0 4.4-4 8-9 8-1.4 0-2.8-.3-4-.8L3 21l1.8-4.5C4.3 15.2 4 13.6 4 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
          <circle cx="9" cy="12" r="0.9" fill="url(#an-grad-pink)" stroke="none" />
          <circle cx="12" cy="12" r="0.9" fill="url(#an-grad-pink)" stroke="none" />
          <circle cx="15" cy="12" r="0.9" fill="url(#an-grad-pink)" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

/* ═══════════════ data layer ═══════════════ */

interface Chapter {
  idx: number;
  title: string;
  han: string;
  quizzes: number;
  hard?: boolean;
}

const CHAPTERS: Chapter[] = [
  { idx: 0, title: "把자문 도입", han: "导入", quizzes: 3 },
  { idx: 1, title: "把자문의 의미", han: "语义", quizzes: 4 },
  { idx: 2, title: "어순 비교", han: "语序", quizzes: 4 },
  { idx: 3, title: "把의 문법적 기능", han: "功能", quizzes: 5, hard: true },
  { idx: 4, title: "把자문 예시", han: "例句", quizzes: 4 },
  { idx: 5, title: "사용 조건", han: "条件", quizzes: 3 },
  { idx: 6, title: "흔한 오류", han: "常错", quizzes: 5, hard: true },
  { idx: 7, title: "마무리", han: "总结", quizzes: 2 },
];

const STUDENT_NAMES = [
  "김민지", "박서준", "이지원", "최예린", "정태우", "윤서영",
  "강민호", "송하늘", "임가은", "한지훈", "신유진", "오현우",
  "서민재", "노하영", "백승원", "권나연", "조윤서", "황태민",
  "류서아", "안재현", "양수빈", "진예준", "배지호", "허민서",
  "구하늘", "남도윤", "도유진", "라연우", "마지윤", "변태경",
  "사예린", "우다은", "차서연", "카밀라", "탕민", "파스칼",
  "하은서", "강예준", "김도윤", "박지유", "이서연", "최민재",
  "정하늘", "윤서윤", "강서아", "송태형", "임예진",
];

type Role = "star" | "avg" | "weak" | "severe" | "inactive";

const ROLE_AT: Role[] = [
  "avg", "weak", "weak", "avg", "avg", "star",
  "star", "star", "star", "star", "star", "star",
  "star", "star", "star", "avg", "avg", "avg",
  "avg", "avg", "avg", "avg", "avg", "avg",
  "avg", "avg", "avg", "avg", "avg", "avg",
  "avg", "avg", "avg", "avg", "avg", "avg",
  "avg", "weak", "weak", "weak", "weak", "weak",
  "severe", "severe", "severe", "inactive", "inactive",
];

const ROLE_TARGETS: Record<Role, { watch: number; correct: number; qaMin: number; qaMax: number; lastMax: number }> = {
  star: { watch: 96, correct: 95, qaMin: 5, qaMax: 12, lastMax: 1 },
  avg: { watch: 86, correct: 82, qaMin: 4, qaMax: 11, lastMax: 2 },
  weak: { watch: 52, correct: 58, qaMin: 1, qaMax: 5, lastMax: 4 },
  severe: { watch: 22, correct: 42, qaMin: 0, qaMax: 2, lastMax: 7 },
  inactive: { watch: 6, correct: 28, qaMin: 0, qaMax: 1, lastMax: 14 },
};

type SolutionPriority = "high" | "med" | "low";
type SolutionKind = "remediate" | "reengage" | "celebrate" | "accelerate";

const NAMED: Record<
  string,
  { watchPct: number; correctPct: number; qaCount: number; lastDays: number; priority: SolutionPriority; kind: SolutionKind }
> = {
  박서준: { watchPct: 38, correctPct: 52, qaCount: 1, lastDays: 3, priority: "high", kind: "remediate" },
  이지원: { watchPct: 72, correctPct: 45, qaCount: 4, lastDays: 1, priority: "high", kind: "remediate" },
  최예린: { watchPct: 68, correctPct: 78, qaCount: 15, lastDays: 0, priority: "med", kind: "reengage" },
  정태우: { watchPct: 76, correctPct: 72, qaCount: 7, lastDays: 1, priority: "med", kind: "remediate" },
  윤서영: { watchPct: 92, correctPct: 92, qaCount: 6, lastDays: 0, priority: "low", kind: "celebrate" },
  강민호: { watchPct: 98, correctPct: 96, qaCount: 11, lastDays: 0, priority: "low", kind: "accelerate" },
};

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

type Student = {
  idx: number;
  id: string;
  name: string;
  initial: string;
  role: Role;
  studentNo: string;
  cohort: string;
  watchPct: number;
  correctPct: number;
  qaCount: number;
  watchMins: number;
  streak: number;
  lastDays: number;
  perChap: Array<number | null>;
  weakChapter: number;
  spark: number[];
  status: "star" | "active" | "normal" | "attention" | "inactive";
  priority: SolutionPriority | null;
  solutionKind: SolutionKind | null;
};

function makeStudents(seed: number, courseId: string, periodId: string): Student[] {
  let s = (seed * 2654435761 + courseId.length * 7919 + periodId.length * 31) | 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };

  const courseBias =
    ({ "gram-2026s": 0, "list-2026s": -6, "cult-2026s": 4, "gram-2025f": 2, all: -2 } as Record<string, number>)[
      courseId
    ] || 0;
  const periodBias =
    ({ w1: -3, w2: -1, w4: 0, sem: 2, cust: 1 } as Record<string, number>)[periodId] || 0;
  const totalBias = courseBias + periodBias;

  return STUDENT_NAMES.map((name, idx) => {
    const role = ROLE_AT[idx];
    const t = ROLE_TARGETS[role];
    const ov = NAMED[name];

    const r1 = rand();
    const r2 = rand();
    const r3 = rand();
    const r4 = rand();

    let watchPct: number;
    let correctPct: number;
    let qaCount: number;
    let lastDays: number;
    if (ov) {
      watchPct = clamp(ov.watchPct + Math.round((r1 - 0.5) * 5), 0, 100);
      correctPct = clamp(ov.correctPct + Math.round((r2 - 0.5) * 5), 0, 100);
      qaCount = Math.max(0, ov.qaCount + Math.round((r3 - 0.5) * 2));
      lastDays = ov.lastDays;
    } else {
      watchPct = clamp(Math.round(t.watch + totalBias + (r1 - 0.5) * 10), 0, 100);
      correctPct = clamp(Math.round(t.correct + totalBias + (r2 - 0.5) * 10), 0, 100);
      qaCount = Math.max(0, Math.round(t.qaMin + r3 * (t.qaMax - t.qaMin)));
      lastDays = Math.round(r4 * t.lastMax);
    }

    let status: Student["status"];
    if (role === "inactive" || lastDays >= 5 || watchPct < 20) status = "inactive";
    else if (watchPct >= 90 && correctPct >= 90) status = "star";
    else if (qaCount >= 10 && correctPct >= 75) status = "active";
    else if (correctPct < 60 || watchPct < 50) status = "attention";
    else status = "normal";

    const watchMins = Math.round(watchPct * (5 + r1 * 3));
    const streak = role === "star" ? Math.round(12 + r3 * 8) : Math.round(r3 * 8);

    const reachedUpto = Math.max(0, Math.min(7, Math.floor(watchPct / 13)));
    const perChap: Array<number | null> = CHAPTERS.map((ch, ci) => {
      if (ci > reachedUpto) return null;
      let v = correctPct + (rand() - 0.5) * 22;
      if (ch.hard) v -= 12;
      if (ci === 6) v = clamp(Math.round(v - 8), 5, 100);
      if (ci === 3) v = clamp(Math.round(v - 4), 5, 100);
      return clamp(Math.round(v), 0, 100);
    });
    if (perChap[0] == null) perChap[0] = clamp(Math.round(correctPct + (rand() - 0.5) * 14), 0, 100);

    const weakChapter = perChap.reduce<number>(
      (best, v, i) => (v != null && v < (perChap[best] ?? 999) ? i : best),
      0,
    );

    const spark = Array.from({ length: 8 }, (_, k) =>
      clamp(Math.round(correctPct - 6 + k * 1.2 + (rand() - 0.5) * 8), 15, 100),
    );

    const cohorts = ["24학번", "25학번", "23학번", "24학번", "25학번"];
    const studentNo = "20" + (20 + (idx % 5)) + String(100100 + ((idx * 137) % 89000)).slice(-4);

    return {
      idx,
      id: `s${String(idx + 1).padStart(2, "0")}`,
      name,
      initial: name[0],
      role,
      studentNo,
      cohort: cohorts[idx % cohorts.length],
      watchPct,
      correctPct,
      qaCount,
      watchMins,
      streak,
      lastDays,
      perChap,
      weakChapter,
      spark,
      status,
      priority: ov ? ov.priority : null,
      solutionKind: ov ? ov.kind : null,
    };
  });
}

type StatCardData = {
  kind: "success" | "violet" | "cyan" | "pink";
  palette: PaletteKey;
  label: string;
  value?: number;
  valueRaw?: number;
  suffix?: string;
  sub: string;
  delta: number;
  deltaSuffix: string;
  spark: number[];
};

function makeCards(students: Student[]): StatCardData[] {
  const n = students.length;
  const watchAvg = Math.round(students.reduce((a, s) => a + s.watchPct, 0) / n);
  const correctAvg = Math.round(students.reduce((a, s) => a + s.correctPct, 0) / n);
  const watchMinsAvg = Math.round(students.reduce((a, s) => a + s.watchMins, 0) / n);
  const qaTotal = students.reduce((a, s) => a + s.qaCount, 0);
  const watchHourFrac = watchMinsAvg / 60;
  const done = students.filter((s) => s.watchPct >= 90).length;

  const spark = (base: number, amp: number, count = 8) =>
    Array.from({ length: count }, (_, i) =>
      clamp(Math.round(base - amp + i * (amp * 0.4) + Math.sin(i * 13.7 + base) * amp * 0.4), 0, 100),
    );

  return [
    {
      kind: "success",
      palette: "success",
      label: "전체 시청 완료율",
      value: watchAvg,
      suffix: "%",
      sub: `47명 중 ${done}명 완료`,
      delta: 4,
      deltaSuffix: "%p",
      spark: spark(watchAvg, 5),
    },
    {
      kind: "violet",
      palette: "violet",
      label: "평균 정답률",
      value: correctAvg,
      suffix: "%",
      sub: "5개 영상 · 인터스티셜 퀴즈 192문항",
      delta: 2,
      deltaSuffix: "%p",
      spark: spark(correctAvg, 4),
    },
    {
      kind: "cyan",
      palette: "cyan",
      label: "평균 학습 시간",
      valueRaw: watchHourFrac,
      sub: "학생당 · 이번 학기 누적",
      delta: 32,
      deltaSuffix: "분",
      spark: spark(60, 8),
    },
    {
      kind: "pink",
      palette: "pink",
      label: "AI Q&A 활용도",
      value: qaTotal,
      sub: `학생 1인 평균 ${(qaTotal / n).toFixed(1)}건`,
      delta: 89,
      deltaSuffix: "건",
      spark: spark(qaTotal / 6, 18),
    },
  ];
}

type Series = { id: string; label: string; palette: PaletteKey; primary: boolean; data: number[] };

function makeSeries(seed: number, courseId: string, periodId: string, students: Student[]): Series[] {
  let s = (seed + courseId.length + periodId.length * 17) | 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  const baseEnd = Math.round(students.reduce((a, st) => a + st.watchPct, 0) / students.length);
  const buildSeries = (start: number, end: number, jitter: number) => {
    const arr: number[] = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const v = start * (1 - t) + end * t + (rand() - 0.5) * jitter;
      arr.push(clamp(Math.round(v), 0, 100));
    }
    return arr;
  };
  return [
    { id: "ba", label: '把자문(<span class="han">把字句</span>) 입문', palette: "gold", primary: true, data: buildSeries(18, baseEnd, 5) },
    { id: "bei", label: '被자문(<span class="han">被字句</span>)', palette: "violet", primary: false, data: buildSeries(14, clamp(baseEnd + 8, 0, 96), 7) },
    { id: "cmp", label: '비교 구문(<span class="han">比较句</span>)', palette: "cyan", primary: false, data: buildSeries(22, clamp(baseEnd + 2, 0, 94), 8) },
    { id: "ms", label: '양사 정리(<span class="han">量词</span>)', palette: "pink", primary: false, data: buildSeries(28, clamp(baseEnd - 4, 0, 90), 9) },
    { id: "tns", label: '시제 표현(<span class="han">时态</span>)', palette: "rose", primary: false, data: buildSeries(12, clamp(baseEnd - 10, 0, 86), 10) },
  ];
}

type DonutDatum = { label: string; value: number; palette: PaletteKey };

function makeDonut(students: Student[]): DonutDatum[] {
  const done = students.filter((s) => s.watchPct >= 90).length;
  const inProg = students.filter((s) => s.watchPct >= 40 && s.watchPct < 90).length;
  const started = students.filter((s) => s.watchPct >= 10 && s.watchPct < 40).length;
  const none = students.filter((s) => s.watchPct < 10).length;
  return [
    { label: "완료", value: done, palette: "success" },
    { label: "진행 중", value: inProg, palette: "gold" },
    { label: "시작만", value: started, palette: "cyan" },
    { label: "미시청", value: none, palette: "gray" },
  ];
}

type ChapterAgg = Chapter & { avg: number; below60: number; reach: number };

function makeChapterAgg(students: Student[]): ChapterAgg[] {
  return CHAPTERS.map((ch) => {
    const vals = students.map((s) => s.perChap[ch.idx]).filter((v): v is number => v != null);
    return {
      ...ch,
      avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
      below60: vals.filter((v) => v < 60).length,
      reach: vals.length,
    };
  });
}

function makePauseHotspots() {
  return [
    { slide: 4, label: "把의 전치사 vs 동사 구분", han: "功能", timestamp: "02:45", counts: 14, kind: "pause" },
    { slide: 7, label: "✗ 我把汉语学 — 어순 오류", han: "常错", timestamp: "05:18", counts: 11, kind: "rewind" },
    { slide: 5, label: "我把书放在桌子上了 예시", han: "例句", timestamp: "03:42", counts: 9, kind: "pause" },
  ];
}

type Briefing = {
  date: string;
  weekLabel: string;
  findings: Array<{ accent: "rose" | "gold" | "violet"; kicker: string; title: string; body: string }>;
  suggestions: Array<{
    priority: SolutionPriority;
    position: string;
    title: string;
    body: string;
    activities: Array<{ kind: "do" | "play" | "mic"; text: string }>;
    duration: string;
  }>;
  predictions: Array<{ label: string; from: string; to: string; delta: string; tone: "success" }>;
};

function makeBriefing(
  students: Student[],
  chapterAgg: ChapterAgg[],
  hotspots: ReturnType<typeof makePauseHotspots>,
): Briefing {
  const ch7 = chapterAgg[6];
  return {
    date: "2026년 5월 13일",
    weekLabel: "다음 대면 수업 (3주차)",
    findings: [
      {
        accent: "rose",
        kicker: "학습 부진 패턴",
        title: `학생 <strong>${ch7.below60}명</strong>이 챕터 7 <strong>'흔한 오류'</strong>에서 평균 정답률 <strong>${ch7.avg}%</strong>로 어려워했어요`,
        body: '특히 把자문에서 동사 뒤 보어를 빠뜨리는 실수가 반복됩니다. 예: <span class="brief-bad">✗ 我把汉语学</span> → <span class="brief-good">✓ 我把汉语学好了</span>',
      },
      {
        accent: "gold",
        kicker: "재시청 패턴",
        title: '챕터 4 <strong><span class="han">把</span>의 문법적 기능</strong>은 평균 재시청 <strong>2.3회</strong>로 학생들이 한 번에 이해하지 못하고 있어요',
        body: `타임스탬프 <strong>02:45</strong> 구간 (<span class="han">把</span>의 전치사 vs 동사 구분)이 가장 자주 멈춰지는 지점입니다. 같은 학생이 ${hotspots[0].counts}회 되감기했어요.`,
      },
      {
        accent: "violet",
        kicker: "Q&A 분석",
        title: 'Q&A <strong>47건 중 23건</strong>이 <span class="han">把字句</span>과 <span class="han">被字句</span>의 비교를 묻습니다',
        body: '다음 강의(<span class="han">被字句</span>)와 연결 지점으로 활용 가능해요. 학생들의 자발적 호기심이 다음 단원에 집중되어 있습니다.',
      },
    ],
    suggestions: [
      {
        priority: "high",
        position: "첫 15분",
        title: "챕터 7 보강",
        body: "흔한 오류 부분을 짧은 예제로 다시 짚어주세요.",
        activities: [
          { kind: "do", text: "잘못된 把자문 5개 → 학생이 직접 고치기" },
          { kind: "do", text: '"我把汉语学" → "我把汉语学好了" 패턴 연습' },
        ],
        duration: "15분",
      },
      {
        priority: "med",
        position: "중간 30분",
        title: "챕터 4 심화",
        body: '<span class="han">把</span>의 전치사 기능을 다양한 예시로 재설명.',
        activities: [
          { kind: "play", text: "02:45 타임스탬프 영상 함께 보기" },
          { kind: "mic", text: "학생 질문 받기 (Q&A 인박스에 12건 대기 중)" },
        ],
        duration: "30분",
      },
      {
        priority: "low",
        position: "마지막 15분",
        title: "다음 주 예고",
        body: '<span class="han">被字句</span>(피동문) 도입 — <span class="han">把字句</span>과 비교 미리 보기.',
        activities: [
          { kind: "do", text: "학생들이 자주 묻는 비교 포인트 답변" },
          { kind: "play", text: "다음 영상 예고" },
        ],
        duration: "15분",
      },
    ],
    predictions: [
      { label: "챕터 7 정답률", from: ch7.avg + "%", to: "78%", delta: "▲ " + (78 - ch7.avg) + "%p", tone: "success" },
      {
        label: "활성 학습자",
        from: students.filter((s) => s.status !== "inactive").length + "명",
        to: "52명",
        delta: "전체 등록 도달",
        tone: "success",
      },
      { label: "Q&A 미응답", from: "12건", to: "0건", delta: "완전 해소", tone: "success" },
    ],
  };
}

type SolutionProfile = {
  name: string;
  priority: SolutionPriority;
  kindLabel: string;
  title: string;
  analysis: string;
  actions: Array<{ icon: string; label: string }>;
  student: Student;
};

function makeSolutions(students: Student[]): SolutionProfile[] {
  const profiles = [
    {
      name: "박서준",
      priority: "high" as const,
      kindLabel: "기초 보강 + 격려",
      title: "기초 단계에서 막힘",
      analysis:
        '<span class="han">把字句</span> 기본 개념(챕터 1-2)에서 막혀있어요. 흔한 오류 챕터까지 진행하기 전 기초 보강이 필요합니다.',
      actions: [
        { icon: "video", label: "챕터 1-2 재학습 권장 알림" },
        { icon: "chat", label: "1:1 격려 메시지 발송" },
        { icon: "doc", label: "보충 자료 (PDF) 전송" },
      ],
    },
    {
      name: "이지원",
      priority: "high" as const,
      kindLabel: "챕터 7 집중 보강",
      title: "챕터 7 흔한 오류 약점",
      analysis:
        '시청은 정상이지만 흔한 오류 챕터에서 정답률 <strong>45%</strong>. 개념 오해가 명확하니 짧은 1:1이 효과적이에요.',
      actions: [
        { icon: "video", label: "챕터 7 보강 영상 (8분) 추천" },
        { icon: "doc", label: "오답 노트 자동 생성" },
        { icon: "users", label: "15분 1:1 미팅 제안" },
      ],
    },
    {
      name: "최예린",
      priority: "med" as const,
      kindLabel: "학습 가속",
      title: "Q&A 활발 · 진도만 조정",
      analysis: 'Q&A <strong>15건</strong>으로 매우 적극적. 진도 페이스를 조금 끌어올리면 우수 그룹 진입 가능합니다.',
      actions: [
        { icon: "video", label: "진도 페이스 조정 안내" },
        { icon: "chat", label: "심화 토론 질문 추천" },
        { icon: "doc", label: "다음 챕터 미리보기 자료" },
      ],
    },
    {
      name: "정태우",
      priority: "med" as const,
      kindLabel: "재시청 구간 보강",
      title: "챕터 4 반복 재시청",
      analysis:
        '챕터 4 (<span class="han">把</span>의 문법적 기능)를 <strong>3회</strong> 재시청. 다른 각도의 보조 자료가 필요합니다.',
      actions: [
        { icon: "doc", label: "보조 설명 PDF 추천" },
        { icon: "video", label: "관련 예시 추가 영상" },
        { icon: "users", label: "오피스 아워 안내" },
      ],
    },
    {
      name: "윤서영",
      priority: "low" as const,
      kindLabel: "우수 격려",
      title: "모든 지표 우수",
      analysis: "시청·정답률·Q&A 모두 우수. 학습 동기 유지를 위한 격려와 다음 단원 미리 안내가 효과적이에요.",
      actions: [
        { icon: "chat", label: "수고했어요 격려 메시지" },
        { icon: "video", label: '<span class="han">被字句</span> 미리보기 자료 제공' },
        { icon: "badge", label: "학습 인증 배지 발급" },
      ],
    },
    {
      name: "강민호",
      priority: "low" as const,
      kindLabel: "고급 자료",
      title: "심화 학습 욕구 강함",
      analysis: "모든 지표가 최상위. 학습 욕구가 강해 표준 진도 외 심화 자료가 효과적입니다.",
      actions: [
        { icon: "doc", label: '<span class="han">把</span>/<span class="han">被</span> 비교 분석 에세이 과제' },
        { icon: "video", label: "심화 강독 자료 제공" },
        { icon: "users", label: "튜터링 멘토 추천" },
      ],
    },
  ];
  return profiles
    .map((p) => ({ ...p, student: students.find((s) => s.name === p.name) }))
    .filter((p): p is SolutionProfile => p.student != null);
}

function makeAll(seed: number, courseId: string, periodId: string) {
  const students = makeStudents(seed, courseId, periodId);
  const cards = makeCards(students);
  const weeks = Array.from({ length: 12 }, (_, i) => `${i + 1}주`);
  const series = makeSeries(seed, courseId, periodId, students);
  const donut = makeDonut(students);
  const chapterAgg = makeChapterAgg(students);
  const hotspots = makePauseHotspots();
  const briefing = makeBriefing(students, chapterAgg, hotspots);
  const solutions = makeSolutions(students);
  return {
    students,
    cards,
    weeks,
    series,
    donut,
    chapters: CHAPTERS,
    chapterAgg,
    hotspots,
    briefing,
    solutions,
    courseDone: donut[0].value,
    courseTotal: students.length,
  };
}

/* ═══════════════ charts ═══════════════ */

function useCountUp(target: number, duration = 1500, dep: string) {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    const start = performance.now();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, dep]);

  return value;
}

function Sparkline({ data, palette = "success" }: { data: number[]; palette?: PaletteKey }) {
  const W = 110;
  const H = 32;
  const PAD = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xs = data.map((_, i) => PAD + (i / (data.length - 1)) * (W - 2 * PAD));
  const ys = data.map((v) => H - PAD - ((v - min) / range) * (H - 2 * PAD));
  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${xs[xs.length - 1].toFixed(1)} ${H} L ${xs[0].toFixed(1)} ${H} Z`;
  const colors = PALETTE[palette];

  return (
    <svg className="stat-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={areaPath} fill={colors.area} className="stat-spark-fill" />
      <path d={linePath} stroke={colors.stroke} className="stat-spark-line" />
    </svg>
  );
}

function LineChart({ series, weeks }: { series: Series[]; weeks: string[] }) {
  const W = 720;
  const H = 280;
  const PADL = 36;
  const PADR = 14;
  const PADT = 12;
  const PADB = 28;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const yMin = 0;
  const yMax = 100;
  const yTicks = [0, 25, 50, 75, 100];

  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<{ wkIdx: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const xOf = (i: number) => PADL + (i / (weeks.length - 1)) * innerW;
  const yOf = (v: number) => PADT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const visible = series.filter((s) => !off.has(s.id));

  // 진입 시 라인이 그려지는 1회성 애니메이션. effect 안에서 동기 setState 를
  // 호출하지 않도록 schedule 만 한다 (재트리거는 부모의 key 교체로 처리).
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleMove = (e: React.MouseEvent) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < weeks.length; i++) {
      const d = Math.abs(xOf(i) - relX);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHover({ wkIdx: best });
  };

  const toggleLine = (id: string) => {
    setOff((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const tooltipPct = hover ? (xOf(hover.wkIdx) / W) * 100 : 0;

  return (
    <div className="line-chart" ref={wrapRef} onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {yTicks.map((t) => (
          <g key={t}>
            <line className="chart-grid-line" x1={PADL} y1={yOf(t)} x2={W - PADR} y2={yOf(t)} />
            <text className="chart-axis-y-label" x={PADL - 8} y={yOf(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        {weeks.map((w, i) =>
          i % 2 === 0 || i === weeks.length - 1 ? (
            <text key={i} className="chart-axis-x-label" x={xOf(i)} y={H - 8} textAnchor="middle">
              {w}
            </text>
          ) : null,
        )}

        {visible.map((s, si) => {
          const pts = s.data.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" L ");
          const path = `M ${pts}`;
          const area = `${path} L ${xOf(s.data.length - 1)},${yOf(0)} L ${xOf(0)},${yOf(0)} Z`;
          const colors = PALETTE[s.palette];
          return (
            <g key={s.id}>
              {s.primary && (
                <path
                  className="line-area"
                  d={area}
                  fill={colors.area}
                  style={{ opacity: drawn ? 1 : 0, transitionDelay: `${si * 80}ms` }}
                />
              )}
              <path
                className={"line-path" + (s.primary ? " primary" : "")}
                d={path}
                stroke={colors.stroke}
                style={{
                  strokeDasharray: 1400,
                  strokeDashoffset: drawn ? 0 : 1400,
                  transition: `stroke-dashoffset 1500ms var(--an-ease-out) ${si * 80}ms, opacity 240ms`,
                }}
              />
            </g>
          );
        })}

        {hover && (
          <g>
            <line
              x1={xOf(hover.wkIdx)}
              y1={PADT}
              x2={xOf(hover.wkIdx)}
              y2={H - PADB}
              stroke="rgba(10,10,10,0.20)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {visible.map((s) => {
              const v = s.data[hover.wkIdx];
              return (
                <circle
                  key={s.id}
                  cx={xOf(hover.wkIdx)}
                  cy={yOf(v)}
                  r={s.primary ? 5 : 4}
                  fill="#FFFFFF"
                  stroke={PALETTE[s.palette].flat}
                  strokeWidth={s.primary ? 2.5 : 2}
                />
              );
            })}
          </g>
        )}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{ left: `${tooltipPct}%`, top: 0 }}>
          <div className="chart-tooltip-week">{weeks[hover.wkIdx]}</div>
          {visible.map((s) => (
            <div className="tooltip-row" key={s.id}>
              <span className="tooltip-label">
                <span className="swatch" style={{ background: PALETTE[s.palette].flat }} />
                <span dangerouslySetInnerHTML={{ __html: s.label }} />
              </span>
              <span className="tooltip-val">{s.data[hover.wkIdx]}%</span>
            </div>
          ))}
          <div
            className="tooltip-row"
            style={{ marginTop: 4, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.10)" }}
          >
            <span className="tooltip-meta">시청 학생</span>
            <span className="tooltip-meta">
              {Math.round(
                (visible.reduce((a, s) => a + s.data[hover.wkIdx], 0) / Math.max(visible.length, 1)) * 0.47,
              )}
              명
            </span>
          </div>
        </div>
      )}

      <div className="chart-legend" style={{ marginTop: 8 }}>
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            className={"legend-item" + (off.has(s.id) ? " off" : "")}
            onClick={() => toggleLine(s.id)}
          >
            <span className="legend-swatch" style={{ background: PALETTE[s.palette].flat }} />
            <span dangerouslySetInnerHTML={{ __html: s.label }} />
            {s.primary && <span className="legend-primary-tag">현재 강의</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Donut({ data, total, dep }: { data: DonutDatum[]; total: number; dep: string }) {
  const R = 76;
  const STROKE = 24;
  const SIZE = 200;
  const C = 2 * Math.PI * R;
  const sum = data.reduce((a, d) => a + d.value, 0) || 1;
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, []);

  const animatedTotal = useCountUp(total, 1400, dep);

  // 누적 offset 을 immutable 하게 계산 (render 중 변수 재할당 금지 규칙 준수).
  const segs = data.map((d, i) => {
    const cumulativeBefore = data
      .slice(0, i)
      .reduce((acc, prev) => acc + C * (prev.value / sum), 0);
    const frac = d.value / sum;
    const len = C * frac;
    const offset = -cumulativeBefore;
    return { ...d, len, offset, idx: i, frac };
  });

  return (
    <div className="donut-wrap">
      <div className="donut-svg-wrap">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--an-bg-subtle)" strokeWidth={STROKE} />
          {segs.map((s) => {
            const colors = PALETTE[s.palette];
            const dim = hover != null && hover !== s.idx;
            const isHover = hover === s.idx;
            return (
              <circle
                key={s.idx}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                className={"donut-segment " + (dim ? "dim " : "") + (isHover ? "hover" : "")}
                stroke={colors.stroke || colors.flat}
                strokeDasharray={`${drawn ? s.len : 0} ${C}`}
                strokeDashoffset={s.offset}
                style={{
                  transition: `stroke-dasharray 1200ms var(--an-ease-out) ${s.idx * 120}ms, transform 200ms var(--an-ease-spring), opacity 200ms`,
                }}
                onMouseEnter={() => setHover(s.idx)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <div className="donut-center-number numeric">{Math.round(animatedTotal)}</div>
          <div className="donut-center-label">총 학생</div>
        </div>
      </div>

      <div className="donut-legend">
        {data.map((d, i) => (
          <div
            key={i}
            className="donut-legend-item"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="donut-legend-swatch" style={{ background: PALETTE[d.palette].flat }} />
            <div className="donut-legend-text">
              <span className="donut-legend-count numeric">
                {d.value}명 · {Math.round((d.value / sum) * 100)}%
              </span>
              <span className="donut-legend-name">{d.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ [3] student cards ═══════════════ */

const STATUS_BADGE: Record<Student["status"], { label: string; cls: string; desc: string }> = {
  star: { label: "완료", cls: "completed", desc: "시청 완료" },
  active: { label: "활발", cls: "engaged", desc: "Q&A 적극" },
  normal: { label: "보통", cls: "normal", desc: "진행 중" },
  attention: { label: "부진", cls: "attention", desc: "보강 필요" },
  inactive: { label: "미시청", cls: "inactive", desc: "시청 끊김" },
};

function progressPalette(pct: number) {
  if (pct >= 90) return { stroke: "url(#an-grad-success)" };
  if (pct >= 70) return { stroke: "url(#an-area-success)" };
  if (pct >= 50) return { stroke: "url(#an-grad-gold)" };
  if (pct >= 30) return { stroke: "url(#an-grad-rose)" };
  return { stroke: "url(#an-grad-rose)" };
}

function StudentCard({ stu, index, onOpen }: { stu: Student; index: number; onOpen: (s: Student) => void }) {
  const status = STATUS_BADGE[stu.status];
  const ppal = progressPalette(stu.watchPct);
  return (
    <button
      type="button"
      className="sgrid-card"
      style={{ animationDelay: `${Math.min(index, 30) * 22}ms` }}
      onClick={() => onOpen(stu)}
    >
      <div className="sgrid-head">
        <div className="sgrid-avatar">{stu.initial}</div>
        <div className="sgrid-head-block">
          <div className="sgrid-name">{stu.name}</div>
          <div className="sgrid-meta numeric">
            {stu.studentNo} · {stu.cohort}
          </div>
        </div>
      </div>

      <div className="sgrid-bars">
        <div className="sgrid-bar-row">
          <span className="sgrid-bar-label">진도</span>
          <div className="micro-bar-track">
            <div className="micro-bar-fill" style={{ width: `${stu.watchPct}%`, background: ppal.stroke }} />
          </div>
          <span className="sgrid-bar-value numeric">{stu.watchPct}%</span>
        </div>
        <div className="sgrid-bar-row">
          <span className="sgrid-bar-label">정답률</span>
          <div className="micro-bar-track">
            <div className="micro-bar-fill" style={{ width: `${stu.correctPct}%`, background: PALETTE.violet.stroke }} />
          </div>
          <span className="sgrid-bar-value numeric">{stu.correctPct}%</span>
        </div>
      </div>

      <div className="sgrid-foot">
        <div className="sgrid-stats">
          <span className="sgrid-stat">
            <Icon name="chat" size={12} strokeWidth={2.2} />
            <span className="numeric">{stu.qaCount}</span>건
          </span>
          <span className="sgrid-stat">
            <Icon name="clock" size={12} strokeWidth={2.2} />
            <span className="numeric">
              {Math.floor(stu.watchMins / 60)}h {stu.watchMins % 60}m
            </span>
          </span>
        </div>
        <span className={"sgrid-badge " + status.cls}>
          <span className="sgrid-badge-dot" />
          {status.label}
        </span>
      </div>
    </button>
  );
}

function StudentPlaceholderModal({ stu, onClose }: { stu: Student; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="placeholder-modal" role="dialog" aria-modal="true" aria-label={`${stu.name} 상세`}>
        <div className="placeholder-modal-head">
          <div className="sgrid-avatar lg">{stu.initial}</div>
          <div>
            <div className="placeholder-modal-name">{stu.name}</div>
            <div className="placeholder-modal-meta numeric">
              {stu.studentNo} · {stu.cohort}
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>
        <div className="placeholder-modal-body">
          <div className="placeholder-modal-stats">
            <div className="placeholder-modal-stat">
              <span className="placeholder-modal-stat-label">진도</span>
              <span className="placeholder-modal-stat-value numeric">{stu.watchPct}%</span>
            </div>
            <div className="placeholder-modal-stat">
              <span className="placeholder-modal-stat-label">정답률</span>
              <span className="placeholder-modal-stat-value numeric">{stu.correctPct}%</span>
            </div>
            <div className="placeholder-modal-stat">
              <span className="placeholder-modal-stat-label">Q&amp;A</span>
              <span className="placeholder-modal-stat-value numeric">{stu.qaCount}건</span>
            </div>
            <div className="placeholder-modal-stat">
              <span className="placeholder-modal-stat-label">최근 활동</span>
              <span className="placeholder-modal-stat-value numeric">
                {stu.lastDays === 0 ? "오늘" : `${stu.lastDays}일 전`}
              </span>
            </div>
          </div>
          <div className="placeholder-modal-soon">
            <div className="placeholder-modal-soon-tag">개발 중</div>
            <div className="placeholder-modal-soon-title">학생 개인 상세 페이지</div>
            <div className="placeholder-modal-soon-body">
              영상별 시청 구간, 챕터별 정답 추이, 받은/보낸 Q&amp;A 로그, 학습 스트릭 캘린더를 한 화면에서 확인할 수
              있습니다.
              <br />
              <strong>다음 단계에서 추가됩니다</strong>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StudentCardsSection({ students }: { students: Student[] }) {
  const [filter, setFilter] = useState<"all" | "completed" | "inProgress" | "attention">("all");
  const [sortBy, setSortBy] = useState<"progress" | "correct" | "activity" | "risk">("progress");
  const [open, setOpen] = useState<Student | null>(null);

  const counts = useMemo(() => {
    const c = { all: students.length, completed: 0, inProgress: 0, attention: 0 };
    students.forEach((s) => {
      if (s.watchPct >= 90) c.completed++;
      else if (s.watchPct >= 30 && s.watchPct < 90) c.inProgress++;
      if (s.status === "attention" || s.status === "inactive") c.attention++;
    });
    return c;
  }, [students]);

  const filtered = useMemo(() => {
    let arr = students;
    if (filter === "completed") arr = arr.filter((s) => s.watchPct >= 90);
    if (filter === "inProgress") arr = arr.filter((s) => s.watchPct >= 30 && s.watchPct < 90);
    if (filter === "attention") arr = arr.filter((s) => s.status === "attention" || s.status === "inactive");

    arr = [...arr];
    if (sortBy === "progress") arr.sort((a, b) => b.watchPct - a.watchPct);
    if (sortBy === "correct") arr.sort((a, b) => b.correctPct - a.correctPct);
    if (sortBy === "activity") arr.sort((a, b) => b.qaCount - a.qaCount);
    if (sortBy === "risk")
      arr.sort((a, b) => {
        const order: Record<Student["status"], number> = {
          inactive: 0,
          attention: 1,
          normal: 2,
          active: 3,
          star: 4,
        };
        return order[a.status] - order[b.status] || a.watchPct - b.watchPct;
      });
    return arr;
  }, [students, filter, sortBy]);

  return (
    <section id="an-sec-students">
      <div className="section-head">
        <div className="section-head-left">
          <h2 className="section-title">학생 개별 진척도</h2>
          <span className="section-sub">각 학생의 학습 현황과 액션이 필요한 항목을 확인하세요</span>
        </div>

        <div className="sgrid-toolbar">
          <div className="seg">
            <button type="button" className={"seg-item" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>
              전체 <span className="seg-count numeric">{counts.all}</span>
            </button>
            <button
              type="button"
              className={"seg-item" + (filter === "completed" ? " active" : "")}
              onClick={() => setFilter("completed")}
            >
              완료 <span className="seg-count numeric">{counts.completed}</span>
            </button>
            <button
              type="button"
              className={"seg-item" + (filter === "inProgress" ? " active" : "")}
              onClick={() => setFilter("inProgress")}
            >
              진행 <span className="seg-count numeric">{counts.inProgress}</span>
            </button>
            <button
              type="button"
              className={"seg-item" + (filter === "attention" ? " active" : "")}
              onClick={() => setFilter("attention")}
            >
              부진 <span className="seg-count numeric">{counts.attention}</span>
            </button>
          </div>

          <div className="sort-block">
            <span className="sort-label">정렬</span>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="학생 정렬 기준"
            >
              <option value="progress">진도 높은 순</option>
              <option value="correct">정답률 높은 순</option>
              <option value="activity">활동 많은 순</option>
              <option value="risk">주의 필요 순</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="sgrid-empty">조건에 맞는 학생이 없어요.</div>
      ) : (
        <div className="sgrid">
          {filtered.map((stu, i) => (
            <StudentCard key={stu.id} stu={stu} index={i} onOpen={setOpen} />
          ))}
        </div>
      )}

      {open && <StudentPlaceholderModal stu={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ═══════════════ [4] heatmap ═══════════════ */

function cellColor(v: number | null) {
  if (v == null) return { bg: "#E5E5E0", fg: "rgba(10,10,10,0.30)" };
  if (v >= 90) return { bg: "#10B981", fg: "#FFFFFF" };
  if (v >= 70) return { bg: "#34D399", fg: "#0B3D2C" };
  if (v >= 50) return { bg: "#FFB627", fg: "#5C3D0A" };
  if (v >= 30) return { bg: "#FBA77B", fg: "#5C2D0A" };
  return { bg: "#EF4444", fg: "#FFFFFF" };
}

type HoverCell = { stu: Student; ch: Chapter; v: number | null; x: number; y: number };

function HeatmapSection({
  students,
  chapters,
  chapterAgg,
}: {
  students: Student[];
  chapters: Chapter[];
  chapterAgg: ChapterAgg[];
}) {
  const [hover, setHover] = useState<HoverCell | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(
    () =>
      [...students].sort((a, b) => {
        const ar = a.perChap.filter((v) => v != null && v < 60).length;
        const br = b.perChap.filter((v) => v != null && v < 60).length;
        if (ar !== br) return br - ar;
        return a.correctPct - b.correctPct;
      }),
    [students],
  );

  const hardest = [...chapterAgg].sort((a, b) => a.avg - b.avg)[0];
  const rewatched = chapterAgg[3];
  const inactives = students.filter((s) => s.status === "inactive" || s.lastDays >= 3);

  type InsightCard = {
    kind: "warn" | "violet" | "warn-soft";
    eyebrow: string;
    hero: string;
    sub: string;
    stats?: Array<{ label: string; value: string; tone: "rose" | "violet" }>;
    previewNames?: string[];
    extraCount?: number;
    action: string;
    gradient: PaletteKey;
  };

  const insightCards: InsightCard[] = [
    {
      kind: "warn",
      eyebrow: "가장 어려운 챕터",
      hero: hardest.title,
      sub: `챕터 ${hardest.idx + 1} · <span class="han">${hardest.han}</span>`,
      stats: [
        { label: "평균 정답률", value: hardest.avg + "%", tone: "rose" },
        { label: "어려워한 학생", value: hardest.below60 + "명", tone: "rose" },
      ],
      action: "이 부분 보강하기",
      gradient: "rose",
    },
    {
      kind: "violet",
      eyebrow: "재시청이 많은 구간",
      hero: rewatched.title,
      sub: `챕터 ${rewatched.idx + 1} · <span class="han">${rewatched.han}</span>`,
      stats: [
        { label: "평균 재시청", value: "2.3회", tone: "violet" },
        { label: "가장 멈춘 구간", value: "02:45", tone: "violet" },
      ],
      action: "영상 분석 보기",
      gradient: "violet",
    },
    {
      kind: "warn-soft",
      eyebrow: "주의 필요 학생",
      hero: inactives.length + "명",
      sub: "3일 이상 미시청",
      previewNames: inactives.slice(0, 3).map((s) => s.name),
      extraCount: Math.max(0, inactives.length - 3),
      action: "알림 발송",
      gradient: "gold",
    },
  ];

  const tooltipStyle: CSSProperties | undefined = hover ? { left: hover.x + 12, top: hover.y - 12 } : undefined;

  return (
    <section id="an-sec-weakness">
      <div className="section-head">
        <div className="section-head-left">
          <h2 className="section-title">취약점 분석</h2>
          <span className="section-sub">어느 챕터에서 학생들이 어려워하는지 한눈에 보세요</span>
        </div>
      </div>

      <div className="hm-row-wrap">
        <div className="chart-card hm-card">
          <div className="hm2-toolbar">
            <div className="hm2-legend">
              {[
                { v: "<30", col: "#EF4444" },
                { v: "30~50", col: "#FBA77B" },
                { v: "50~70", col: "#FFB627" },
                { v: "70~90", col: "#34D399" },
                { v: "90+", col: "#10B981" },
              ].map((s, i) => (
                <span className="hm2-legend-chip" key={i}>
                  <span className="hm2-legend-swatch" style={{ background: s.col }} />
                  {s.v}
                </span>
              ))}
              <span className="hm2-legend-chip muted">
                <span className="hm2-legend-swatch" style={{ background: "#E5E5E0" }} />
                미도달
              </span>
            </div>
            <span className="hm2-toolbar-hint">셀에 마우스를 올리면 자세히 보여드려요</span>
          </div>

          <div
            className="hm2-wrap"
            ref={wrapRef}
            onMouseMove={(e) => {
              if (!hover || !wrapRef.current) return;
              const rect = wrapRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              setHover((h) => (h ? { ...h, x, y } : null));
            }}
          >
            <div className="hm2-grid">
              <div className="hm2-corner">학생 \ 챕터</div>
              <div className="hm2-col-headers">
                {chapters.map((ch) => (
                  <div className="hm2-col-head" key={ch.idx} title={`${ch.title} · ${ch.han}`}>
                    <span className="hm2-col-num numeric">{ch.idx + 1}</span>
                    <span className="hm2-col-title">{ch.title}</span>
                  </div>
                ))}
              </div>

              <div className="hm2-body">
                {ordered.map((stu, ri) => (
                  <div className="hm2-row" key={stu.id}>
                    <div className="hm2-row-label">
                      <span className="hm2-row-avatar">{stu.initial}</span>
                      <span className="hm2-row-name">{stu.name}</span>
                    </div>
                    <div className="hm2-row-cells">
                      {chapters.map((ch, ci) => {
                        const v = stu.perChap[ch.idx];
                        const c = cellColor(v);
                        return (
                          <button
                            key={ci}
                            type="button"
                            className={"hm2-cell" + (v == null ? " empty" : "")}
                            style={{
                              background: c.bg,
                              color: c.fg,
                              animationDelay: `${ri * 12 + ci * 18}ms`,
                            }}
                            onMouseEnter={(e) => {
                              if (!wrapRef.current) return;
                              const rect = wrapRef.current.getBoundingClientRect();
                              setHover({
                                stu,
                                ch,
                                v,
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }}
                            onMouseLeave={() => setHover(null)}
                          >
                            <span className="hm2-cell-val">{v == null ? "·" : v}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hover && (
            <div className="hm2-tooltip" style={tooltipStyle}>
              <div className="hm2-tooltip-row">
                <span className="hm2-tooltip-name">{hover.stu.name}</span>
                <span className="hm2-tooltip-meta numeric">{hover.stu.cohort}</span>
              </div>
              <div className="hm2-tooltip-row">
                <span className="numeric">챕터 {hover.ch.idx + 1}</span>
                <span>· {hover.ch.title}</span>
                <span className="han" style={{ fontSize: "0.9em" }}>
                  {hover.ch.han}
                </span>
              </div>
              <div className="hm2-tooltip-foot">
                {hover.v == null ? (
                  <span className="hm2-tooltip-empty">아직 도달하지 않음</span>
                ) : (
                  <>
                    <span
                      className="numeric"
                      style={{
                        color: cellColor(hover.v).bg,
                        fontSize: 22,
                        fontWeight: 700,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {hover.v}%
                    </span>
                    <span className="hm2-tooltip-empty">
                      {hover.v >= 80 ? "잘 이해함" : hover.v >= 60 ? "보통" : hover.v >= 50 ? "주의" : "보강 필요"}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hm2-insights">
          {insightCards.map((card, i) => (
            <div className={"insight-card insight-" + card.kind} key={i} style={{ animationDelay: `${300 + i * 120}ms` }}>
              <div className="insight-eyebrow">
                <span className="insight-icon">
                  <Icon
                    name={card.kind === "violet" ? "video" : card.kind === "warn-soft" ? "users" : "chart"}
                    size={14}
                    gradient={card.gradient}
                    strokeWidth={2.2}
                  />
                </span>
                {card.eyebrow}
              </div>
              <div className="insight-hero">{card.hero}</div>
              <div className="insight-sub" dangerouslySetInnerHTML={{ __html: card.sub }} />

              {card.stats && (
                <div className="insight-stats">
                  {card.stats.map((st, j) => (
                    <div className={"insight-stat tone-" + st.tone} key={j}>
                      <span className="insight-stat-label">{st.label}</span>
                      <span className="insight-stat-value numeric">{st.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {card.previewNames && (
                <div className="insight-preview">
                  <div className="insight-preview-names">
                    {card.previewNames.map((n, j) => (
                      <span className="insight-preview-name" key={j}>
                        {n}
                      </span>
                    ))}
                    {card.extraCount != null && card.extraCount > 0 && (
                      <span className="insight-preview-extra numeric">외 {card.extraCount}명</span>
                    )}
                  </div>
                </div>
              )}

              <button type="button" className="insight-action">
                {card.action}
                <Icon name="chevron" size={12} strokeWidth={2.4} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ [5] briefing ═══════════════ */

const ACTIVITY_ICON: Record<"do" | "play" | "mic", { svg: ReactNode; color: string }> = {
  do: { svg: <path d="M5 13l4 4L19 7" />, color: "#10B981" },
  play: { svg: <polygon points="8 5 19 12 8 19 8 5" fill="currentColor" stroke="none" />, color: "#6366F1" },
  mic: {
    svg: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </>
    ),
    color: "#EC4899",
  },
};

const PRIORITY_META: Record<SolutionPriority, { label: string; dot: string; bg: string; text: string }> = {
  high: { label: "높음", dot: "#EF4444", bg: "rgba(239,68,68,0.10)", text: "#9F1239" },
  med: { label: "중간", dot: "#E89E0E", bg: "var(--an-gold-soft)", text: "var(--an-gold-on-light)" },
  low: { label: "낮음", dot: "#10B981", bg: "rgba(16,185,129,0.10)", text: "#0F766E" },
};

function BriefingSection({ briefing }: { briefing: Briefing }) {
  const total = briefing.suggestions.reduce((a, s) => a + (parseInt(s.duration, 10) || 0), 0);

  return (
    <section className="brief2-section" id="an-sec-briefing">
      <div className="brief2-card">
        <div className="brief2-bg" aria-hidden="true" />

        <header className="brief2-head">
          <div className="brief2-eyebrow">
            <Icon name="sparkles" size={14} gradient="gold" strokeWidth={2.2} />
            AI 분석 · 매일 자동 생성
          </div>
          <h2 className="brief2-title">
            <span className="brief2-title-emoji">🎓</span>
            AI 대면 수업 브리핑
          </h2>
          <p className="brief2-sub">다음 대면 수업에서 다룰 주제를 AI가 자동 제안합니다</p>

          <div className="brief2-date-row">
            <span className="brief2-date numeric">{briefing.date}</span>
            <span className="brief2-date-divider">·</span>
            <span className="brief2-week">{briefing.weekLabel}</span>
            <span className="brief2-gold-badge">
              <Icon name="sparkles" size={12} strokeWidth={2.4} /> 권장 60분
            </span>
          </div>
        </header>

        <div className="brief2-block">
          <div className="brief2-block-head">
            <span className="brief2-block-icon">📊</span>
            <h3 className="brief2-block-title">학습 데이터 요약</h3>
            <span className="brief2-block-meta">이번 주 · 3가지 핵심 발견</span>
          </div>
          <div className="brief2-findings">
            {briefing.findings.map((f, i) => (
              <div className={"brief2-finding accent-" + f.accent} key={i} style={{ animationDelay: `${i * 100}ms` }}>
                <div className="brief2-finding-num numeric">{i + 1}</div>
                <div className="brief2-finding-body">
                  <div className="brief2-finding-kicker">{f.kicker}</div>
                  <div className="brief2-finding-title" dangerouslySetInnerHTML={{ __html: f.title }} />
                  <div className="brief2-finding-text" dangerouslySetInnerHTML={{ __html: f.body }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="brief2-block">
          <div className="brief2-block-head">
            <span className="brief2-block-icon">💡</span>
            <h3 className="brief2-block-title">AI 제안 — 다음 대면 수업 구성</h3>
            <span className="brief2-block-meta numeric">총 {total}분 · 3단계</span>
          </div>
          <div className="brief2-suggestions">
            {briefing.suggestions.map((sg, i) => {
              const pri = PRIORITY_META[sg.priority];
              return (
                <div className={"brief2-suggestion priority-" + sg.priority} key={i} style={{ animationDelay: `${100 + i * 100}ms` }}>
                  <div className="brief2-suggestion-head">
                    <span className="brief2-suggestion-pos numeric">{sg.position}</span>
                    <span className="brief2-priority" style={{ color: pri.text, background: pri.bg }}>
                      <span className="brief2-priority-dot" style={{ background: pri.dot }} />
                      우선순위 {pri.label}
                    </span>
                  </div>
                  <h4 className="brief2-suggestion-title">{sg.title}</h4>
                  <p className="brief2-suggestion-body" dangerouslySetInnerHTML={{ __html: sg.body }} />
                  <div className="brief2-activities-label">추천 활동</div>
                  <ul className="brief2-activities">
                    {sg.activities.map((a, j) => (
                      <li className="brief2-activity" key={j}>
                        <span className="brief2-activity-icon" style={{ color: ACTIVITY_ICON[a.kind].color }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            {ACTIVITY_ICON[a.kind].svg}
                          </svg>
                        </span>
                        <span className="brief2-activity-text" dangerouslySetInnerHTML={{ __html: a.text }} />
                      </li>
                    ))}
                  </ul>
                  <div className="brief2-suggestion-foot">
                    <span className="brief2-suggestion-dur numeric">
                      <Icon name="clock" size={11} strokeWidth={2.4} /> 예상 {sg.duration}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="brief2-block">
          <div className="brief2-block-head">
            <span className="brief2-block-icon">🎯</span>
            <h3 className="brief2-block-title">학습 목표 달성 예측</h3>
            <span className="brief2-block-meta">수업 후 예상 변화</span>
          </div>
          <div className="brief2-predictions">
            {briefing.predictions.map((p, i) => (
              <div className="brief2-prediction" key={i} style={{ animationDelay: `${200 + i * 80}ms` }}>
                <div className="brief2-prediction-label">{p.label}</div>
                <div className="brief2-prediction-flow">
                  <span className="brief2-prediction-from numeric">{p.from}</span>
                  <svg className="brief2-prediction-arrow" width="28" height="14" viewBox="0 0 28 14" fill="none">
                    <defs>
                      <linearGradient id={`an-pred-arrow-${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#FFB627" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10B981" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 7 L24 7 M20 3 L24 7 L20 11"
                      stroke={`url(#an-pred-arrow-${i})`}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="brief2-prediction-to numeric">{p.to}</span>
                </div>
                <div className={"brief2-prediction-delta tone-" + p.tone}>{p.delta}</div>
              </div>
            ))}
          </div>
        </div>

        <footer className="brief2-foot">
          <button type="button" className="btn btn-ghost">
            <Icon name="download" size={14} strokeWidth={2.2} />
            수업 노트 PDF 다운로드
          </button>
          <button type="button" className="btn btn-ghost">
            <Icon name="sparkles" size={14} strokeWidth={2.2} />
            수업 자료 자동 생성
          </button>
          <button type="button" className="btn btn-gold">
            <Icon name="inbox" size={14} strokeWidth={2.2} />
            브리핑 메일 발송
          </button>
        </footer>
      </div>
    </section>
  );
}

/* ═══════════════ [6] solutions ═══════════════ */

const SOL_PRIORITY: Record<SolutionPriority, { label: string; bg: string; text: string; emoji: string }> = {
  high: { label: "우선순위 높음", bg: "rgba(239,68,68,0.10)", text: "#9F1239", emoji: "🔴" },
  med: { label: "우선순위 중간", bg: "var(--an-gold-soft)", text: "var(--an-gold-on-light)", emoji: "🟡" },
  low: { label: "우선순위 낮음", bg: "rgba(16,185,129,0.10)", text: "#0F766E", emoji: "🟢" },
};

const ACTION_ICON_SVG: Record<string, ReactNode> = {
  video: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="3" />
      <path d="M17 9l4-2v10l-4-2z" />
    </>
  ),
  chat: <path d="M21 12c0 4.4-4 8-9 8-1.4 0-2.8-.3-4-.8L3 21l1.8-4.5C4.3 15.2 4 13.6 4 12c0-4.4 4-8 9-8s9 3.6 9 8z" />,
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14a5 5 0 0 1 5 5v1" />
    </>
  ),
  badge: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5L7 21l5-3 5 3-2-7.5" />
    </>
  ),
};

function SolutionCard({ profile, index }: { profile: SolutionProfile; index: number }) {
  const stu = profile.student;
  const pri = SOL_PRIORITY[profile.priority];
  const [executed, setExecuted] = useState(false);

  return (
    <div className={"sol2-card priority-" + profile.priority} style={{ animationDelay: `${index * 80}ms` }}>
      <header className="sol2-head">
        <div className="sol2-avatar">{stu.initial}</div>
        <div className="sol2-head-block">
          <div className="sol2-name">{stu.name}</div>
          <div className="sol2-meta numeric">
            학번 {stu.studentNo} · {stu.cohort}
          </div>
        </div>
        <span className="sol2-priority" style={{ color: pri.text, background: pri.bg }}>
          <span className="sol2-priority-emoji">{pri.emoji}</span>
          {pri.label}
        </span>
      </header>

      <div className="sol2-status-block">
        <div className="sol2-status-label">현재 상태</div>
        <div className="sol2-status-grid">
          <div className="sol2-status-row">
            <span className="sol2-status-bullet" />
            <span className="sol2-status-key">진도</span>
            <span className="sol2-status-val numeric">{stu.watchPct}%</span>
            <span className={"sol2-status-tag " + (stu.watchPct < 60 ? "down" : stu.watchPct >= 90 ? "up" : "")}>
              {stu.watchPct < 60 ? "보통 미만" : stu.watchPct >= 90 ? "완료" : "진행 중"}
            </span>
          </div>
          <div className="sol2-status-row">
            <span className="sol2-status-bullet" />
            <span className="sol2-status-key">정답률</span>
            <span className="sol2-status-val numeric">{stu.correctPct}%</span>
            <span className={"sol2-status-tag " + (stu.correctPct < 65 ? "down" : stu.correctPct >= 90 ? "up" : "")}>
              {stu.correctPct < 65 ? "낮음" : stu.correctPct >= 90 ? "우수" : "보통"}
            </span>
          </div>
          <div className="sol2-status-row">
            <span className="sol2-status-bullet" />
            <span className="sol2-status-key">Q&amp;A</span>
            <span className="sol2-status-val numeric">{stu.qaCount}건</span>
            <span className={"sol2-status-tag " + (stu.qaCount >= 10 ? "up" : "")}>
              {stu.qaCount >= 10 ? "활발" : stu.qaCount <= 2 ? "저조" : "보통"}
            </span>
          </div>
          <div className="sol2-status-row">
            <span className="sol2-status-bullet" />
            <span className="sol2-status-key">최근 활동</span>
            <span className="sol2-status-val numeric">{stu.lastDays === 0 ? "오늘" : `${stu.lastDays}일 전`}</span>
            <span className={"sol2-status-tag " + (stu.lastDays >= 3 ? "down" : "")}>
              {stu.lastDays >= 3 ? "미시청" : "정상"}
            </span>
          </div>
        </div>
      </div>

      <div className="sol2-analysis">
        <div className="sol2-analysis-head">
          <span className="sol2-analysis-icon">
            <Icon name="sparkles" size={12} gradient="gold" strokeWidth={2.4} />
          </span>
          AI 분석
        </div>
        <div className="sol2-analysis-body" dangerouslySetInnerHTML={{ __html: profile.analysis }} />
      </div>

      <div className="sol2-actions">
        <div className="sol2-actions-label">추천 액션</div>
        <ol className="sol2-actions-list">
          {profile.actions.map((a, j) => (
            <li className="sol2-action" key={j}>
              <span className="sol2-action-num numeric">{j + 1}</span>
              <span className="sol2-action-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {ACTION_ICON_SVG[a.icon] || ACTION_ICON_SVG.doc}
                </svg>
              </span>
              <span className="sol2-action-text" dangerouslySetInnerHTML={{ __html: a.label }} />
            </li>
          ))}
        </ol>
      </div>

      <footer className="sol2-foot">
        <button type="button" className="btn btn-ghost">
          개별 선택
        </button>
        <button
          type="button"
          className={"btn btn-gold sol2-execute" + (executed ? " done" : "")}
          onClick={() => setExecuted(true)}
        >
          {executed ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              실행 완료
            </>
          ) : (
            "모든 액션 실행"
          )}
        </button>
      </footer>
    </div>
  );
}

function SolutionsSection({
  solutions,
  pushToast,
}: {
  solutions: SolutionProfile[];
  pushToast: (m: string) => void;
}) {
  return (
    <section className="sol2-section">
      <div className="section-head">
        <div className="section-head-left">
          <h2 className="section-title">
            <span className="solutions-emoji">👥</span> 학생별 개인화 솔루션
          </h2>
          <span className="section-sub">AI가 각 학생에게 필요한 액션을 자동 제안합니다</span>
        </div>
      </div>

      <div className="sol2-grid">
        {solutions.map((profile, i) => (
          <SolutionCard key={profile.name} profile={profile} index={i} />
        ))}
      </div>

      <button
        type="button"
        className="sol2-all"
        onClick={() => pushToast("전체 47명 솔루션 페이지 — 다음 단계에서 추가됩니다")}
      >
        전체 47명 솔루션 보기
        <Icon name="chevron" size={14} strokeWidth={2.4} style={{ transform: "rotate(-90deg)" }} />
      </button>
    </section>
  );
}

/* ═══════════════ shell ═══════════════ */

type Course = { id: string; label: string; meta: string };
type Period = { id: string; label: string; meta: string };

const COURSES: Course[] = [
  { id: "gram-2026s", label: "중국어문법의 이해", meta: "2026 봄학기" },
  { id: "list-2026s", label: "기초중국어듣기", meta: "2026 봄학기" },
  { id: "cult-2026s", label: "글로벌문화의 이해", meta: "2026 봄학기" },
  { id: "gram-2025f", label: "중국어문법의 이해", meta: "2025 가을학기" },
  { id: "all", label: "전체 강의 합산", meta: "5개 강의 누적" },
];

const PERIODS: Period[] = [
  { id: "w1", label: "이번 주", meta: "6월 9일 ~" },
  { id: "w2", label: "최근 2주", meta: "5월 26일 ~" },
  { id: "w4", label: "최근 4주", meta: "5월 12일 ~" },
  { id: "sem", label: "학기 전체", meta: "3월 4일 ~" },
  { id: "cust", label: "사용자 지정", meta: "" },
];

function Selector<T extends { id: string; label: string; meta: string }>({
  label,
  value,
  options,
  onChange,
  minWidth,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (o: T) => void;
  minWidth: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="selector" ref={ref} style={{ minWidth }}>
      <button type="button" className="selector-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <div className="selector-value-block">
          <span className="selector-label">{label}</span>
          <span className="selector-value">{value.label}</span>
        </div>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="selector-menu">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={"selector-option" + (opt.id === value.id ? " active" : "")}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.meta && <span className="selector-option-meta">{opt.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ pushToast }: { pushToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const items: Array<
    { divider: true } | { divider?: false; id: string; label: string; icon: string; toast: string; danger?: boolean }
  > = [
    { id: "profile", label: "프로필 설정", icon: "user", toast: "프로필 설정 — 다음 단계에서 추가됩니다" },
    { id: "notify", label: "알림 설정", icon: "inbox", toast: "알림 설정 — 다음 단계에서 추가됩니다" },
    { id: "lang", label: "언어 변경", icon: "globe", toast: "언어 변경 — 다음 단계에서 추가됩니다" },
    { divider: true },
    { id: "logout", label: "로그아웃", icon: "logout", toast: "로그아웃되었습니다", danger: true },
  ];

  return (
    <div className="profile-menu-wrap" ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="profile-pill"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: 8,
          borderRadius: 10,
          background: open ? "var(--an-bg-hover)" : "transparent",
          textAlign: "left",
        }}
      >
        <div className="profile-avatar">하</div>
        <div className="profile-text" style={{ minWidth: 0, flex: 1 }}>
          <div className="profile-name">하두진 교수님</div>
          <div className="profile-role">중어중문학과</div>
        </div>
        <Icon
          name="chevron"
          size={12}
          strokeWidth={2.2}
          style={{
            color: "var(--an-text-subtle)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 160ms",
          }}
        />
      </button>

      {open && (
        <div
          className="profile-dropdown"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--an-bg-card)",
            border: "1px solid var(--an-line)",
            borderRadius: 12,
            padding: 6,
            boxShadow: "var(--an-shadow-lg)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {items.map((it, i) =>
            "divider" in it && it.divider ? (
              <div key={i} style={{ height: 1, background: "var(--an-line)", margin: "4px 6px" }} />
            ) : (
              <button
                key={(it as { id: string }).id}
                type="button"
                onClick={() => {
                  pushToast((it as { toast: string }).toast);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: (it as { danger?: boolean }).danger ? "#9F1239" : "var(--an-text)",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "inline-grid", placeItems: "center", width: 16, height: 16 }}>
                  {(it as { icon: string }).icon === "user" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
                    </svg>
                  )}
                  {(it as { icon: string }).icon === "inbox" && <Icon name="inbox" size={14} strokeWidth={2.2} />}
                  {(it as { icon: string }).icon === "globe" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18" />
                      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                    </svg>
                  )}
                  {(it as { icon: string }).icon === "logout" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="M16 17l5-5-5-5" />
                      <path d="M21 12H9" />
                    </svg>
                  )}
                </span>
                {(it as { label: string }).label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// 좌측 메뉴 = 이 페이지의 주요 섹션. 클릭 시 해당 섹션으로 부드럽게 스크롤한다.
// target 은 각 섹션 래퍼의 id(an-sec-*). 스크롤 오프셋은 CSS scroll-margin-top 으로 처리.
const NAV_ITEMS: Array<{ id: string; label: string; icon: IconName; target: string }> = [
  { id: "overview", label: "한눈에 보기", icon: "chart", target: "an-sec-overview" },
  { id: "trend", label: "강의별 시청 추이", icon: "analytics", target: "an-sec-trend" },
  { id: "progress", label: "진도 분포", icon: "video", target: "an-sec-progress" },
  { id: "students", label: "학생 개별 진척도", icon: "users", target: "an-sec-students" },
  { id: "weakness", label: "취약점 분석", icon: "inbox", target: "an-sec-weakness" },
  { id: "solution", label: "AI 차주 대면 수업 솔루션", icon: "sparkles", target: "an-sec-briefing" },
];

function Sidebar({ pushToast }: { pushToast: (m: string) => void }) {
  const [activeId, setActiveId] = useState<string>(NAV_ITEMS[0].id);

  const goToSection = (item: (typeof NAV_ITEMS)[number]) => {
    setActiveId(item.id);
    if (typeof document !== "undefined") {
      document
        .getElementById(item.target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div className="brand-name">ClassAuto</div>
      </div>

      <nav className="nav-section">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={"nav-item" + (item.id === activeId ? " active" : "")}
            onClick={() => goToSection(item)}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={17} />
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="nav-divider" />

      <nav className="nav-section">
        <button type="button" className="nav-item" onClick={() => pushToast("사용량 · 결제 페이지로 이동합니다")}>
          <span className="nav-icon">
            <Icon name="card" size={17} />
          </span>
          사용량 · 결제
        </button>
      </nav>

      <div className="sidebar-footer">
        <ProfileMenu pushToast={pushToast} />
      </div>
    </aside>
  );
}

function StatCard({ card, dataKey }: { card: StatCardData; dataKey: string }) {
  const isHours = card.valueRaw != null;
  const target = isHours ? (card.valueRaw as number) : (card.value as number);
  const v = useCountUp(target, 1500, dataKey);

  let displayMain: string;
  let displayUnit = "";
  if (isHours) {
    const hours = Math.floor(v);
    const mins = Math.round((v - hours) * 60);
    displayMain = `${hours}시간 ${mins}분`;
  } else if (card.suffix === "%") {
    displayMain = Math.round(v).toLocaleString();
    displayUnit = "%";
  } else {
    displayMain = Math.round(v).toLocaleString();
    displayUnit = card.suffix || "";
  }

  const up = card.delta >= 0;

  return (
    <button type="button" className="stat-card">
      <div className="stat-head">
        <div className={"stat-icon-wrap " + card.kind}>
          <StatIcon kind={card.kind} />
        </div>
        <div className="stat-label">{card.label}</div>
      </div>

      <div className="stat-value numeric">
        {isHours ? (
          <span>{displayMain}</span>
        ) : (
          <>
            <span>{displayMain}</span>
            {displayUnit && <span className="stat-value-suffix">{displayUnit}</span>}
          </>
        )}
      </div>

      <div className="stat-sub">{card.sub}</div>

      <div className="stat-foot">
        <span className={"stat-delta " + (up ? "up" : "down")}>
          <Icon name={up ? "arrow-up" : "arrow-down"} size={11} strokeWidth={2.6} />
          {Math.abs(card.delta).toLocaleString()}
          {card.deltaSuffix}
        </span>
        <Sparkline data={card.spark} palette={card.palette} />
      </div>
    </button>
  );
}

export default function AnalyticsPrototype() {
  const [course, setCourse] = useState<Course>(COURSES[0]);
  const [period, setPeriod] = useState<Period>(PERIODS[2]);
  const [seed, setSeed] = useState(1);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);

  const all = useMemo(() => makeAll(seed, course.id, period.id), [seed, course.id, period.id]);
  const dataKey = `${seed}|${course.id}|${period.id}`;

  const pushToast = useCallback((message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }, []);

  const onCourseChange = (opt: Course) => {
    setCourse(opt);
    pushToast(`${opt.label} 데이터로 갱신했어요`);
  };
  const onPeriodChange = (opt: Period) => {
    setPeriod(opt);
    pushToast(`${opt.label} 데이터로 갱신했어요`);
  };

  const devRefresh = () => {
    setSeed((s) => s + 1);
    pushToast("데이터 시뮬레이션 갱신");
  };
  const devCycleCourse = () => {
    const i = COURSES.findIndex((c) => c.id === course.id);
    const next = COURSES[(i + 1) % COURSES.length];
    setCourse(next);
    pushToast(`${next.label}로 전환`);
  };

  return (
    <div className="an-root">
      <div className="app">
        <GradientDefs />
        <Sidebar pushToast={pushToast} />

        <main className="main">
          <header className="topbar">
            <div className="topbar-row">
              <div className="topbar-title">
                <span className="topbar-title-icon">
                  <Icon name="analytics" size={22} gradient="gold" strokeWidth={2.1} />
                </span>
                학습 분석
              </div>
              <div className="topbar-divider" />

              <Selector label="강의" value={course} options={COURSES} onChange={onCourseChange} minWidth={260} />
              <Selector label="기간" value={period} options={PERIODS} onChange={onPeriodChange} minWidth={170} />

              <div className="topbar-spacer" />

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => pushToast("PDF 내보내기 — 다음 단계에서 추가됩니다")}
              >
                <Icon name="download" size={15} />
                PDF 내보내기
              </button>
            </div>
          </header>

          <div className="page">
            <section id="an-sec-overview">
              <div className="section-head">
                <div className="section-head-left">
                  <h2 className="section-title">한눈에 보기</h2>
                  <span className="section-sub">
                    {course.meta} · {course.label} · {period.label}
                  </span>
                </div>
              </div>
              <div className="summary-grid">
                {all.cards.map((card, i) => (
                  <StatCard key={i} card={card} dataKey={dataKey + "|" + i} />
                ))}
              </div>
            </section>

            <section className="chart-row">
              <div className="chart-card" id="an-sec-trend">
                <div className="chart-head">
                  <div className="chart-title-block">
                    <div className="chart-title">강의별 시청 추이</div>
                    <div className="chart-sub">주차별 누적 시청 완료율 · 5개 강의 비교</div>
                  </div>
                </div>
                <LineChart key={dataKey} series={all.series} weeks={all.weeks} />
              </div>

              <div className="chart-card" id="an-sec-progress">
                <div className="chart-head">
                  <div className="chart-title-block">
                    <div className="chart-title">진도 분포</div>
                    <div className="chart-sub">
                      현재 강의 · <span className="han">把字句</span> 입문
                    </div>
                  </div>
                </div>
                <Donut key={dataKey} data={all.donut} total={all.courseTotal} dep={dataKey} />
              </div>
            </section>

            <StudentCardsSection students={all.students} />

            <HeatmapSection students={all.students} chapters={all.chapters} chapterAgg={all.chapterAgg} />

            <BriefingSection briefing={all.briefing} />

            <SolutionsSection solutions={all.solutions} pushToast={pushToast} />
          </div>
        </main>

        <div className="dev-panel">
          <span className="dev-label">DEV</span>
          <button type="button" className="dev-btn" onClick={devRefresh}>
            데이터 갱신
          </button>
          <button type="button" className="dev-btn" onClick={devCycleCourse}>
            강의 전환
          </button>
        </div>

        <div className="toast-stack">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <span className="toast-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="url(#an-grad-success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              </span>
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
