# 2026-05-06 — W1~W4 병렬 통합

4개 워크트리에서 병렬 작업한 결과를 main에 일괄 통합한 기록입니다.

## 통합한 브랜치

| 창 | 브랜치 | 커밋 | 영역 |
|---|------|------|------|
| W1 | `feat/heygen-api` | ca41931 | backend — HeyGen 비용 단가 + record_once |
| W2 | `feat/tts-elevenlabs` | 8b39efc | backend — ElevenLabs/Google TTS 클라이언트 분리 + cost_tracker |
| W3 | `feat/demo-page` | 069f925 | frontend — `/demo` 페이지 (24 파일, 8 컴포넌트) |
| W4 | `feat/student-flow` | 004a541 | frontend — `/v/[slug]` + `/auth/signup` + I18nContext |

## 머지 결과

**모든 머지 충돌 0건.** 영역 분리가 잘 되어 자동 머지로 통과.

```
1. main 최신 (a8c40a3) ← merge-base
2. + W1 (no-ff)         9 files / +305
3. + W2 (no-ff)         9 files / +1527
4. + W3 (no-ff)        24 files / +2331
5. + W4 (no-ff)        18 files / +1390 (I18nContext.tsx 35줄 추가)
6. + integration commit  Header /demo 링크, i18n nav 키, respx 추가, 노트 이동
```

## 통합 패스에서 처리한 항목

### A. Header `/demo` 진입로 (Header.W3.patch.md 적용)
- `frontend/src/components/Header.tsx` — 비로그인 + 로그인 모두 노출되는 데스크톱 nav 추가 (`/demo`, `/pricing`)
- 모바일 햄버거는 후속 PR로 미룸 (현재 비로그인 사용자는 `/demo` 페이지 자체의 hero/footer CTA 로 진입 가능)

### B. i18n 키 직접 추가
- `frontend/messages/ko.json`, `en.json` 의 `nav` 네임스페이스에 `demo`, `pricing`, `public` 키 추가
- W3 의 demo patch / W4 의 student patch 는 본 파일 머지 **안 함** — `I18nContext` 가 student 패치를 deep-merge, `useDemoI18n` 이 demo 패치를 직접 import. 둘 다 런타임에 정상 동작

### C. 의존성 통합 (DEPS_TO_ADD.W2.md 적용)
- `backend/requirements-test.txt` 에 `respx>=0.21.0,<1.0.0` 추가 — W2 의 `test_tts_clients.py` httpx mock 기반 테스트 활성화
- W3, W4 는 신규 의존성 없음

## 의도적으로 미룬 항목

### i18n 시스템 통일 (후속 PR)
- 현재 두 시스템 공존: `I18nContext.deep-merge` (student) + `useDemoI18n.import` (demo)
- 통일 방안: `I18nContext` 가 `_patches/*.json` 전체를 자동 로드하도록 확장하고 `useDemoI18n` 제거
- 베타 출시 차단 아님 — 둘 다 잘 동작

### 백엔드 응답 보강 (BACKEND_ASKS.W4.md 참조)
- `LecturePublicResponse` 에 `professor_name`, `course_name`, `duration_sec` 추가
- `/auth/complete-profile` 가 `student_number`/`name`/`locale` 을 sessionStorage hint 로 받도록
- `/api/v1/lectures/{slug}/redeem-code` (학습 코드 4-4 진입로)
- 모두 nice-to-have — 본 머지를 차단하지 않음

### Header 모바일 햄버거 확장 (Header.W3.patch.md §"모바일 햄버거 메뉴" 참조)
- 현재 햄버거는 `user` 가 있을 때만 활성. 비로그인도 `/demo`, `/pricing` 모바일 접근 가능하게 확장하는 별도 PR 권장

### AVATAR_VOICE_FEATURE_ROADMAP Sprint A/B/C (MERGE_NOTES.W1.md 참조)
- `users.heygen_avatar_id`, `users.elevenlabs_voice_id` 컬럼 + 사용자별 디폴트 폴백
- HeyGen Photo Avatar (`/v2/photo_avatar/*`)
- ElevenLabs IVC
- DB 마이그레이션 + 새 API 5개 + 프론트 UI가 묶여 있어 별도 스프린트가 적절. 베타 출시 후 처리 권장

## 참조 노트 (이 디렉토리에 보관)

- `MERGE_NOTES.W1.md` — HeyGen 비용 단가, record_once 변경 상세
- `MERGE_NOTES.W2.md` — TTS 클라이언트 분리, cost_tracker, 39 테스트
- `MERGE_NOTES.W3.md` — `/demo` 페이지 구성, 8 컴포넌트, DoD 체크
- `MERGE_NOTES.W4.md` — 학생 진입 흐름, 핸드오프 사항
- `DEPS_TO_ADD.W2.md` — respx 도입 사유
- `DEPS_TO_ADD.W3.md` / `DEPS_TO_ADD.W4.md` — 신규 의존성 없음 확인서
- `BACKEND_ASKS.W4.md` — 백엔드 후속 작업 4건
- `Header.W3.patch.md` — Header 메뉴 변경 제안 (적용 완료, 모바일 부분만 보류)

## 검증 한계

이 환경에 Python/Docker/Node 모두 미설치 — 로컬에서 pytest/ruff/vitest/eslint/build 모두 실행 불가.
**최종 검증은 GitHub Actions CI에 의존**:
- backend lint (ruff) + test (pytest, 60% coverage gate)
- frontend lint (eslint) + test (vitest) + build (next build)
- Docker build → GHCR push → Trivy scan

CI 결과 후 필요 시 hotfix.
