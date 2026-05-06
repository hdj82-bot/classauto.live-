# Header.W3.patch — 메뉴에 `/demo` 링크 추가 제안

> 본 워크트리에서 `frontend/src/components/Header.tsx` 를 수정하지 않기 위해
> 변경 의도만 메모로 남깁니다. 머지 시점 또는 후속 PR 에서 적용 권장.

## 배경

`/demo` 페이지는 베타 신청 전환의 **1순위 페이지**이며, 미인증 사용자도
접근 가능합니다. 현재 Header 의 `navLinks` 는 `user` 가 있을 때만 노출되므로
**비로그인 상태에서도 `/demo` 로 가는 진입로**가 필요합니다.

## 제안 변경 (대략적인 diff)

```tsx
// frontend/src/components/Header.tsx
//   <Link href={homeHref} ...> 바로 다음, lang-select 앞에 추가:

<nav className="hidden sm:flex items-center gap-1 ml-3" aria-label={t("nav.public")}>
  <Link
    href="/demo"
    className={`text-sm px-3 py-1.5 rounded-lg transition ${
      pathname?.startsWith("/demo")
        ? "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 font-medium"
        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`}
  >
    {t("nav.demo")}
  </Link>
  <Link
    href="/pricing"
    className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
  >
    {t("nav.pricing")}
  </Link>
</nav>
```

추가 i18n 키 (다음 PR 에서 `messages/ko.json` / `en.json` 의 `nav` 네임스페이스에):

```json
{
  "nav": {
    "demo": "데모 체험",
    "pricing": "가격",
    "public": "둘러보기"
  }
}
```

```json
{
  "nav": {
    "demo": "Try Demo",
    "pricing": "Pricing",
    "public": "Browse"
  }
}
```

## 모바일 햄버거 메뉴

현재 햄버거 메뉴(`menuOpen`)는 `user` 가 있을 때만 활성화되어 있습니다.
비로그인 사용자도 `/demo`, `/pricing` 에 모바일에서 접근 가능하도록
다음 두 변경 중 하나를 권장합니다.

1. (간단) 데스크톱 nav 만 노출하고 모바일은 우상단에 작은 `데모 →` 버튼만
2. (정공법) 햄버거 메뉴 가시성 조건을 `user || pathname !== '/'` 등으로 확장

W3 단계에서는 `/demo` 페이지 안에서 자체적으로 footer CTA 와 hero 를 통해
다른 페이지로의 진입로를 제공하므로, Header 변경은 **후속 PR (W4 이후)** 에서
일괄 처리해도 무방합니다.
