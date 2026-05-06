# DEPS_TO_ADD — W3 (`feat/demo-page`)

> 본 브랜치에서 도입한 새 npm 의존성: **없음.**

본 브랜치의 `/demo` 페이지는 기존 의존성만 사용해 구현되었습니다.

| 영역 | 사용 라이브러리 | 출처 |
|---|---|---|
| UI 프레임워크 | `react`, `react-dom`, `next` | 기존 |
| 스타일 | Tailwind CSS 4 + 인라인 토큰 | 기존 |
| 모달 / 토스트 | `@/components/ui/Modal`, `@/components/ui/Toast` | 기존 (재사용) |
| i18n | `@/contexts/I18nContext` + 로컬 `useDemoI18n` | 기존 |
| 테스트 | `vitest`, `@testing-library/react` | 기존 |

## 후속 작업에서 검토가 필요한 라이브러리 (NOT in this PR)

기획서 [04-demo-page.md](./docs/planning/04-demo-page.md) 의 후속 단계에서
새 의존성이 필요할 수 있습니다. 본 PR 에서는 모두 **mock / placeholder 처리**.

| 후속 기능 | 후보 라이브러리 | 비고 |
|---|---|---|
| Kakao 공유 (Section 15) | `@kakao/karlo-sdk` 또는 직접 SDK 임베드 | KakaoLink 컴포넌트 화 |
| Cloudflare Turnstile (Section 12) | `@marsidev/react-turnstile` 또는 비공식 wrapper | 봇 차단 |
| 영상 스트리밍 / 자막 | 표준 `<video>` + WebVTT (라이브러리 불필요) | 추가 의존성 없음 예상 |
| 인터스티셜 퀴즈 진입 모달 (Section 9) | 기존 `@/components/ui/Modal` 재사용 | 추가 의존성 없음 |
| TTS 다시 듣기 (Section 7) | 백엔드 `/api/demo/tts` (Web Speech API fallback 가능) | 라이브러리 불필요 예상 |

## 폰트 (CDN — package.json 수정 불필요)

`docs/design-system/typography.md` Section 3.3 에 따라 다음을 후속 PR 에서 추가 권장:

```html
<!-- Pretendard Variable (CDN) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" />

<!-- Paperlogy 7Bold / 8ExtraBold (자체 호스팅 → /public/fonts/) -->
```

본 PR 에서는 인라인 `font-family` fallback 체인 (`'Paperlogy', 'Pretendard Variable', sans-serif`) 으로 폰트가 없으면 시스템 폰트로 graceful degrade 됩니다.
