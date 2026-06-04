/**
 * PlayerV2 재생/Q&A 데이터 레이어 — 모의(fixture) ↔ 실서버 분리.
 *
 * 원칙:
 *  - 기본은 실서버 호출(계약 A/B). API 베이스(NEXT_PUBLIC_API_URL)만 올바르면
 *    그대로 실데이터를 쓴다.
 *  - 실서버가 미구현/네트워크 실패면 로컬 fixture 로 graceful degrade 하여
 *    PlayerV2 가 단독으로 슬라이드쇼·Q&A 를 구동할 수 있게 한다.
 *  - NEXT_PUBLIC_PLAYER_MOCK=1 이면 무조건 fixture (백엔드 무시).
 *
 * 호출부(PlayerV2)는 모의/실서버를 구분하지 않는다 — 항상 이 모듈만 부른다.
 */

import { api } from "@/lib/api";
import type { PlayTimeline, QAAskBody, QAResponse } from "./playbackTypes";
import { mockAskQuestion, mockPlayTimeline } from "./playbackMock";

const FORCE_MOCK = process.env.NEXT_PUBLIC_PLAYER_MOCK === "1";

function warn(scope: string, err: unknown): void {
  if (typeof console !== "undefined") {
    console.warn(`[player] ${scope} → 로컬 mock 폴백:`, err);
  }
}

/** 계약 A — GET /api/lectures/{id}/play. 통신 실패 시에만 mock 폴백.
 *
 * 실서버가 200 으로 응답하면 segments 가 비어 있어도(=렌더 아직 미완) 그대로
 * 반환한다 — 플레이어가 "준비 중" placeholder 를 보여주게 하기 위함이다. 과거엔
 * empty 를 throw 해 mock(가짜 把자문 콘텐츠)으로 덮었는데, 게시됐지만 렌더가 덜 된
 * 실제 강의에 가짜가 표시되는 문제가 있어 제거했다. 형태가 깨졌거나(파싱 불가)
 * 네트워크/4xx/5xx 일 때만 mock 으로 graceful degrade(단독 구동용). */
export async function fetchPlayTimeline(lectureId: string): Promise<PlayTimeline> {
  if (FORCE_MOCK) return mockPlayTimeline(lectureId);
  try {
    const { data } = await api.get<PlayTimeline>(`/api/lectures/${lectureId}/play`);
    if (!data || !Array.isArray(data.segments)) throw new Error("malformed timeline");
    return data;
  } catch (err) {
    warn("/play", err);
    return mockPlayTimeline(lectureId);
  }
}

/** 계약 B — POST /api/lectures/{id}/qa/ask. 실패 시 mock 답변 폴백. */
export async function askQuestion(
  lectureId: string,
  body: QAAskBody,
): Promise<QAResponse> {
  if (FORCE_MOCK) return mockAskQuestion(body.question);
  try {
    const { data } = await api.post<QAResponse>(
      `/api/lectures/${lectureId}/qa/ask`,
      body,
    );
    return data;
  } catch (err) {
    warn("/qa/ask", err);
    return mockAskQuestion(body.question);
  }
}
