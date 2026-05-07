/**
 * 대시보드 홈 — 강의 단위 endpoint fan-out 집계.
 *
 * `dashboard.py` 6 endpoint 는 모두 `{lecture_id}` 단위라 강의 전체 합계가
 * 필요한 대시보드 홈은 클라이언트에서 합산한다. 본 함수는 axios 등 전송
 * 레이어와 분리되어 순수 데이터 함수로 살림 — 테스트(__tests__/dashboardHome/
 * aggregate.test.ts) 가 fixture 만으로 검증 가능.
 *
 * 백엔드가 단일 합계 endpoint(`/dashboard/summary`) 를 노출하면 본 모듈 호출
 * 측 fetch 만 교체하고 합산 로직은 보존된다(BACKEND_ASKS §1).
 */

import type {
  DashboardStats,
  AttentionData,
  RecentActivity,
  MainChartLectureSeries,
  DonutSegments,
  DashboardHubData,
} from "./types";

interface LectureLite {
  id: string;
  title: string;
  is_published: boolean;
  created_at?: string | null;
  video_url?: string | null;
}

interface AttendanceResp {
  lecture_id: string;
  summary?: { total: number; live: number; vod: number };
  students?: Array<{
    user_id: string;
    name: string | null;
    type: "live" | "vod";
    started_at: string | null;
    progress_pct: number;
    status: string;
  }>;
}

interface ScoresResp {
  lecture_id: string;
  totalQuestions: number;
  overallAccuracy: number;
}

interface EngagementResp {
  lecture_id: string;
  summary?: {
    totalStudents: number;
    totalQAQuestions: number;
    overallResponseRate: number;
    totalNoResponseEvents: number;
  };
  students?: Array<{ userId: string }>;
  /** 협의안 — feat/analytics 와 공통: slides 가 도착하면 자주 멈춘 구간 위젯 활성. */
  slides?: Array<{ index: number; replays: number; drops: number }>;
}

interface QaResp {
  lecture_id: string;
  totalCount: number;
  logs: Array<{
    id: string;
    question: string;
    in_scope: boolean;
    responded: boolean;
    created_at: string | null;
  }>;
}

interface CostResp {
  lecture_id: string;
  summary?: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
  };
}

export interface FanOutInput {
  lectures: LectureLite[];
  attendance: Map<string, AttendanceResp | null>;
  scores: Map<string, ScoresResp | null>;
  engagement: Map<string, EngagementResp | null>;
  qa: Map<string, QaResp | null>;
  cost: Map<string, CostResp | null>;
  /** 모든 endpoint 가 한 번도 성공하지 못했으면 위쪽 분기에서 alert 처리. */
  failures: DashboardHubData["failures"];
  /** 사용자 플랜 한도 (백엔드 미도착 시 null). UI 가 progress bar 자동 활성화. */
  monthlyVideoLimit?: number | null;
  monthlyCostLimitUsd?: number | null;
}

export function aggregateDashboardHub(input: FanOutInput): DashboardHubData {
  const stats = aggregateStats(input);
  const attention = aggregateAttention(input);
  const activity = aggregateActivity(input);
  const mainChart = buildMainChart(input);
  const donut = aggregateDonut(input);

  return {
    stats,
    attention,
    activity,
    mainChart,
    donut,
    failures: input.failures,
  };
}

