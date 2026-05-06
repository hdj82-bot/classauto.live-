# Typography (폰트 정책)

> **상태**: 확정 · 2026-05-05
> **결정**: Pretendard + Paperlogy 두 가지만 사용. Geist · Geist Mono 등 폐기.

---

## 1. 두 폰트의 역할 분리

같은 자리에 두 폰트를 섞으면 산만해집니다. **명확한 위계**로 구분합니다.

| 용도 | 폰트 | 굵기 | 사용 예 |
|---|---|---|---|
| **Display 헤드라인** | **Paperlogy** | 8 ExtraBold / 9 Black | 히어로 큰 제목, 섹션 헤딩 |
| 서브 헤딩 | Paperlogy | 7 Bold | 카드 타이틀, 표 헤더 |
| 본문 | **Pretendard** | 400 / 500 | 일반 텍스트, 설명문 |
| UI 라벨 · 버튼 | Pretendard | 500 / 600 | 네비, CTA, 폼 라벨 |
| 숫자 (가격·통계) | **Pretendard tabular-nums** | 600 | ₩15,200, 80%, 20편 |
| 코드 · 모노 | (제거됨) | — | 더 이상 사용 안 함 |

### 핵심 결정
Geist Mono로 표시하던 가격·통계는 **Pretendard + `font-variant-numeric: tabular-nums`**로 처리합니다.

```css
.numeric {
  font-family: 'Pretendard Variable', sans-serif;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  font-weight: 600;
}
```

이유:
- Pretendard는 한국어 폰트이지만 숫자 글리프 품질 우수
- tabular-nums 적용 시 칼럼 정렬 완벽
- 한 폰트로 일관성 + 다국어 지원

---

## 2. Paperlogy 사용 원칙

Paperlogy는 강한 인상을 주는 디스플레이 폰트라 **남용하면 촌스러워집니다**.

### 사용 규칙
- ✅ **히어로 메인 헤드라인 1회만** (페이지당)
- ✅ 큰 섹션 구분 헤딩 (h2 수준, `font-size: 48px+`)
- ✅ 통계 강조 (예: "**3,200명**의 학생이 이미 사용 중")
- ❌ 본문 절대 사용 금지
- ❌ 작은 사이즈 (24px 미만) 금지 — 가독성 떨어짐
- ❌ 카드 내부 작은 라벨에 사용 금지

---

## 3. 폰트 임베드 전략

### 3.1 번들 임베드 (모든 페이지 로딩 시 항상 로드)
- Pretendard Variable (jsdelivr CDN)
- Paperlogy 7 Bold (가장 자주 사용)

### 3.2 조건부 로드
- Paperlogy 8 ExtraBold + 9 Black: **히어로가 있는 페이지(index, demo)만**
- Paperlogy 4 Regular + 5 Medium + 6 SemiBold: **거의 안 쓸 가능성** → 임베드 제외

→ 폰트 파일 6개 모두 임베드하면 약 7.8MB 추가 로딩. 실제로는 **Bold + ExtraBold 2개만 임베드**.

### 3.3 CDN 설정

```html
<!-- Pretendard Variable -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
/>

<!-- Paperlogy (자체 호스팅) -->
<style>
  @font-face {
    font-family: 'Paperlogy';
    src: url('/fonts/Paperlogy-7Bold.ttf') format('truetype');
    font-weight: 700;
    font-display: swap;
  }
  @font-face {
    font-family: 'Paperlogy';
    src: url('/fonts/Paperlogy-8ExtraBold.ttf') format('truetype');
    font-weight: 800;
    font-display: swap;
  }
</style>
```

### 3.4 한국 사용자 최적화
한국 사용자는 Pretendard가 시스템에 설치되어 있을 확률이 높음. fallback 체인:

```css
font-family:
  'Pretendard Variable', 'Pretendard',
  -apple-system, BlinkMacSystemFont,
  system-ui, 'Helvetica Neue', sans-serif;
```

