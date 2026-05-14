"use client";

/**
 * Hero 우측 일러스트 카드 — PPT 업로드 → AI 영상 합성 → 학생과 대화 흐름 요약.
 *
 * 디자인 근거: docs/prototypes/04-demo-page.html.html (standalone, 2026-05-13)
 *
 * v3 (2026-05-14, 2차 사용자 요청):
 *   1) v1 의 미니어처가 잘렸고, v2 의 글리프도 모바일에서 직관성이 부족하다는
 *      피드백을 반영해 **카드별 단일 글리프**로 다시 정리.
 *      - 01: 슬라이드 보드 + 위로 향한 업로드 화살표 (presentation + upload)
 *      - 02: 영상 클래퍼보드 + 큰 재생 삼각형 (film clapper + play)
 *      - 03: 두 개의 말풍선 + 진행 점 (two-way conversation)
 *   2) v2 의 추가 칩(스크립트·TTS·아바타·출처 인용)은 카드 안에서 글리프와
 *      충돌해 의미가 흐려졌으므로 **삭제**. 칩이 표현하던 의미는 글리프
 *      자체로 충분히 전달된다. i18n 키(aiTag1/2/3, chatSource)는 호환성을
 *      위해 인터페이스에 보존하되 본 컴포넌트는 더 이상 렌더하지 않는다.
 *   3) 글리프는 viewBox 100x100 으로 확대해 작은 카드에서도 stroke 가 살아
 *      남도록 하고, padding 비율을 늘려 어떤 사이즈에서도 잘리지 않는다.
 *   4) 데스크탑/모바일 동일 컴포넌트로 직관 동일성 유지 — 모바일에서는
 *      demo-v3.css 의 미디어 쿼리가 카드를 세로 스택 + 가로 레이아웃으로
 *      전환한다 (아이콘 좌·라벨 우).
 *
 * 호환성:
 *   - HeroFlowStageLabels 인터페이스는 그대로 유지 — /demo · / 두 페이지 모두
 *     기존 i18n 키(flowStage.*) 를 사용한다.
 *   - aiTag1/2/3, chatSource 는 미사용으로 남지만 키는 삭제하지 않는다
 *     (i18n parity / 후속 컴포넌트 재사용 여지).
 *
 * 모든 애니메이션은 순수 CSS (prefers-reduced-motion 대응은 페이지 레벨에서
 * 일괄 처리 — `.ca-demo-root` 스코프의 reduce 가드 참조).
 */
export interface HeroFlowStageLabels {
  topStatus: string;
  topSub: string;
  step1: string;
  step2: string;
  step3: string;
  aiTag1: string;
  aiTag2: string;
  aiTag3: string;
  chatSource: string;
  bottomLead: string;
  bottomEmphasis: string;
  bottomTail: string;
}