/** 6 stat 카드 입력값 합산. */
function aggregateStats(input: FanOutInput): DashboardStats {
  // engagement 는 본 함수가 직접 사용 X (aggregateAttention 이 처리). lint
  // unused-vars 회피 위해 destructure 에서 제외.
  const { lectures, attendance, scores, qa, cost } = input;

  // 1) 시청 완료율 — sum(completed)/sum(total)
  let totalLearners = 0;
  let completedLearners = 0;
  const allUserIds = new Set<string>();
  for (const a of attendance.values()) {
    if (!a?.summary) continue;
    totalLearners += a.summary.total;
    for (const s of a.students ?? []) {
      if (s.status === "completed") completedLearners += 1;
      allUserIds.add(s.user_id);
    }
  }
  const watchCompletionPct =
    totalLearners > 0
      ? round1((completedLearners / totalLearners) * 100)
      : 0;

  // 2) 평균 정답률 — 가중 평균 (totalQuestions 기준)
  let weightedAcc = 0;
  let totalQ = 0;
  for (const s of scores.values()) {
    if (!s) continue;
    weightedAcc += s.overallAccuracy * s.totalQuestions;
    totalQ += s.totalQuestions;
  }
  const avgAccuracyPct = totalQ > 0 ? round1(weightedAcc / totalQ) : 0;

  // 3) 미응답 Q&A — 모든 강의의 logs 중 responded=false 합산.
  // q.logs 가 undefined/null 인 응답 (백엔드 일부 endpoint 가 빈 강의에
  // 대해 logs 필드 자체를 생략) 에 대비해 nullish coalescing 으로 가드.
  // CI Frontend Test 의 unhandled TypeError ('Cannot read properties of
  // undefined (reading filter)') 를 해소.
  let pendingQaCount = 0;
  for (const q of qa.values()) {
    if (!q) continue;
    const logs = Array.isArray(q.logs) ? q.logs : [];
    pendingQaCount += logs.filter((l) => !l.responded).length;
  }

  // 4) 활성 학습자 — 세션 기준 unique
  const activeLearners = allUserIds.size;

  // 5) 이번 달 영상 — lectures.created_at 이 이번 달인 것
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthlyVideoCount = lectures.filter((l) => {
    if (!l.created_at) return false;
    const t = new Date(l.created_at).getTime();
    return Number.isFinite(t) && t >= monthStart;
  }).length;

  // 6) 누적 비용
  let totalCostUsd = 0;
  for (const c of cost.values()) {
    if (!c?.summary) continue;
    totalCostUsd += c.summary.totalCostUsd;
  }

  // sparkline / delta — 7일 추이 데이터가 백엔드에서 안 오므로 모두 null.
  // BACKEND_ASKS §2 가 도착하면 fan-out input 에 추가하고 여기서 채워준다.
  return {
    watchCompletionPct,
    avgAccuracyPct,
    pendingQaCount,
    activeLearners,
    monthlyVideoCount,
    monthlyVideoLimit: input.monthlyVideoLimit ?? null,
    totalCostUsd: round4(totalCostUsd),
    monthlyCostLimitUsd: input.monthlyCostLimitUsd ?? null,

    watchDeltaPct: null,
    accuracyDeltaPct: null,
    pendingQaDelta: null,
    activeDeltaPct: null,

    watchTrend: null,
    accuracyTrend: null,
    pendingQaTrend: null,
    activeTrend: null,
    costTrend: null,
  };
}

function aggregateAttention(input: FanOutInput): AttentionData {
  const { qa, attendance, engagement } = input;

  // 답변 대기 질문 — 모든 강의에서 responded=false, 최신 5건.
  // q.logs nullable 가드 (위 3) 와 동일 사유).
  const allPending: AttentionData["pendingQa"] = [];
  for (const [lectureId, q] of qa.entries()) {
    if (!q) continue;
    const logs = Array.isArray(q.logs) ? q.logs : [];
    for (const log of logs) {
      if (log.responded) continue;
      allPending.push({
        id: log.id,
        lectureId,
        question: log.question,
        inScope: log.in_scope,
        createdAt: log.created_at,
      });
    }
  }
  allPending.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  const pendingQa = allPending.slice(0, 5);

  // 시청 부진 학습자 — started_at 이 3일 이상 전인데 status !== completed.
  // 진정한 "마지막 활동" 추적은 백엔드 보강 필요 (BACKEND_ASKS §3).
  // 임시로 최저 진행률 5명을 노출.
  const now = Date.now();
  const lagging: AttentionData["laggingLearners"] = [];
  for (const a of attendance.values()) {
    if (!a) continue;
    for (const s of a.students ?? []) {
      if (s.status === "completed") continue;
      let days: number | null = null;
      if (s.started_at) {
        const t = new Date(s.started_at).getTime();
        if (Number.isFinite(t)) {
          days = Math.floor((now - t) / (1000 * 60 * 60 * 24));
        }
      }
      lagging.push({
        userId: s.user_id,
        name: s.name,
        daysSinceLastActivity: days,
      });
    }
  }
  lagging.sort((a, b) => {
    // 더 오래된 것 먼저
    const da = a.daysSinceLastActivity ?? -1;
    const db = b.daysSinceLastActivity ?? -1;
    return db - da;
  });
  const laggingLearners = lagging.slice(0, 5);

  // 자주 멈춘 구간 — engagement 응답에 slides 배열이 함께 오면 활성
  // (feat/analytics 와 공통 협의안). 도착 전까지는 빈 배열.
  const frequent: AttentionData["frequentPauseSlides"] = [];
  for (const [lectureId, e] of engagement.entries()) {
    if (!e?.slides) continue;
    for (const s of e.slides) {
      frequent.push({
        lectureId,
        slideIndex: s.index,
        replays: s.replays,
      });
    }
  }
  frequent.sort((a, b) => b.replays - a.replays);
  const frequentPauseSlides = frequent.slice(0, 3);

  return { pendingQa, laggingLearners, frequentPauseSlides };
}