---

## 4. 페이지별 폰트 사용 매트릭스

| 페이지 | Pretendard | Paperlogy 7 | Paperlogy 8/9 |
|---|---|---|---|
| `/` 랜딩 | ✓ 본문 | ✓ 카드 타이틀 | ✓ 히어로 |
| `/demo` | ✓ 본문 | ✓ CTA 헤딩 | ✓ 미니 히어로 |
| `/features` | ✓ 본문 | ✓ 모듈 타이틀 | ✓ 페이지 헤더 |
| `/pricing` | ✓ 본문·가격 | ✓ 플랜명 | — |
| `/dashboard` | ✓ 전부 | ✓ 카드 타이틀 | — (조용한 톤) |
| 학생 영상 시청 | ✓ 전부 | — | — (몰입 우선) |
| `/profile` | ✓ 본문 | ✓ 통계 강조 | — |

학생 영상 시청 화면은 **Paperlogy 사용 안 함** — 영상이 주인공이라 텍스트는 최소화·기능적으로만.

---

## 5. 사이즈 가이드

### 5.1 데스크톱

| 용도 | 크기 | 굵기 | 줄간격 |
|---|---|---|---|
| Hero (Paperlogy 8) | 64-96px | 800 | 1.05 |
| H1 (Paperlogy 7) | 48-64px | 700 | 1.1 |
| H2 (Paperlogy 7) | 32-40px | 700 | 1.2 |
| H3 (Pretendard 600) | 24px | 600 | 1.3 |
| H4 (Pretendard 500) | 18px | 500 | 1.4 |
| 본문 (Pretendard 400) | 16-17px | 400 | 1.6 |
| Caption (Pretendard 400) | 13-14px | 400 | 1.5 |
| Micro (Pretendard 500) | 11px uppercase | 500 | 1.4 |

### 5.2 모바일
데스크톱 대비 70-80% 크기로 축소. clamp() 활용:

```css
h1 {
  font-size: clamp(40px, 6vw, 64px);
  font-weight: 700;
  font-family: 'Paperlogy', sans-serif;
}
```

---

## 6. 자간 (letter-spacing)

| 용도 | letter-spacing |
|---|---|
| Display (Paperlogy 8/9) | -0.04em |
| Heading (Paperlogy 7) | -0.03em |
| 본문 | 0 (기본) |
| UPPERCASE 라벨 | 0.06em |
| 숫자 (tabular) | 0 |

Paperlogy는 큰 사이즈일수록 자간을 좁혀야 자연스러움.

---

## 7. 다국어 fallback (Phase 2~3)

### 중국어
```css
font-family:
  'Pretendard Variable', 'Pretendard',
  'Noto Sans SC',  /* 간체 */
  'Noto Sans TC',  /* 번체 */
  sans-serif;
```

### 영어
```css
font-family:
  'Pretendard Variable', 'Pretendard',
  -apple-system, BlinkMacSystemFont,
  'Inter', system-ui,
  sans-serif;
```

영어 본문은 Inter도 좋지만, 추가 임베드 부담 있음. 시스템 폰트로 충분.

---

## 8. 구현 체크리스트

새 페이지 작업 시:
- [ ] Pretendard Variable CDN 로드 확인
- [ ] Paperlogy 폰트 파일 import (필요 시)
- [ ] 본문 폰트 family 설정
- [ ] 헤딩에 Paperlogy 적용 (히어로 한정)
- [ ] 숫자에 tabular-nums 적용
- [ ] Geist·Geist Mono 잔존 코드 제거
- [ ] 모바일 반응형 사이즈 확인

---

## 9. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-05 | Pretendard + Paperlogy 2종 정책 확정 |
| 2026-05-05 | Geist·Geist Mono 폐기 |
| 2026-05-05 | 숫자 처리를 Pretendard tabular-nums로 통일 |
| 2026-05-05 | Paperlogy 사용 규칙 (히어로·헤딩만) 명시 |
