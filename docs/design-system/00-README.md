# 디자인 시스템 (Design System) — v2

ClassAuto 의 모든 시각·인터랙션 결정을 담은 디자인 시스템 가이드.

> **버전**: v2 · 2026-05-12 (Studio·Student prototype 통합)
> **이전 버전**: v1 (2026-05-05 ~ 2026-05-12) — 각 문서 하단의 Legacy 섹션에 보존

---

## 문서 목록

| 파일 | 내용 | 상태 |
|---|---|---|
| [00-README.md](./00-README.md) | 이 파일 — 디자인 시스템 인덱스 | ✓ |
| [typography.md](./typography.md) | 폰트 정책 (Pretendard + Paperlogy + serif 한자) | ✓ v2 |
| [colors.md](./colors.md) | 색상 시스템 (라이트 베이지 + 골드, dual surface) | ✓ v2 |
| [animations.md](./animations.md) | 동적 요소 가이드 | ✓ v2 (ease 갱신) |
| [icons.md](./icons.md) | 그라데이션 SVG 아이콘 정책 | ✓ 유지 |
| [mascot.md](./mascot.md) | 올빼미 마스코트 가이드 | 🛑 **v2 폐기** |

---

## 핵심 원칙 5가지 (v2)

### 1. 세 폰트만 사용
**Pretendard** (본문) + **Paperlogy** (디스플레이) + **serif** (한자 강조 한정) 외 폰트 도입 금지.
숫자는 Pretendard tabular-nums. CSS 변수 `--font-display` / `--font-body` / `--font-han` 으로만 참조.

### 2. 라이트 베이지가 기본 표면
사이트 전체(메인·교수자·학생 진입)가 `#FAFAF7` 라이트 베이스. **다크는 학생 영상 시청 화면과 일부 hero·오버레이 한정**. v1 의 영역별 다크/라이트 분리는 폐기.

### 3. 골드는 표면 톤에 맞춰 한 단계 보정
라이트 표면 위 텍스트·아이콘 → `--gold-on-light` (`#B88308`).
다크 표면 위 → `--gold` (`#FFB627`).
채움 버튼 배경은 항상 `--gold` + 검정 텍스트.

### 4. 의미적 컬러는 신호 한정
빨강·녹색은 교수자 데이터 시각화 + 가벼운 UI 인디케이터(저장됨 dot, 진행률 상승)에만. 정적 강조 금지.

### 5. 한자 강조는 serif + 골드
본문 안의 한자 단어를 `font-family: var(--font-han); color: var(--gold-on-light)` 로 강조. 학술 도구 정체성을 시각적으로 드러내는 v2 신설 규칙.

---

## v1 → v2 주요 변경 요약

| 항목 | v1 | v2 |
|---|---|---|
| 메인 사이트 베이스 | 다크 + 오로라 메쉬 | **라이트 베이지** |
| 학생 화면 베이스 | 다크 강제 | 라이트 (player 만 다크) |
| 그라데이션 메쉬 (violet/cyan/pink) | 사용 | **폐기** |
| 올빼미 마스코트 | 학습자 영역 | **정책 폐지** |
| 한자 강조 | 미정 | **serif + 골드 토큰 신설** |
| CSS 변수 prefix | `*-on-light` / `*-on-dark` | 라이트 기본, 다크는 `*-dark` 명시 |

상세 마이그레이션 표: [colors.md §11](./colors.md#11-legacy-v1-아카이브).

---

## 페이지별 디자인 출처

| 페이지 군 | 출처 | 위치 |
|---|---|---|
| 교수자 studio (영상 마법사) | 05-studio-flow prototype | `docs/prototypes/05-studio-flow.extracted.html` |
| 학생 진입·강의 상세·시청·인터스티셜 | 06-student-flow prototype | `docs/prototypes/06-student-flow.extracted.html` |
| 메인 랜딩·features·pricing·demo·dashboard | 05·06 토큰을 그대로 적용하여 자체 설계 | (prototype 없음) |

추출 스크립트: `scripts/extract-prototype.mjs`.

---

## CSS 변수 시스템 (요약)

상세는 [colors.md §2](./colors.md#2-토큰-css-변수-정의). 다음은 가장 자주 쓰는 항목:

```css
:root {
  /* Surface — light (기본) */
  --bg:           #FAFAF7;
  --bg-card:      #FFFFFF;
  --bg-hover:     #F4F0E2;
  --text:         #0A0A0A;
  --text-muted:   rgba(10, 10, 10, 0.62);
  --line:         rgba(10, 10, 10, 0.08);

  /* Surface — dark (player·hero 등) */
  --bg-dark:      #0A0A0A;
  --bg-card-dark: #1A1A1A;
  --text-dark:    #FFFFFF;
  --line-dark:    rgba(255, 255, 255, 0.08);

  /* Gold */
  --gold:          #FFB627;       /* on dark */
  --gold-on-light: #B88308;       /* on light */
  --gold-deep:     #E89E0E;
  --gold-soft:     rgba(255, 182, 39, 0.10);

  /* Semantic */
  --success: #10B981;
  --warning: #EF4444;

  /* Typography */
  --font-display: 'Paperlogy', 'Pretendard Variable', system-ui, sans-serif;
  --font-body:    'Pretendard Variable', 'Pretendard', system-ui, sans-serif;
  --font-han:     'Noto Serif KR', 'Source Han Serif KR', serif;

  /* Motion */
  --ease-out:    cubic-bezier(0.32, 0.72, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Shadow */
  --shadow-sm: 0 1px 2px   rgba(10, 10, 10, 0.04);
  --shadow-md: 0 4px 14px  rgba(10, 10, 10, 0.06);
  --shadow-lg: 0 16px 48px rgba(10, 10, 10, 0.10);
}
```

---

## 변경 시 주의

디자인 시스템은 **여러 페이지에 영향**을 줍니다. 변경 시:
1. 본 디렉터리의 관련 문서 업데이트 (legacy 섹션 보존)
2. 영향받는 페이지 모두 재검토
3. PR 본문에 영향 페이지 명시
4. [CLAUDE.md](../../CLAUDE.md) 의 디자인 원칙 섹션에 반영
