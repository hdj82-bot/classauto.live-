# 학습 분석 대시보드 & AI 대면 수업 브리핑 (`/analytics`)

> **상태**: 설계 v0.1 · 2026-05-27 · **근거**: 사이트 대문 "학생 분석 예시" 데모 페이지 스크린샷
> **한 줄 정의**: 사전 학습 영상으로 수집된 학습자 개개인의 성취·진도를 **자동 분석·시각화**하고, 그 데이터로 **교수자에게 차주 대면 수업의 방향을 제시**하는 화면. ClassAuto 핵심 가치 루프의 실체.
> **연관 문서**: [05-instructor-pages.md](./05-instructor-pages.md)(대시보드 홈·studio), [09-beta-program.md](./09-beta-program.md)(RQ2 — 이 화면이 곧 연구 개입), [10-research-data-model.md](./10-research-data-model.md)(데이터 출처), [01-pricing-policy.md](./01-pricing-policy.md)(Pro 게이팅)

> ⚠️ 본 문서는 **대문 데모(샘플 데이터)** 기준으로 컴포넌트를 역설계해 정리했다. 정확한 라벨·수치·정렬은 라이브 페이지로 확정한다. 데모 페이지 데이터는 익명/샘플이어야 함(`02-guardrails.md` §7).

---

## 1. 위치와 역할

- 05의 사이트맵에서 **분석 리포트** 영역(`05-instructor-pages.md:48-51`)에 해당. 홈 대시보드(`/dashboard`)가 요약이라면, 이 `/analytics`는 **심층 분석 + 차주 수업 브리핑**.
- 대문에서는 **마케팅 데모**(전공 불문 교수진에게 "이런 게 나온다"를 보여줌), 로그인 후에는 **실제 강의별 분석 화면**.
- 1차 사용자 맥락: 중어중문학과 어흥 교수, 강의별·주차별 선택.

---

## 2. 화면 구성 (컴포넌트별 스펙 + 데이터 매핑 + 갭)

각 컴포넌트마다 **① 보여주는 것 ② 데이터 출처(10번 테이블) ③ 현재 상태(✅있음 / 🔧확장 / ❌신규) ④ 더 필요한 기능**.

### A. 헤더 — 강의·기간 선택 / PDF 출력

- ① 강의 선택 드롭다운(예: "학습 영상 · 중어중문학과 어흥 교수 · AI v7"), 주차/기간 필터, `PDF 출력하기` 버튼.
- ② `lectures`, `courses`. ✅
- ④ **PDF/리포트 export** — 브리핑·차트를 PDF로. (Pro "AI 요약 노트 PDF" `01-pricing-policy.md:136`와 통합). ❌ 리포트 렌더러 필요.

### B. 현황 KPI 4종

데모상 4개 카드: **학습 완료율 75% / 출석 인정율 75% / 총 학습시간 8시간 12분 / 질문 수(또는 학습자 수) 293**.

| 지표 | 출처 | 상태 |
|---|---|---|
| 학습 완료율 | `learning_sessions.progress_pct`(완주 비율) | ✅ |
| 출석 인정율 | 출석 인증 퀴즈 통과 — `assessment_results`(출석형) / 세션 완주 + timestamp_valid | 🔧 출석 판정 로직 명시 필요 |
| 총 학습시간 | Σ `learning_sessions.watched_sec` | ✅ |
| 질문 수 / 학습자 수 | `qa_logs` count / `learning_sessions` distinct user | ✅ |

- ④ 각 KPI에 **전주 대비 증감(델타)** 표시(데모에 추세 화살표 보임) → §C 시계열 필요.

### C. 성취율 추이 (라인 차트, 다지표)

- ① 시간축 위 여러 지표 라인(영상 완료율·출석 인정율·평균 정답률·질문 수 등 추정).
- ② **시계열 스냅샷이 없음** — 현 테이블은 시점 데이터. ❌
- ④ **신규 `cohort_daily_metrics`**(강의×일자별 집계) 필요. 10번 문서 G7. 없으면 "추이"를 못 그린다.

### D. 집중 분석 (도넛 + 집중도 점수)

