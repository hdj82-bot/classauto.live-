"use client";

/**
 * Hero 우측 일러스트 카드 — PPT 업로드 → AI 영상 합성 → 학생과 대화 흐름 요약.
 *
 * 디자인 근거: docs/prototypes/04-demo-page.html.html (standalone, 2026-05-13)
 *   - 16:11 aspect-ratio, 라이트 그라데이션 코너 (violet/gold/cyan soft mesh) + #FFFFFF
 *   - 3-스텝 카드 (PPT → AI orb 회전 → Chat bubble + 출처 인용 pill)
 *   - 하단 안내 strip: 학습 보고서 → 다음 강의
 *
 * i18n 비의존 — 호출 측이 자기 도메인의 i18n 으로 텍스트를 주입한다 (/ 와 /demo
 * 가 동일 컴포넌트를 다른 i18n 키로 재사용). 모든 애니메이션은 순수 CSS
 * (prefers-reduced-motion 대응은 페이지 레벨에서 일괄 처리).
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
          {/* 01 — PPT */}
          <div className="ca-flow-step">
            <div className="ca-flow-card ca-flow-card-ppt">
              <div className="ca-ppt-bar">
                <span /><span /><span />
              </div>
              <div className="ca-ppt-body">
                <div className="ca-ppt-line ca-ppt-line-title" />
                <div className="ca-ppt-line" />
                <div className="ca-ppt-line ca-ppt-line-short" />
                <div className="ca-ppt-thumb" />
              </div>
            </div>
            <div className="ca-flow-label">
              <span className="ca-flow-num">01</span>
              <span>{labels.step1}</span>
            </div>
          </div>

          <Arrow />

          {/* 02 — AI */}
          <div className="ca-flow-step">
            <div className="ca-flow-card ca-flow-card-ai">
              <div className="ca-ai-orb">
                <div className="ca-ai-orb-inner" />
              </div>
              <div className="ca-ai-tags">
                <span className="ca-ai-tag">{labels.aiTag1}</span>
                <span className="ca-ai-tag">{labels.aiTag2}</span>
                <span className="ca-ai-tag">{labels.aiTag3}</span>
              </div>
              <div className="ca-ai-progress">
                <div className="ca-ai-progress-fill" />
              </div>
            </div>
            <div className="ca-flow-label">
              <span className="ca-flow-num">02</span>
              <span>{labels.step2}</span>
            </div>
          </div>

          <Arrow />

          {/* 03 — Chat */}
          <div className="ca-flow-step">
            <div className="ca-flow-card ca-flow-card-chat">
              <div className="ca-chat-row">
                <span className="ca-chat-avatar" />
                <span className="ca-chat-bubble" />
              </div>
              <div className="ca-chat-row ca-chat-row-user">
                <span className="ca-chat-bubble ca-chat-bubble-user" />
              </div>
              <div className="ca-chat-row">
                <span className="ca-chat-avatar" />
                <span className="ca-chat-bubble ca-chat-bubble-long" />
              </div>
              <div className="ca-chat-source-pill">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="10"
                  height="10"
                  aria-hidden="true"
                >
                  <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                {labels.chatSource}
              </div>
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
