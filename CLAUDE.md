# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참조하는 컨텍스트입니다.

---

## 프로젝트 개요

**ClassAuto** (정식 학술명: *Interactive Flipped Learning Platform*, 약칭 IFL)

AI 기반 플립러닝(거꾸로 수업) 플랫폼. PPT 업로드 → AI 스크립트 생성 → HeyGen 아바타 영상 렌더링 → 학생 학습 세션·평가·집중도 모니터링까지 포함한 종합 교육 플랫폼.

- **메인 도메인**: classauto.live (구매 완료)
- **현재 단계**: Phase 2 베타 (학계 무료 배포)
- **타겟**: 한국 대학 교수자 → 아시아 학계 → 글로벌
- **저장소 소유자**: 河斗振 (하두진) · 경기대학교 중어중문학과 교수

---

## 정체성과 차별점

ClassAuto는 일반 EdTech가 아닙니다. **학자가 학자를 위해 만든 도구**라는 정체성이 가장 강력한 차별점입니다. 모든 작업 결정은 이 정체성 안에서 이루어져야 합니다.

### 핵심 차별점 4가지
1. **RAG 범위 제한 Q&A** — 강의 자료 밖 질문은 자동 거부 (유사도 임계값 0.7)
2. **비용 투명성** — 영상 1편 생성 원가, API 사용량 공개
3. **부정행위 방지** — 인터스티셜 퀴즈, 동시 재생 제한, 매크로 탐지
4. **학생 데이터 보호** — 광고 미사용, 졸업 후 자동 삭제

---

## 기획 문서 (작업 전 필수 확인)

이 프로젝트의 모든 디자인·기획 결정은 `docs/planning/`과 `docs/design-system/`에 정리되어 있습니다. **새 페이지나 기능 작업 전에 다음 문서를 우선 확인**하세요:

### 정책·기획 (`docs/planning/`)
- `00-README.md` — 기획 문서 인덱스 및 읽는 순서
- `01-pricing-policy.md` — 요금 정책 (Free / Basic / Pro)
- `02-guardrails.md` — 4중 비용 가드레일 시스템
- `03-sitemap.md` — 전체 사이트 구조 (28개 영역)
- `04-demo-page.md` — `/demo` 페이지 상세 기획
- `05-instructor-pages.md` — 교수자 화면 (대시보드, studio 마법사 등)
- `06-student-pages.md` — 학생 화면 (진입, 시청, 집중경고)
- `07-additional-pages.md` — 보조 페이지 (use-cases, trust, security 등)

### 디자인 시스템 (`docs/design-system/`)
- `00-README.md` — 디자인 시스템 인덱스
- `typography.md` — 폰트 정책 (Pretendard + Paperlogy)
- `colors.md` — 색상 시스템 (다크/골드)
- `animations.md` — 동적 요소 가이드 (16가지 개선)
- `icons.md` — 그라데이션 SVG 아이콘 정책
- `mascot.md` — ⚠️ v2에서 폐기 (Legacy 보존만)

### 기존 명세서
- `IFL_서비스기획서_v7.docx` — 전체 서비스 기획서 (참조용 원본)
- `IFL_기능명세서_v7_DevSpec.docx` — 개발 기능 명세서

---

## 핵심 디자인 원칙 (요약) — v2 (2026-05-12)

세부 사항은 `docs/design-system/`(v2 갱신됨) 을 참조하되, 어떤 작업이든 다음 원칙을 위반하면 안 됩니다.

### 폰트
- **Pretendard** (본문·UI·숫자) + **Paperlogy** (디스플레이 헤드라인) + **serif** (한자 강조 한정)
- CSS 변수 `--font-body` / `--font-display` / `--font-han` 으로만 참조 (직접 폰트명 박지 말 것)
- Geist · Geist Mono 등 다른 폰트 사용 금지
- 가격·통계 숫자는 Pretendard `tabular-nums` 적용

### 컬러 (v2 — 라이트 베이지 + 골드)
- **사이트 전체 기본 표면은 라이트 베이지** (`#FAFAF7`). 메인 마케팅·교수자·학생 진입까지 동일
- **다크 표면은 학생 영상 시청 player·인터스티셜 퀴즈·일부 hero 한정** (`#0A0A0A`)
- 골드는 표면 톤에 맞춰 보정: 라이트 위는 `--gold-on-light` (`#B88308`), 다크 위는 `--gold` (`#FFB627`)
- 의미적 컬러(빨강·녹색)는 교수자 차트 + 가벼운 UI 인디케이터(저장 dot 등) 한정
- **v1의 다크+오로라 메쉬, violet/cyan/pink 그라데이션은 폐기**

### 한자 강조 (NEW in v2)
- 본문 안의 한자 단어를 `.han` 클래스로 강조: `font-family: var(--font-han); color: var(--gold-on-light);`
- 학술 도구 정체성을 시각적으로 드러내는 핵심 패턴

### 아이콘
- 모든 이모지는 **그라데이션 SVG로 통일** (옵션 C 정책)
- 페이지 전체에서 같은 의미는 같은 SVG 사용
- v2 에서 그라데이션은 골드 단일 톤 (electric) 또는 monochrome line + accent gold 로 단순화

### 마스코트 — ⚠️ v2 폐기
- 05·06 prototype 어디에도 등장하지 않아 정책 자체 제거
- 학습자 정서적 연결은 골드 그라데이션·타이포·추상 일러스트로 대체
- 기존 `mascot.md` 는 Legacy 섹션으로만 보존

