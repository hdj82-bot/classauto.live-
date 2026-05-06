# messages/_patches

이 디렉토리는 W3 워크트리(`feat/demo-page`)에서 추가한 i18n 키들을
**메인 `messages/ko.json` / `messages/en.json` 충돌 없이** 격리해두기 위한 공간입니다.

## 운영 규칙

- 각 페이지/기능별로 `<scope>.<locale>.json` 파일을 둡니다.
  - 예: `demo.ko.json`, `demo.en.json`
- 최상위 키는 항상 단일 네임스페이스 (예: `"demo"`)로 시작해
  메인 i18n 트리와 충돌하지 않게 합니다.
- 메인 `messages/ko.json` / `messages/en.json` 은 절대 직접 수정하지 않습니다
  — 워크트리 머지 시 충돌의 가장 큰 원인입니다.

## 머지 정책 (W3 → main)

`MERGE_NOTES.W3.md` 참조. 머지 담당자가 다음 중 하나를 선택합니다.

1. **권장**: 본 패치 파일을 그대로 두고, `_patches/*.json` 을 런타임에서
   동적으로 로드하도록 `I18nContext` 를 확장 (별도 작업 단위).
2. **수동 머지**: 머지 시점에 `_patches/demo.{ko,en}.json` 의 내용을
   메인 `messages/{ko,en}.json` 의 최상위에 합치고, 패치 파일은 삭제.

W3 단계에서 `/demo` 페이지는 **로컬 import** 로 패치 파일을 읽어
정상 렌더되도록 구성되어 있습니다. (`src/components/demo/useDemoI18n.ts`)