export default function HeroFlowStage({
  labels,
}: {
  labels: HeroFlowStageLabels;
}) {
  return (
    <div className="ca-hero-preview" aria-hidden="true">
      <div className="ca-flow-stage">
        <div className="ca-flow-stage-top">
          <div className="ca-flow-status">
            <span className="ca-flow-dot" />
            {labels.topStatus}
          </div>
          <div className="ca-flow-status-sub">{labels.topSub}</div>
        </div>

        <div className="ca-flow-row">
          {/* 01 — PPT 업로드 */}
          <div className="ca-flow-step">
            <div className="ca-flow-card ca-flow-card-ppt">
              <PptUploadGlyph />
            </div>
            <div className="ca-flow-label">
              <span className="ca-flow-num">01</span>
              <span>{labels.step1}</span>
            </div>
          </div>

          <Arrow />

          {/* 02 — AI 영상 합성 */}
          <div className="ca-flow-step">
            <div className="ca-flow-card ca-flow-card-ai">
              <AiVideoGlyph />
            </div>
            <div className="ca-flow-label">
              <span className="ca-flow-num">02</span>
              <span>{labels.step2}</span>
            </div>
          </div>

          <Arrow />

          {/* 03 — 학생과 대화 */}
          <div className="ca-flow-step">
            <div className="ca-flow-card ca-flow-card-chat">
              <ChatGlyph />
            </div>
            <div className="ca-flow-label">
              <span className="ca-flow-num">03</span>
              <span>{labels.step3}</span>
            </div>
          </div>
        </div>

        <div className="ca-flow-stage-bottom">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#ca-grad-electric)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M21 12a8 8 0 0 1-12 6.9L4 20l1.1-5A8 8 0 1 1 21 12z" />
          </svg>
          {labels.bottomLead}{" "}
          <strong>{labels.bottomEmphasis}</strong>
          {labels.bottomTail}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step Glyphs (v3, 2026-05-14) ----------------
 *
 * 모든 글리프는 100x100 viewBox 의 중앙 정렬 SVG. 카드(`.ca-flow-card`)는
 * `display: flex; place-items: center` 로 글리프 하나만 가운데에 둔다.
 * 작은 화면(80x80 카드)에서도 stroke 가 깎여 보이지 않도록 strokeWidth 를
 * 픽셀이 아닌 viewBox 기준 비율(3 → 3% 두께)로 잡았다. stroke 그라데이션은
 * GradientDefs 의 `ca-grad-*` 를 참조.
 */

/**
 * 01 — 프레젠테이션 보드 + 위로 향한 업로드 화살표 (PPT 업로드).
 *
 * 디자인 메모: 단순한 문서 직사각형은 "PPT" 의미가 약했다. 16:9 비율 슬라이드
 * 보드 + 보드 위에 떠 있는 굵은 업로드 화살표로 "프레젠테이션을 클라우드/AI
 * 로 올린다" 를 한 글리프에 담는다. 보드 안의 막대 그래프는 슬라이드의
 * 콘텐츠를 암시.
 */
function PptUploadGlyph() {
  return (
    <svg
      className="ca-step-glyph"
      viewBox="0 0 100 100"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 슬라이드 보드 (16:9 비율). y=40 으로 내려 상단에 화살표 공간 확보. */}
      <rect
        x="14"
        y="40"
        width="72"
        height="48"
        rx="6"
        stroke="url(#ca-grad-electric)"
        strokeWidth="4"
        fill="rgba(255, 182, 39, 0.08)"
      />
      {/* 보드 상단 헤더 라인 (슬라이드 제목 자리) */}
      <path
        d="M22 50h28"
        stroke="url(#ca-grad-electric)"
        strokeWidth="3"
        opacity="0.85"
      />
      {/* 슬라이드 콘텐츠를 암시하는 미니 막대 그래프 */}
      <path
        d="M26 78v-10M38 78v-16M50 78v-6M62 78v-20M74 78v-12"
        stroke="url(#ca-grad-electric)"
        strokeWidth="3"
        opacity="0.7"
      />
      {/* 업로드 화살표 — 보드 위로 솟구치는 큰 화살. 굵기로 의미 강조. */}
      <path
        d="M50 8v26M38 20l12-12 12 12"
        stroke="url(#ca-grad-electric)"
        strokeWidth="5"
      />
    </svg>
  );
}

/**
 * 02 — 영상 클래퍼보드 + 큰 재생 삼각형 (AI 영상 합성).
 *
 * 디자인 메모: v2 의 비디오 프레임 + 작은 재생 삼각형 + 스파클은 한 카드 안에
 * 요소가 너무 많아 의미가 흐려졌다. v3 에서는 클래퍼보드(영화/영상 제작의
 * 상징)와 그 위에 얹은 큰 재생 삼각형으로 "AI 가 영상을 만든다 + 재생한다"
 * 를 한 번에 전달. 스파클 한 개만 우상단에 남겨 AI 의 자동 생성 뉘앙스를 유지.
 */
function AiVideoGlyph() {
  return (
    <svg
      className="ca-step-glyph"
      viewBox="0 0 100 100"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 클래퍼보드 상단 줄무늬 막대 (영상의 상징) */}
      <path
        d="M14 28l72-12"
        stroke="url(#ca-grad-violet)"
        strokeWidth="4"
      />
      <path
        d="M22 32l4-9M36 30l4-9M50 28l4-9M64 26l4-9M78 24l4-9"
        stroke="url(#ca-grad-violet)"
        strokeWidth="3"
      />
      {/* 클래퍼 본체 (재생 화면) */}
      <rect
        x="14"
        y="32"
        width="72"
        height="50"
        rx="6"
        stroke="url(#ca-grad-violet)"
        strokeWidth="4"
        fill="rgba(167, 139, 250, 0.10)"
      />
      {/* 큰 재생 삼각형 — 가운데 골드로 강하게 강조 */}
      <path
        d="M42 46l22 11-22 11z"
        fill="url(#ca-grad-electric)"
        stroke="url(#ca-grad-electric)"
        strokeWidth="3"
      />
      {/* AI 스파클 (우상단 — '자동 생성' 뉘앙스) */}
      <path
        d="M86 8l1.8 5 5 1.8-5 1.8L86 21.4l-1.8-5-5-1.8 5-1.8z"
        fill="url(#ca-grad-electric)"
      />
    </svg>
  );
}

/**
 * 03 — 두 개의 말풍선 (교수자/AI ↔ 학생 양방향 대화).
 *
 * 디자인 메모: v2 와 컨셉 동일하나, 글리프 자체를 크게 그리고 두 말풍선이
 * 마주보는 구도로 "양방향" 을 더 강하게 전달. 학생 측 말풍선 안의 점 3개는
 * "지금 학생이 답하는 중" 의 typing indicator 를 의도.
 */
function ChatGlyph() {
  return (
    <svg
      className="ca-step-glyph"
      viewBox="0 0 100 100"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 좌상단 말풍선 (교수자/AI) — violet */}
      <path
        d="M8 24c0-4.4 3.6-8 8-8h32c4.4 0 8 3.6 8 8v16c0 4.4-3.6 8-8 8H30l-10 8v-8h-4c-4.4 0-8-3.6-8-8z"
        stroke="url(#ca-grad-violet)"
        strokeWidth="4"
        fill="rgba(167, 139, 250, 0.12)"
      />
      {/* 좌상단 말풍선 안 라인 (메시지 내용 암시) */}
      <path
        d="M18 26h22M18 34h16"
        stroke="url(#ca-grad-violet)"
        strokeWidth="2.6"
        opacity="0.7"
      />
      {/* 우하단 말풍선 (학생) — gold */}
      <path
        d="M92 60c0-4.4-3.6-8-8-8H52c-4.4 0-8 3.6-8 8v12c0 4.4 3.6 8 8 8h4v8l10-8h18c4.4 0 8-3.6 8-8z"
        stroke="url(#ca-grad-electric)"
        strokeWidth="4"
        fill="rgba(255, 182, 39, 0.14)"
      />
      {/* 학생 말풍선 안 typing dot 3개 */}
      <circle cx="56" cy="66" r="2.4" fill="url(#ca-grad-electric)" />
      <circle cx="66" cy="66" r="2.4" fill="url(#ca-grad-electric)" />
      <circle cx="76" cy="66" r="2.4" fill="url(#ca-grad-electric)" />
    </svg>
  );
}

function Arrow() {
  return (
    <div className="ca-flow-arrow" aria-hidden="true">
      <svg
        viewBox="0 0 32 24"
        fill="none"
        stroke="url(#ca-grad-electric)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12h26M22 5l7 7-7 7" />
      </svg>
    </div>
  );
}
