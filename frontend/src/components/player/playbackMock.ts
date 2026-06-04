/**
 * PlayerV2 단독 구동용 로컬 fixture (계약 A/B).
 *
 * 백엔드 없이도 슬라이드쇼가 "이미지 + 구간 오디오 + 타임라인" 으로 동기
 * 재생되는지, Q&A 가 "텍스트 즉시 / 아바타(있을 때) 재생" 되는지 확인할 수
 * 있게 한다. 모든 미디어는 런타임에 data URI 로 생성하여 네트워크 없이도
 * 재생된다 (오디오=짧은 톤, 슬라이드=인라인 SVG).
 *
 * 실서버 연결 시에는 ./playbackApi 가 이 모듈 대신 실제 엔드포인트를 호출한다.
 * 시연 주제: 把자문(把字句) 입문 — docs/planning/06-student-pages.md §6.
 */

import type { PlayTimeline, QAResponse } from "./playbackTypes";

const HAS_DOM = typeof window !== "undefined" && typeof btoa === "function";

/** 짧은 사인 톤(8-bit PCM WAV) data URI 생성 — 구간 진입 신호음. */
function toneDataUri(freq: number, durationSec = 0.32, sampleRate = 8000): string | null {
  if (!HAS_DOM) return null;
  const n = Math.floor(durationSec * sampleRate);
  const dataSize = n; // 8-bit mono = 1 byte/sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits/sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = 1 - i / n; // fade out
    const s = Math.sin(2 * Math.PI * freq * t) * env;
    view.setUint8(44 + i, 128 + Math.round(s * 90)); // unsigned 8-bit
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** 다크 톤 슬라이드 SVG data URI 생성. */
function slideDataUri(kicker: string, title: string, body: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f0f0f"/>
      <stop offset="1" stop-color="#161616"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffb627"/>
      <stop offset="1" stop-color="#ffc74d"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="80" y="118" width="64" height="6" rx="3" fill="url(#gold)"/>
  <text x="80" y="100" fill="#ffb627" font-family="Pretendard, sans-serif" font-size="26" font-weight="700" letter-spacing="4">${esc(kicker)}</text>
  <text x="80" y="230" fill="#ffffff" font-family="Pretendard, sans-serif" font-size="76" font-weight="800">${esc(title)}</text>
  <text x="80" y="340" fill="rgba(255,255,255,0.72)" font-family="Pretendard, sans-serif" font-size="36" font-weight="500">${esc(body)}</text>
  <text x="80" y="660" fill="rgba(255,255,255,0.28)" font-family="Pretendard, sans-serif" font-size="22">ClassAuto · 중국어문법의 이해</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 계약 A — 모의 재생 타임라인. (把자문 입문 5세그먼트) */
export function mockPlayTimeline(lectureId: string): PlayTimeline {
  const seg = (
    index: number,
    slide_index: number,
    kicker: string,
    slideTitle: string,
    slideBody: string,
    text: string,
    duration_seconds: number,
    caption: string | null,
    freq: number,
    withImage = true,
  ) => ({
    index,
    slide_index,
    image_url: withImage ? slideDataUri(kicker, slideTitle, slideBody) : null,
    audio_url: toneDataUri(freq),
    text,
    duration_seconds,
    caption,
  });

  return {
    lecture_id: lectureId,
    title: "把자문(把字句) 입문",
    language: "ko",
    segments: [
      seg(
        0,
        0,
        "LESSON 07",
        "把자문 입문",
        "처치문(處置文)의 기본 구조",
        "오늘은 중국어의 把자문, 즉 把字句를 배워보겠습니다. 把자문은 동작의 대상을 강조하는 처치문입니다.",
        7,
        "오늘은 중국어의 把자문(把字句)을 배워봅니다.",
        523,
      ),
      seg(
        1,
        1,
        "기본 어순",
        "주어 + 把 + 목적어 + 동사",
        "목적어가 동사 앞으로 이동한다",
        "把자문의 기본 어순은 주어, 把, 목적어, 동사 순서입니다. 일반 어순과 달리 목적어가 동사 앞으로 옵니다.",
        8,
        "어순: 주어 + 把 + 목적어 + 동사",
        587,
      ),
      seg(
        2,
        2,
        "예문",
        "我把书放在桌子上",
        "나는 책을 책상 위에 놓았다",
        "예문을 봅시다. 我把书放在桌子上. 나는 책을 책상 위에 놓았다는 뜻입니다. 书가 동사 放 앞에 왔습니다.",
        9,
        "我把书放在桌子上 — 나는 책을 책상 위에 놓았다",
        659,
        false, // image_url null → fallback placeholder 시연
      ),
      seg(
        3,
        3,
        "핵심",
        "처치 대상 강조",
        "把 뒤의 명사는 동작의 대상",
        "把 뒤에 오는 명사는 동작의 대상, 즉 처치 대상입니다. 그 대상에 무엇을 했는지를 명확히 드러냅니다.",
        7,
        "把 뒤의 명사 = 동작의 대상(처치 대상)",
        698,
      ),
      seg(
        4,
        4,
        "정리",
        "把자문 한눈에",
        "강조하고 싶은 대상이 있을 때 쓴다",
        "정리하면, 把자문은 어떤 대상을 어떻게 처리했는지 강조하고 싶을 때 사용합니다. 다음 시간에는 부정형을 배웁니다.",
        6,
        "정리: 대상의 처치를 강조할 때 사용",
        784,
      ),
    ],
    is_expired: false,
    expires_at: null,
  };
}

/** 잘못된(로드 불가) 클립 URL — onError → 포스터 폴백 경로를 결정적으로 시연. */
const MOCK_AVATAR_CLIP = "data:video/mp4;base64,AAAAAA==";

/** 계약 B — 모의 Q&A 응답. 把 관련 질문이면 아바타(부가) 동반. */
export function mockAskQuestion(question: string): QAResponse {
  const q = question.trim();
  const aboutBa = q.includes("把") || q.includes("처치") || q.includes("어순");

  if (aboutBa) {
    return {
      answer:
        "把자문은 동작의 대상을 동사 앞으로 끌어와, 그 대상을 '어떻게 처리했는지'를 강조하는 처치문입니다. 예: 我把书放在桌子上(나는 책을 책상 위에 놓았다).",
      in_scope: true,
      source_slides: [1, 2],
      avatar: { status: "ready", video_url: MOCK_AVATAR_CLIP, cache_id: "mock-ba-001" },
    };
  }

  // 범위 밖(예: 시험/잡담) 질문 시연.
  if (q.includes("시험") || q.includes("점수") || q.includes("날씨")) {
    return {
      answer:
        "이 질문은 이번 강의 자료의 범위를 벗어나요. 강의 내용(把자문)에 대해 물어봐 주세요.",
      in_scope: false,
      source_slides: [],
      avatar: null,
    };
  }

  return {
    answer:
      "강의 자료를 바탕으로 답변드릴게요. 把자문의 어순·예문·처치 대상에 대해 구체적으로 물어보시면 더 정확히 설명해 드립니다.",
    in_scope: true,
    source_slides: [3],
    avatar: null,
  };
}