### 동적 요소
- Easing 토큰만 사용: `--ease-out` (cubic-bezier(0.32, 0.72, 0, 1)) / `--ease-spring` (cubic-bezier(0.34, 1.56, 0.64, 1))
- 페이지 진입 시 fade-in stagger (80ms 단위)
- `prefers-reduced-motion` 반드시 지원
- localStorage 사용 금지 (artifact·SSR 호환)
- 그라데이션 메쉬·오로라 효과 폐기

---

## 작업 우선순위

### 진행 중
- [x] 폰트·동적 요소·이모지 정책 확정 (`docs/design-system/`)
- [x] Pricing 정책 확정 (`docs/planning/01-pricing-policy.md`)
- [x] 4중 가드레일 시스템 확정 (`docs/planning/02-guardrails.md`)
- [x] 전체 사이트맵 확정 (`docs/planning/03-sitemap.md`)
- [x] /demo 페이지 상세 기획 (`docs/planning/04-demo-page.md`)

### 다음 작업 (우선순위 순)

**1단계** — `/demo` 페이지 구현
- 베타 보급 전환 핵심
- 두 분야 영상(사회과학 / 자연과학) 준비 필요
- 회원가입 없이 학습자 입장 체험

**2단계** — 학생 진입 흐름 3종
- `/v/[강의ID]` 학생 진입 페이지
- 학생 회원가입 흐름 (학교 이메일·학번)
- 학생 첫 사용 30초 온보딩

**3단계** — 기존 페이지 동적 요소 개선
- index.html (랜딩) — 6가지 개선
- features.html — 4가지 개선
- dashboard.html — 6가지 개선
- pricing.html — 새 정책 반영하여 전면 재작성

**4단계** — 교수자 첫 사용 온보딩
- 빈 대시보드 empty state
- 5단계 가이드 체크리스트
- 학과·강의 정보 입력

**5단계** — 영업·신뢰 페이지
- `/use-cases` 활용 사례
- `/trust` 학생 데이터 보호
- `/security` 보안 정책
- `/beta-apply` 베타 신청 폼
- `/contact` 기관 견적 문의

이후 단계는 `docs/planning/03-sitemap.md` 참조.

---

## 기술 스택 (변경 없음)

```
Backend:  FastAPI + Celery + PostgreSQL(pgvector) + Redis
Frontend: Next.js 16 + React 19 + Tailwind CSS 4
Infra (개발):  Docker Compose
Infra (프로덕션): Vercel(프론트) + Railway(백엔드/Celery/Redis) + Supabase(DB/pgvector/Auth/Storage)
AI:       Anthropic Claude (스크립트/문제) + OpenAI (임베딩)
Video:    HeyGen (아바타) + ElevenLabs/Google TTS
Monitor:  Sentry (에러) + Prometheus (메트릭) + 구조화 JSON 로깅
```

배포 가이드는 `README.md`와 `DEPLOYMENT_ROADMAP.md` 참조.

---

## Claude Code 작업 규칙

### 새 페이지 작업 시
1. **반드시 먼저** 해당 페이지의 기획 문서를 읽기 (`docs/planning/` 안의 관련 파일)
2. 디자인 시스템 문서 확인 (`docs/design-system/`)
3. 기존 컴포넌트가 있는지 확인 (`frontend/components/`)
4. 작업 시작 후 Phase별 코밋 단위로 분할

### 새 기능 작업 시
1. `IFL_기능명세서_v7_DevSpec.docx` 확인 (기능 정의)
2. `docs/planning/02-guardrails.md` 확인 (가드레일 정책 위반 여부)
3. 백엔드 API 변경 시 기존 패턴 따르기 (`backend/app/api/`)
4. 프론트엔드 페이지 추가 시 i18n 키도 함께 추가 (`frontend/messages/`)

### 절대 하지 말아야 할 것
- ❌ 기획 문서 없이 추측으로 페이지 만들기
- ❌ Pretendard·Paperlogy 외 폰트 도입
- ❌ 학습자 화면을 라이트 모드로 만들기
- ❌ 학생 측에 무제한 Q&A 허용 (가드레일 위반)
- ❌ 강의 자료 밖 질문에 답변 허용 (RAG 임계값 무시)
- ❌ localStorage 사용 (대신 React state 또는 서버 세션)

### 적극 권장
- ✅ 작업 전 관련 기획 문서를 명시적으로 읽었음을 확인
- ✅ 변경 사항이 어떤 정책에 근거하는지 PR 본문에 기재
- ✅ 새로운 결정이 필요한 경우 작업 중단하고 사용자에게 확인

---

## 사용자 정보

- **이름**: 河斗振 (하두진, 어흥)
- **소속**: 경기대학교 중어중문학과 교수
- **연구 분야**: AI 번역 오류 분석, 중국어 교수법, 플립러닝, 코퍼스 언어학
- **개발 환경**: Claude Code 사용 (병렬 worktree 활용)

작업 결과를 보고할 때는 한국어로, 공손한 톤으로 작성하되 불필요한 칭찬이나 사과는 생략. 결정 사항은 명확한 근거와 함께 제시.

---

## 변경 이력

- 2026-05-12: **디자인 시스템 v2 전환** — Studio(05)·Student(06) prototype 통합. 라이트 베이지 + 골드 dual-surface 토큰. v1 다크+오로라·violet/cyan/pink 그라데이션·마스코트 정책 폐기. 한자 강조 (`--font-han` + `--gold-on-light`) 신설. 병렬 4-worktree 작업 흐름 도입.
- 2026-05-12: OAuth `invalid_state` 버그 수정 (frontend state CSRF 레이어 제거, 백엔드 Redis state 단일 검증으로 일원화)
- 2026-05-05: 초기 기획 문서 패키지 추가 (12개 마크다운 + CLAUDE.md 재구성)
- 그 이전: 기존 명세서(`IFL_서비스기획서_v7.docx` 등) 기준으로 백엔드·인프라 구축
