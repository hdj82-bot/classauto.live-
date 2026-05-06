# messages/_patches

이 디렉토리는 워크트리에서 추가한 i18n 키들을 메인 `messages/ko.json`
/ `messages/en.json` 직접 수정 없이 격리해두는 공간입니다.

## 운영 규칙

- 파일명은 `<scope>.<locale>.json` 형식. 예: `demo.ko.json`, `student.en.json`.
- 최상위 키는 항상 단일 namespace (예: `"demo"`, `"student"`)로 시작해
  메인 i18n 트리와 충돌하지 않게 합니다.
- 메인 `messages/ko.json` / `messages/en.json` 은 직접 수정하지 않습니다
  — 워크트리 머지 시 충돌의 가장 큰 원인입니다.

## 런타임 통합 (R2W1 이후)

`I18nContext` 가 모듈 로드 시점에 본 디렉토리의 패치 파일을 모두
deep-merge 합니다. 따라서 호출자는 어디서든 다음과 같이 키를 lookup
할 수 있습니다.

```tsx
const { t } = useI18n();
t("demo.hero.headline2");      // _patches/demo.ko.json
t("student.entry.loginCta");   // _patches/student.ko.json
t("common.loading");            // 메인 messages/ko.json
```

새 namespace patch 를 추가하려면 `I18nContext.tsx` 의 import 와 `mergePatch`
호출을 한 줄씩 늘리면 됩니다 — 본 디렉토리 패치 파일을 자동 발견하지는
않습니다 (의도적, Next.js 빌드 시점 정적 import 보장).

## 어댑터 (legacy)

`src/components/demo/useDemoI18n.ts` 는 R2W1 통합 이전부터 사용되던
어댑터입니다. 이제는 `useI18n` 의 thin wrapper 로 남아 자동 `"demo."`
prefix 만 처리합니다. 후속 PR 에서 demo 컴포넌트 호출자들을 직접
`useI18n() + t("demo.<key>")` 로 마이그레이션 하고 본 어댑터를 제거할
예정입니다.
