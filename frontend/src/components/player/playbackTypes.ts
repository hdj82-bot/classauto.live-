/**
 * 학생 영상 시청(슬라이드쇼) 공유 계약 타입.
 *
 * [확정 결정] 본문은 단일 mp4 가 아니라 "슬라이드 PNG + 구간 TTS 오디오 +
 * 타임라인" 을 클라이언트가 동기 재생하는 슬라이드쇼다. HeyGen 은 Q&A 캐시
 * 답변(avatar)에만 사용된다.
 *
 * 이 파일은 PlayerV2 가 소비하는 두 가지 백엔드 계약을 1:1 로 표현한다.
 * 실제 API 호출/모의 응답 분기는 ./playbackApi 에 있다.
 */

/** 계약 A — 재생 타임라인의 한 세그먼트. */
export interface PlaySegment {
  /** 재생 순서 (0-based). */
  index: number;
  /** 원본 슬라이드 인덱스 (퀴즈·인용 매핑용). */
  slide_index: number;
  /** 슬라이드 이미지 URL. null 이면 fallback placeholder 를 보여준다. */
  image_url: string | null;
  /** 이 구간 TTS 오디오 URL. (`{render_id}.mp3`) */
  audio_url: string | null;
  /** 슬라이드 스크립트 본문. */
  text: string;
  /** 이 구간 길이(초). 전체 진행률·타임라인 진행의 기준. */
  duration_seconds: number;
  /** 자막(있으면). 없으면 null. */
  caption: string | null;
}

/** 계약 A — GET /api/lectures/{lecture_id}/play 응답. (video_url 없음) */
export interface PlayTimeline {
  lecture_id: string;
  title: string;
  language: string;
  segments: PlaySegment[];
  is_expired: boolean;
  expires_at: string | null;
}

/** 계약 B — Q&A 답변에 부가되는 HeyGen 아바타 클립 (있을 때만). */
export interface QAAvatar {
  status: "ready" | string;
  video_url: string;
  cache_id: string;
}

/** 계약 B — POST /api/lectures/{lecture_id}/qa/ask 응답. */
export interface QAResponse {
  /** 항상 즉시 표시하는 답변 텍스트. */
  answer: string;
  /** RAG 범위 안 질문인지. */
  in_scope: boolean;
  /** 인용한 슬라이드 번호들 (출처 칩). */
  source_slides: number[];
  /** 캐시된 HeyGen 아바타 클립. 없으면 null (텍스트만). */
  avatar: QAAvatar | null;
}

/** 계약 B — 질문 요청 body. */
export interface QAAskBody {
  question: string;
  session_id: string;
}
