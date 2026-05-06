# 기획 문서 (Planning)

이 디렉터리는 ClassAuto의 모든 정책·페이지·기능 기획 결정을 담고 있습니다.
새 페이지나 기능 작업 전에 관련 문서를 반드시 확인하세요.

---

## 문서 목록

| 번호 | 파일 | 내용 | 상태 |
|---|---|---|---|
| 00 | [README.md](./00-README.md) | 이 파일 — 기획 문서 인덱스 | ✓ |
| 01 | [01-pricing-policy.md](./01-pricing-policy.md) | 요금 정책 (Free / Basic / Pro) | ✓ 확정 |
| 02 | [02-guardrails.md](./02-guardrails.md) | 4중 비용 가드레일 시스템 | ✓ 확정 |
| 03 | [03-sitemap.md](./03-sitemap.md) | 전체 사이트 구조 (28개 영역) | ✓ 확정 |
| 04 | [04-demo-page.md](./04-demo-page.md) | `/demo` 페이지 상세 기획 | ✓ 확정 |
| 05 | [05-instructor-pages.md](./05-instructor-pages.md) | 교수자 화면 (대시보드, studio 마법사, Q&A 인박스) | ✓ 확정 |
| 06 | [06-student-pages.md](./06-student-pages.md) | 학생 화면 (진입, 시청, 집중경고, 퀴즈) | ✓ 확정 |
| 07 | [07-additional-pages.md](./07-additional-pages.md) | 보조 페이지 (use-cases, trust, security 등) | ✓ 확정 |

---

## 읽는 순서 (역할별)

### 처음 합류한 개발자
1. `01-pricing-policy.md` — 제품의 비즈니스 모델 이해
2. `03-sitemap.md` — 전체 구조 한눈에 파악
3. `02-guardrails.md` — 비용 통제 정책 이해
4. 자기 작업할 페이지 문서 (04 ~ 07 중 하나)

### Claude Code로 페이지 구현 시
1. 작업 대상 페이지의 상세 문서 (예: `04-demo-page.md`)
2. `02-guardrails.md` (가드레일 위반 방지)
3. `../design-system/` 디렉터리 (디자인 결정)

### 비즈니스/마케팅 의사결정
1. `01-pricing-policy.md`
2. `07-additional-pages.md` 중 use-cases, trust, security 섹션
3. `03-sitemap.md`의 우선순위 매트릭스

---

## 기획 결정의 근원

이 문서들은 다음 자료를 기반으로 정리되었습니다:

- **IFL_서비스기획서_v7.docx** — 저장소 루트의 원본 서비스 기획서 (참조용)
- **IFL_기능명세서_v7_DevSpec.docx** — 개발 기능 명세서 (참조용)
- **IFL_수익화전략 워드 문서** (외부 파일) — 가격 정책의 원본
- **2026년 5월 5일 기획 세션** — 위 자료를 기반으로 한 통합 정리

기획 변경 시 반드시 관련 문서를 함께 업데이트하고, 변경 이력을 PR 본문에 기재하세요.

---

## 디자인 시스템

페이지 기획은 정책·구조를 다루고, 시각·인터랙션은 [`../design-system/`](../design-system/)에서 다룹니다. 두 영역을 분리한 이유는 콘텐츠 변경과 디자인 변경의 주기가 다르기 때문입니다.

---

## 기획 변경 프로세스

새 기능 추가나 기존 정책 변경이 필요하면:

1. 관련 문서에 **변경 제안 섹션** 추가 (마크다운 코멘트로)
2. PR 또는 이슈로 논의
3. 합의 후 본문 업데이트, 변경 이력에 날짜·결정 사항 기록
4. CLAUDE.md의 작업 우선순위도 함께 업데이트