- ① 도넛 차트, 중앙 점수(데모 "47"), 범례(집중/보통/산만 등).
- ② `learning_sessions`(warning_level, no_response_cnt, total_pause_seconds, is_network_unstable) + §A2의 무반응 이벤트. ✅ 원자료 / 🔧 **집중도 점수 공식 미정의**.
- ④ **집중도 스코어링 정의** 필요(가중합 → 0~100). 딴짓 포착 리포트(`01-pricing-policy.md:155`)와 동일 산식 공유. 산식 문서화 + 검증(베타).

### E. 학생 개별 진척도 (그리드)

- ① 50명+ 학생 카드 그리드 — 이름·학번·진척%·상태(완료/진행/미시작). 정렬·필터.
- ② `learning_sessions`(user별 progress_pct, status), `users`. ✅
- ④ **정렬(취약 우선)·필터(미완주·저성취)**, 카드 클릭 → 학생 상세 드릴다운. 카드에 **위험 신호 배지**(이상 탐지 `02-guardrails.md` §6 연동).

### F. 히트맵 (학생 × 슬라이드/주제) — Pro

- ① 행=학생, 열=슬라이드/개념, 셀 색=성취(빨강 취약 ~ 녹색 우수). = "취약점 히트맵" + "재생 구간 히트맵".
- ② **취약점**: `assessment_results`(is_correct) × `questions`(slide index/category). 🔧 개념 태깅 필요. **재생 구간**: `watch_events`/`slide_engagement`. ❌ (10번 G1 — 아직 미구축)
- ④ **(필수) `watch_events`+`slide_engagement` 구축**(없으면 재생 히트맵 불가). **문항 개념 태깅 체계**(슬라이드↔개념 매핑) 추가.

### G. 요약 카드 — 빈번 오답 / 빈번 질문어 / 기타

- ① "빈번 오답률", "빈번 질문어"(질문에서 자주 나온 키워드), 기타 카운트 카드.
- ② 빈번 오답: `assessment_results` 집계 ✅. 빈번 질문어: `qa_logs.question` **키워드 추출 필요** ❌(+ `qa_clusters` 활용).
- ④ **한국어+중국어 키워드/토픽 추출 서비스**(형태소 분석 — 한자 토큰 처리 주의, 전공 특수성). 코퍼스 언어학 강점과 연결 가능.

### H. AI 대면 수업 브리핑 ⭐ (핵심 — 차주 수업 방향 제시)

데모: 날짜(2026-05-13) 헤더 + 아래 4블록.

#### H-1. 학습 데이터 요약
- ① 핵심 지표·이상치를 자연어 요약(불릿).
- ② B~G 집계 → Claude 요약. ❌ **브리핑 생성 파이프라인** 필요.

#### H-2. AI 제언 — 차주 수업 구성
- ① 데모상 3열 카드(예: 집중 개선 필요 / 복습 추천 / 다음 강의 추천) — 구체적 행동 제안.
- ② 위 요약 + 취약 개념(F) + 오답(G) → Claude 구조화 출력(권고 카드들).
- ④ **권고 스키마 정의**(권고 유형·근거·대상 슬라이드/학생). 교수자가 권고를 채택/수정 → `instructor_actions`(10번 G3)에 기록 = **RQ2 데이터**.

#### H-3. 학습 목표 달성률 (before → after)
- ① 데모: 67% → 78%, 40명 → 52명, 12건 → 0건 등 전/후 비교.
- ② **학습 목표 정의가 없음** ❌ + 사전/사후(`assessment_results.occasion` 10번 G6).
- ④ **신규 `learning_goals`**(강의/주차별 목표·기준) 10번 G9.

#### H-4. 학생 개별 피드백·솔루션 + 액션
- ① 학생별 카드(박서준·이민호·김태리·정유미·윤서연·최강희 등) — 지표 + AI 피드백 + 골드 액션 버튼(예: 학습 독려 보내기).
- ② 학생별 집계 → Claude 피드백. 액션 = "학습자 격려 메시지 자동 발송"(`01-pricing-policy.md:146`, Basic+).
- ④ **학생별 피드백 생성** + **메시지 발송 액션**(알림/이메일) + 발송 로그 → `instructor_actions`.

---

## 3. 데이터 출처 매핑 요약