function aggregateActivity(input: FanOutInput): RecentActivity[] {
  const { qa } = input;
  const events: RecentActivity[] = [];
  for (const [lectureId, q] of qa.entries()) {
    if (!q) continue;
    // q.logs nullable 가드 — 위 두 곳과 동일 사유.
    const logs = Array.isArray(q.logs) ? q.logs : [];
    for (const log of logs) {
      const kind: RecentActivity["kind"] = !log.in_scope
        ? "qa-out-of-scope"
        : log.responded
          ? "qa-responded"
          : "qa-asked";
      events.push({
        id: log.id,
        lectureId,
        kind,
        excerpt: log.question.slice(0, 80),
        createdAt: log.created_at,
      });
    }
  }
  events.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return events.slice(0, 8);
}

/**
 * 메인 차트(강의별 시청 추이) 시리즈.
 *
 * 정확한 주차별 데이터는 `attendance.students[].started_at` 만 있어
 * 클라이언트에서 그룹핑한다. 학기 시작일 정보가 없으므로 가장 이른 started_at
 * 부터 12주 동안의 buckets 으로 그룹핑한 뒤 평균 progress_pct 를 노출한다.
 * 학기 컨텍스트가 노출되면(BACKEND_ASKS §4) 정확한 주차로 라벨링.
 */
function buildMainChart(input: FanOutInput): MainChartLectureSeries[] {
  const { lectures, attendance } = input;
  const series: MainChartLectureSeries[] = [];

  for (const lec of lectures.slice(0, 5)) {
    const a = attendance.get(lec.id);
    if (!a?.students || a.students.length === 0) {
      series.push({
        lectureId: lec.id,
        title: lec.title,
        weeklyCompletion: new Array(8).fill(null),
      });
      continue;
    }
    const buckets = bucketByWeek(a.students);
    series.push({
      lectureId: lec.id,
      title: lec.title,
      weeklyCompletion: buckets,
    });
  }
  return series;
}

function bucketByWeek(
  students: NonNullable<AttendanceResp["students"]>,
): Array<number | null> {
  const dated = students
    .map((s) => ({
      t: s.started_at ? new Date(s.started_at).getTime() : NaN,
      progress: Number(s.progress_pct ?? 0),
    }))
    .filter((x) => Number.isFinite(x.t));
  if (dated.length === 0) return new Array(8).fill(null);

  const earliest = Math.min(...dated.map((x) => x.t));
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const bucketCount = 8;
  const sums = new Array(bucketCount).fill(0);
  const counts = new Array(bucketCount).fill(0);
  for (const x of dated) {
    const w = Math.min(bucketCount - 1, Math.floor((x.t - earliest) / weekMs));
    if (w < 0) continue;
    sums[w] += x.progress;
    counts[w] += 1;
  }
  return sums.map((s, i) =>
    counts[i] > 0 ? round1(s / counts[i]) : null,
  );
}

function aggregateDonut(input: FanOutInput): DonutSegments {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  for (const a of input.attendance.values()) {
    if (!a) continue;
    for (const s of a.students ?? []) {
      switch (s.status) {
        case "completed":
          completed += 1;
          break;
        case "in_progress":
          inProgress += 1;
          break;
        default:
          notStarted += 1;
      }
    }
  }
  const total = completed + inProgress + notStarted;
  return { completed, inProgress, notStarted, total };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
