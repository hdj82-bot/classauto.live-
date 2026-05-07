import type { ChangelogEntry } from "./types";

/**
 * `/changelog` 의 시드 데이터.
 *
 * 시간 역순(최신 위로) 으로 작성되어 있고, UI 가 다시 정렬하지 않는다 — 즉
 * 본 배열의 순서가 그대로 페이지 노출 순서다. 새 항목 추가 시 배열 맨 앞에
 * 삽입.
 *
 * 백엔드 endpoint(`GET /api/v1/public/changelog`) 가 도착하면 fetch 결과를
 * 본 shape 그대로 받아 컴포넌트에 주입할 수 있도록 type 공유 (`./types.ts`).
 *
 * PR 링크는 GitHub 정식 repo 가 공개되기 전까지는 placeholder 로 둔다 —
 * `#PR-XXXX` label + `/changelog#anchor` 같은 internal anchor 로 fallback.
 */
export const CHANGELOG_SEED: ChangelogEntry[] = [
  {
    date: "2026-05-07",
    version: "v0.4.0",
    title: "R4 통합 — 랜딩·features·dashboard·pricing 동적 요소 16종",
    category: "feature",
    bullets: [
      "랜딩 히어로 6종 동적 요소(오로라, 카운터, 그라데이션 stroke, area chart, mesh-network, fade-up)",
      "features 페이지 4종(아이콘 모핑, 분해/재조립, progress shimmer, isometric 패럴랙스)",
      "교수자 대시보드 홈 6종(통계 카운트업, 메인 차트 gradient, 도넛, 활동 슬라이드인, 비용 미터, 카드 hover 펄스)",
      "pricing 페이지 전면 재작성(Free/Basic/Pro 매트릭스 + Guardrail FAQ 2 항목)",
    ],
    prs: [
      { label: "#R4-LANDING", href: "/changelog#r4-landing" },
      { label: "#R4-DASHBOARD", href: "/changelog#r4-dashboard" },
    ],
  },
  {
    date: "2026-05-07",
    version: "v0.3.0",
    title: "R3 통합 — studio·inbox·analytics·learners",
    category: "feature",
    bullets: [
      "studio 영상 제작 마법사(슬라이드 패널 + 인라인 diff + 실시간 비용 미터 + 5채널 공유)",
      "Q&A 인박스 3-pane(강의별 필터 + AI 자동응답 / 응답 필요 / 범위 외 거부 탭)",
      "교수자 분석 리포트(`/professor/analytics`) — 출석/정답률/참여도/Q&A/비용 SVG 시각화",
      "학습자 관리 보드(테이블 + 일괄 작업 + 위험 학생 자동 표시)",
    ],
    prs: [
      { label: "#R3-STUDIO", href: "/changelog#r3-studio" },
      { label: "#R3-ANALYTICS", href: "/changelog#r3-analytics" },
    ],
  },
  {
    date: "2026-05-07",
    version: "v0.2.5",
    title: "분석 리포트의 재생 구간 히트맵 · 슬라이드 raw 협의안 정리",
    category: "improvement",
    bullets: [
      "engagement 응답에 slides[] 가 함께 오면 자동 활성화되는 fallback 분기 적용",
      "백엔드 raw shape · 산정 정의 · 우선순위를 BACKEND_ASKS.ANALYTICS.md 에 정리",
    ],
  },
  {
    date: "2026-05-06",
    version: "v0.2.0",
    title: "R2 통합 — i18n · 교수자 온보딩 · 마케팅 페이지 4종",
    category: "feature",
    bullets: [
      "i18n 패치 deep-merge 시스템(`messages/_patches/<scope>.{ko,en}.json`)",
      "교수자 첫 사용 온보딩 5단계 + 환영 모달 + 학과 정보 입력",
      "use-cases / trust / security / beta-apply / contact 페이지(MarketingShell 공유)",
    ],
    prs: [
      { label: "#R2-I18N", href: "/changelog#r2-i18n" },
      { label: "#R2-ONBOARDING", href: "/changelog#r2-onboarding" },
    ],
  },
  {
    date: "2026-05-06",
    version: "v0.1.5",
    title: "Q&A 응답 속도 약 30% 개선",
    category: "improvement",
    bullets: [
      "RAG 임베딩 캐싱 + 자주 묻는 질문 패턴 캐싱(가드레일 정책 위반 없이 응답 시간 단축)",
    ],
  },
  {
    date: "2026-05-06",
    version: "v0.1.0",
    title: "R1 통합 — HeyGen · TTS · /demo · 학생 진입",
    category: "feature",
    bullets: [
      "HeyGen 아바타 영상 렌더링 파이프라인 + 이중 TTS(주: 한국어 / 부: 中文)",
      "/demo 사회과학·자연과학 분야 미리보기 + 인터스티셜 퀴즈",
      "/v/[강의ID] 학생 진입 + 학교 이메일 인증 흐름",
    ],
    prs: [
      { label: "#R1-PIPELINE", href: "/changelog#r1-pipeline" },
      { label: "#R1-DEMO", href: "/changelog#r1-demo" },
    ],
  },
  {
    date: "2026-05-06",
    version: "v0.0.9",
    title: "iOS Safari 영상 재생 끊김 수정",
    category: "fix",
    bullets: [
      "HLS 스트리밍 fallback 추가 — 일부 학교망에서 mp4 progressive 가 차단되던 이슈 우회",
      "video element preload 정책 'metadata' 로 변경 (모바일 데이터 절약)",
    ],
  },
  {
    date: "2026-05-05",
    version: "v0.0.8",
    title: "Q&A 챗봇 학습 외 질문 거부 정책 강화",
    category: "breaking",
    bullets: [
      "RAG 유사도 임계값을 0.6 → 0.7 로 상향 — 강의 자료 밖 질문은 자동 거부.",
      "정책 위반(외부 인터넷 검색) 우회 경로 차단. 베타 학계 도입의 신뢰 기반.",
    ],
  },
];