| 컴포넌트 | 핵심 테이블 | 상태 |
|---|---|---|
| B KPI | learning_sessions, qa_logs, assessment_results | ✅ (출석 판정 🔧) |
| C 추이 | **cohort_daily_metrics** | ❌ 신규(G7) |
| D 집중 | learning_sessions(+무반응) | ✅원자료 / 산식 🔧 |
| E 진척 | learning_sessions, users | ✅ |
| F 히트맵 | assessment_results+questions / **watch_events+slide_engagement** | 취약점 🔧 / 재생구간 ❌(G1) |
| G 요약 | assessment_results / qa_logs+qa_clusters | 오답 ✅ / 질문어 ❌(키워드 추출) |
| H 브리핑 | **class_briefings** + instructor_actions + learning_goals | ❌ 신규(G8·G9·G3) |

---

## 4. 추가로 필요한 기능 (갭 → 기능 백로그)

스크린샷을 실제로 동작시키려면 다음이 필요하다. **우선순위 순:**

### P1 — 데이터가 없으면 영원히 못 모음 (9월 전)
1. **`watch_events` + `slide_engagement`** (재생 히트맵·이탈 분석) — 10번 G1
2. **`cohort_daily_metrics`** (성취율 추이 라인) — 10번 G7 (신설)
3. **문항·슬라이드 개념 태깅 체계** (취약점 히트맵을 개념 단위로)
4. **출석 판정 규칙 + 집중도 점수 산식** 문서화·구현

### P2 — 핵심 가치(브리핑) 동작
5. **AI 대면 수업 브리핑 생성 파이프라인** — 집계 → Claude 요약·권고 → `class_briefings` 저장 (10번 G8 신설)
6. **`learning_goals`** + 사전/사후 비교(`assessment_results.occasion`) — 달성률 before→after (10번 G9)
7. **권고 채택/수정 → `instructor_actions` 로깅** (RQ2 핵심, 10번 G3)
8. **학생별 피드백 생성 + 격려 메시지 발송 액션** (발송 로그 → instructor_actions)

### P3 — 마감·운영
9. **PDF/리포트 export** (브리핑·차트)
10. **빈번 질문어 키워드 추출**(한+중 형태소, 한자 토큰) — 코퍼스 강점 연계
11. 학생 상세 드릴다운, 정렬·필터, 위험 배지

---

## 5. AI 대면 수업 브리핑 생성 파이프라인 (설계 초안)

```
[야간/주간 배치 또는 교수자 요청 시]
1. 집계 수집: cohort_daily_metrics, slide_engagement, assessment_results(취약 개념),
   qa_clusters(빈번 질문), learning_sessions(집중·완주)
2. 컨텍스트 구성: 강의 메타 + 주차 목표(learning_goals) + 전주 브리핑(연속성)
3. Claude 요약·권고 생성 (구조화 출력):
   - summary[] (학습 데이터 요약 불릿)
   - recommendations[] {type, rationale, target_slides[], target_students[]}
   - student_feedback[] {user, signals, feedback, suggested_action}
4. class_briefings 저장 (lecture_id, week, generated_at, payload JSONB)
5. 교수자가 권고 채택/수정/거부 → instructor_actions 기록 (RQ2)
6. 채택된 학생 액션(격려 메시지) 실행 + 발송 로그
```

- 비용: 강의×주 1회 Claude 호출 → 저비용. 학생 인터랙션 경로가 아니라 가드레일 위험 낮음.
- 가드레일: RAG 범위 밖 환각 방지 — 브리핑은 **수집된 데이터에 근거**만 인용하도록 프롬프트 제약.

---

## 6. 연구·상용 연결

- 이 화면이 곧 **RQ2의 개입(intervention)**: "데이터 시각화 → 교수자 의사결정"이 일어나는 지점. `instructor_actions`가 그 행동을 포착([09-beta-program.md](./09-beta-program.md) §3, §10).
- 상용 성공지표(09 §10)의 "교수자가 데이터로 대면 수업을 바꾼 횟수"가 바로 이 화면에서 발생·계측된다.
- 전공 불문 확장: 개념 태깅·키워드 추출만 분야별로 조정하면 어학 외 전공에도 그대로 적용.

---

## 7. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-27 | 문서 신설 — 대문 "학생 분석 예시" 데모를 역설계해 `/analytics` 스펙화. 컴포넌트 A~H 데이터 매핑·갭, 기능 백로그(P1~P3), AI 대면 수업 브리핑 생성 파이프라인, 연구(RQ2) 연결. 신규 데이터 요구(cohort_daily_metrics·class_briefings·learning_goals)는 10번 G7~G9로 연결 |
