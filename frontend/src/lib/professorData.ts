import { api } from "./api";

/**
 * 교수자 강좌·강의 공유 캐시 (SWR 방식).
 *
 * 대시보드·보관함·스튜디오 진입·분석·학습자·사이드바가 모두 동일하게
 * `GET /api/courses` → 강좌별 `GET /api/courses/{id}/lectures` 워터폴을 돌린다.
 * 백엔드에 "내 전체 강의" 단일 엔드포인트가 없어 프론트에서 fan-out 이 강제되는데,
 * 페이지마다 매번 다시 가져오던 것을 한 곳에 모아 캐시한다:
 *
 *   - 같은 세션 안에서 페이지를 옮겨다닐 때 재요청 없이 즉시 렌더 (TTL 내 fresh).
 *   - TTL 이 지난 캐시는 일단 즉시 반환하고 백그라운드에서 갱신(stale-while-revalidate).
 *   - 동시 호출은 진행 중 promise 를 공유해 한 번만 네트워크를 친다.
 *   - 강의 생성/삭제 같은 변이 후에는 invalidateProfessorData() 로 무효화한다.
 *
 * 각 페이지의 Lecture 모양이 조금씩 달라 제네릭 L 로 받아 캐스팅한다 — 런타임
 * 객체는 동일(백엔드 응답 + course_id 주입)하므로 안전하다.
 */

export interface CourseLite {
  id: string;
  title: string;
}

interface ProfessorData {
  courses: CourseLite[];
  /** 모든 강좌의 강의를 평탄화한 목록. 각 항목에 course_id 가 보장된다. */
  lectures: Record<string, unknown>[];
}

/** 캐시 신선도(ms). 이 시간이 지나면 다음 접근 시 백그라운드 갱신. */
const TTL_MS = 30_000;

let cache: { data: ProfessorData; ts: number } | null = null;
let inflight: Promise<ProfessorData> | null = null;

async function load(): Promise<ProfessorData> {
  // 강좌 목록은 항상 필요(강의 0개인 빈 강좌 포함). 강의는 단일 엔드포인트
  // GET /api/me/lectures 로 한 번에 받아 둘을 병렬 호출 → 1+N 워터폴 제거.
  const coursesPromise = api
    .get<CourseLite[]>("/api/courses")
    .then((r) => r.data);

  let lectures: Record<string, unknown>[];
  try {
    const [, lecturesData] = await Promise.all([
      coursesPromise,
      api
        .get<Record<string, unknown>[]>("/api/me/lectures")
        .then((r) => r.data),
    ]);
    lectures = lecturesData;
  } catch {
    // 폴백: /api/me/lectures 미배포(404 등) 시 기존 강좌별 fan-out 으로 진행해
    // 프론트/백엔드 배포 시점 차이에도 안전. 개별 강좌 실패는 건너뛴다.
    // (courses 자체 실패면 아래 await 에서 throw → 호출자 에러 화면)
    const courses = await coursesPromise;
    const lists = await Promise.all(
      courses.map((c) =>
        api
          .get<Record<string, unknown>[]>(`/api/courses/${c.id}/lectures`)
          .then((r) => r.data.map((l) => ({ ...l, course_id: c.id })))
          .catch(() => [] as Record<string, unknown>[]),
      ),
    );
    lectures = lists.flat();
  }

  const courses = await coursesPromise;
  return { courses, lectures };
}

function revalidate(): Promise<ProfessorData> {
  if (inflight) return inflight;
  inflight = load()
    .then((data) => {
      cache = { data, ts: Date.now() };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface ProfessorDataResult<L> {
  courses: CourseLite[];
  lectures: L[];
}

/**
 * 캐시를 우선 사용해 강좌·강의를 가져온다.
 * - force: 캐시 무시하고 새로 가져온다.
 * - 캐시가 있으면 즉시 반환(필요 시 백그라운드 갱신), 없으면 진행 중 promise 공유.
 */
export async function fetchProfessorData<L = unknown>(
  opts: { force?: boolean } = {},
): Promise<ProfessorDataResult<L>> {
  if (opts.force) {
    const d = await revalidate();
    return { courses: d.courses, lectures: d.lectures as L[] };
  }
  if (cache) {
    if (Date.now() - cache.ts > TTL_MS) {
      // stale → 즉시 반환하되 백그라운드에서 갱신(실패는 조용히 무시).
      void revalidate().catch(() => {});
    }
    return { courses: cache.data.courses, lectures: cache.data.lectures as L[] };
  }
  const d = await revalidate();
  return { courses: d.courses, lectures: d.lectures as L[] };
}

/** 컴포넌트 초기 state 를 동기적으로 채워 재방문 시 스피너 없이 렌더하기 위한 peek. */
export function getCachedProfessorData<L = unknown>():
  | ProfessorDataResult<L>
  | null {
  if (!cache) return null;
  return { courses: cache.data.courses, lectures: cache.data.lectures as L[] };
}

// ── 대시보드 허브 집계 캐시 ──────────────────────────────────────────────────
// 대시보드는 강의당 5개(attendance·scores·engagement·qa·cost) 엔드포인트를 쳐서
// 1+6N 요청이 발생한다. 분석 차트는 실시간성이 낮으므로 강의 id 집합을 키로
// 짧은 TTL 동안 집계 결과를 재사용해 재방문 시 5N 재요청을 건너뛴다.
let hubCache: { key: string; data: unknown; ts: number } | null = null;
const HUB_TTL_MS = 60_000;

export function getCachedHub<T>(key: string): T | null {
  if (!hubCache || hubCache.key !== key) return null;
  if (Date.now() - hubCache.ts > HUB_TTL_MS) return null;
  return hubCache.data as T;
}

export function setCachedHub(key: string, data: unknown): void {
  hubCache = { key, data, ts: Date.now() };
}

/**
 * 강좌·강의(및 대시보드 허브) 캐시를 비운다. 강의 생성·삭제 등 목록을 바꾸는
 * 변이 직후 호출해 다음 진입에서 최신 데이터를 받게 한다.
 */
export function invalidateProfessorData(): void {
  cache = null;
  hubCache = null;
}
