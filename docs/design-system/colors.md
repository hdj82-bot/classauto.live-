# Colors (색상 시스템)

> **상태**: v2 확정 · 2026-05-12
> **결정**: 라이트 베이지 + 골드 액센트 (Studio·Student prototype 통합)
> **이전 정책 (v1)**: 다크 + 골드 + 그라데이션 메쉬 — §11 [Legacy](#11-legacy-v1-아카이브) 에 보존

---

## 0. 전체 사이트 컬러 정책 한 줄 요약

**모든 페이지(메인 사이트·교수자·학생) 의 기본 표면은 라이트 베이지(`#FAFAF7`).** 
학생 영상 시청 화면과 메인 사이트 hero 같은 일부 영역만 다크 표면 토큰으로 전환한다.

골드는 라이트 위에서는 `--gold-on-light: #B88308`, 다크 위에서는 `--gold: #FFB627` 을 쓴다 — 표면 톤에 따라 한 단계 어둡게 보정.

---

## 1. 영역별 표면

| 영역 | 기본 표면 | 액센트 | 비고 |
|---|---|---|---|
| 메인 사이트 (랜딩·features·pricing·use-cases·trust·security 등) | 라이트 `#FAFAF7` | 골드-라이트 `#B88308` | hero 영역은 다크 토큰으로 부분 전환 가능 |
| 데모 페이지 (`/demo`) | 라이트 | 골드-라이트 | 인터스티셜 시청 미니 화면만 다크 전환 |
| 교수자 화면 (대시보드·studio·inbox·analytics 등) | 라이트 | 골드-라이트 | 의미적 컬러 (빨강·녹색) 차트에 허용 |
| 학생 진입·강의 상세 (`/v/[slug]`, `/lecture/[slug]`) | 라이트 | 골드-라이트 | 06 prototype 기준 |
| 학생 영상 시청 (player 화면) | 다크 `#0A0A0A` | 골드-다크 `#FFB627` | 영상 보호용 다크. 토글 가능 |
| 인터스티셜 퀴즈 | 다크 | 골드-다크 | 영상 위 오버레이 일관성 |

---

## 2. 토큰 (CSS 변수 정의)

### 2.1 Light surface — 기본

```css
--bg:           #FAFAF7;                  /* 페이지 배경 */
--bg-card:      #FFFFFF;                  /* 카드·패널 */
--bg-hover:     #F4F0E2;                  /* hover 베이지 */
--bg-subtle:    #F5F4EF;                  /* 보조 영역 (saved chip 등) */

--text:         #0A0A0A;                  /* 본문·헤드라인 */
--text-muted:   rgba(10, 10, 10, 0.62);   /* 보조 정보 */
--text-subtle:  rgba(10, 10, 10, 0.40);   /* 더 약한 메타 */
--text-faint:   rgba(10, 10, 10, 0.22);   /* 가장 옅은 (placeholder 등) */

--line:         rgba(10, 10, 10, 0.08);
--line-strong:  rgba(10, 10, 10, 0.14);
```

### 2.2 Dark surface — 학생 player·hero 등

```css
--bg-dark:          #0A0A0A;
--bg-dark-soft:     #141414;
--bg-card-dark:     #1A1A1A;

--text-dark:        #FFFFFF;
--text-dark-muted:  rgba(255, 255, 255, 0.62);
--text-dark-subtle: rgba(255, 255, 255, 0.40);

--line-dark:        rgba(255, 255, 255, 0.08);
--line-dark-strong: rgba(255, 255, 255, 0.14);
```

### 2.3 Gold — 브랜드 액센트

```css
--gold:          #FFB627;                  /* 다크 표면 위 base */
--gold-bright:   #FFC74D;                  /* hover */
--gold-deep:     #E89E0E;                  /* press / gradient end */
--gold-on-light: #B88308;                  /* 라이트 표면 위 base — 대비 5.1:1 */

--gold-soft:     rgba(255, 182, 39, 0.10); /* 매우 옅은 배경 (선택 상태) */
--gold-medium:   rgba(255, 182, 39, 0.20); /* 보더·강조 */
--gold-glow:     rgba(255, 182, 39, 0.40); /* shadow·펄스 */
```

**사용 규칙**:
- 라이트 표면 위 텍스트·아이콘 → `--gold-on-light`
- 다크 표면 위 텍스트·아이콘 → `--gold`
- 채움 버튼 배경 → `--gold` (라이트 표면에서도 대비 충분 — 텍스트는 `#0A0A0A`)
- 그라데이션 → `linear-gradient(135deg, var(--gold), var(--gold-deep))`

### 2.4 Semantic — 시스템 피드백

```css
--success: #10B981;                        /* 저장됨 dot, 정답률 상승 */
--warning: #EF4444;                        /* 한도 초과, 미응답 알림 */
--info:    #3B82F6;                        /* 안내 메시지 */
```

학생 학습 화면에서도 가벼운 UI 인디케이터(저장됨, 진행률 상승)에 허용. 차트·데이터 시각화는 교수자 영역 한정.

### 2.5 Shadow — 검정 베이스 4단계

```css
--shadow-sm: 0 1px 2px   rgba(10, 10, 10, 0.04);
--shadow-md: 0 4px 14px  rgba(10, 10, 10, 0.06);
--shadow-lg: 0 16px 48px rgba(10, 10, 10, 0.10);
--shadow-xl: 0 24px 64px rgba(10, 10, 10, 0.16);

--shadow-gold-glow: 0 2px 6px var(--gold-glow);
```

다크 표면에서는 그림자 대신 골드 글로우 또는 라인 강조로 대체.

---

## 3. 골드 사용 원칙

1. **CTA 채움 버튼은 페이지당 1~2개로 제한**. 다른 강조는 outline 또는 텍스트 컬러로.
2. 작은 강조(배지, 카운트, 활성 메뉴, 진행 dot)에 골드.
3. **표면 톤에 맞춰 base 선택**: 라이트 위는 `--gold-on-light` (`#B88308`), 다크 위는 `--gold` (`#FFB627`).
4. 한자 강조는 `color: var(--gold-on-light); font-family: var(--font-han)` — typography.md §3 참조.
5. 페이지당 골드 영역 5곳 이내 권장.

---

## 4. 한자 강조 (NEW in v2)

ClassAuto는 학술 도구 정체성을 시각적으로 드러내기 위해 **본문 중간의 한자 단어를 골드 + serif 로 강조**한다. Studio·Student prototype 양쪽에서 일관 사용.

```css
.han {
  color: var(--gold-on-light);
  font-family: var(--font-han);
  /* 부모 폰트 크기 대비 약간 작게 — 시각 균형 */
}
```

다크 표면 위에서는 `--gold` 사용.

**사용 예**:
- 강의명: `中国语文法의 이해` → "中国语文法" 만 `.han`
- 카드 헤드라인의 학술 키워드 강조

---

## 5. 의미적 컬러 사용 매트릭스

| 컬러 | 영역 | 용도 |
|---|---|---|
| `--success` | 전체 | 저장됨 dot, 시청 완료, 정답률 상승 인디케이터 |
| `--warning` | 교수자 데이터·학생 한도 경고 | 미응답 Q&A, 한도 초과, 만료 임박 |
| `--info` | 교수자 안내·툴팁 | 도움말, 변경 안내 |

규칙:
- 빨강은 액션 유도에만. 정적 강조 금지.
- 녹색은 긍정 변화에만. 정적 표시 금지.
- 청색은 골드 충돌 방지 위해 매우 드물게.

---

## 6. 그라데이션

### 6.1 골드 그라데이션 (브랜드 점, hero CTA, 아바타 pill)

```css
--grad-gold: linear-gradient(135deg, #FFB627 0%, #E89E0E 100%);
```

### 6.2 텍스트 그라데이션 (hero 헤드라인 일부 단어)

```css
.gradient-text {
  background: var(--grad-gold);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

전체 헤드라인 그라데이션은 가독성 떨어짐 → 핵심 단어만.

### 6.3 v1 의 다중 오로라 메쉬는 폐기
ElevenLabs 톤의 violet·cyan·pink 메쉬는 새 베이지+골드 단일 톤 정책과 충돌. **사용 금지** (§11 참조).

---

## 7. 그림자·글로우

### 7.1 라이트 표면

```css
--shadow-sm: 0 1px 2px   rgba(10, 10, 10, 0.04);
--shadow-md: 0 4px 14px  rgba(10, 10, 10, 0.06);
--shadow-lg: 0 16px 48px rgba(10, 10, 10, 0.10);
--shadow-xl: 0 24px 64px rgba(10, 10, 10, 0.16);
```

카드 hover 시 `--shadow-md` → `--shadow-lg` 전환.

### 7.2 다크 표면 (학생 player·hero)

그림자 대신 골드 글로우 또는 라인 강조:

```css
.on-dark .card:hover {
  border-color: var(--gold);
  box-shadow: 0 0 24px rgba(255, 182, 39, 0.18);
}
```

---

## 8. 접근성 (WCAG 2.1 AA)

| 텍스트 | 배경 | 대비 | 통과 |
|---|---|---|---|
| `#0A0A0A` | `#FAFAF7` | 18.7:1 | ✓ AAA |
| `rgba(10,10,10,0.62)` | `#FAFAF7` | 7.4:1 | ✓ AAA |
| `rgba(10,10,10,0.40)` | `#FAFAF7` | 3.7:1 | ✓ AA (큰 글자) |
| `#B88308` | `#FAFAF7` | 5.1:1 | ✓ AA |
| `#FFFFFF` | `#0A0A0A` | 19.6:1 | ✓ AAA |
| `#FFB627` | `#0A0A0A` | 11.2:1 | ✓ AAA |

**`--text-subtle` 이하 (0.40, 0.22) 는 12px 본문에 사용 금지** — 메타 정보·라벨 한정. 큰 글자(18px+) 또는 14px+ bold 에서만 사용.

색맹 친화:
- 빨강 단독 → ❗ 아이콘 병용
- 녹색 단독 → ✓ 아이콘 병용
- Pro 표시 등 차별화는 채도 대신 굵기·아웃라인으로

---

## 9. 페이지별 적용 매트릭스

| 페이지 | 표면 | 골드 base | 한자 강조 | 의미적 컬러 |
|---|:---:|:---:|:---:|:---:|
| 랜딩 (`/`) | 라이트 | `--gold-on-light` | ✓ | ❌ |
| Features | 라이트 | `--gold-on-light` | ✓ | ❌ |
| Pricing | 라이트 | `--gold-on-light` | ✓ | ❌ |
| Demo (`/demo`) | 라이트 + 미니 시청 영역만 다크 | 표면별 | ✓ | ❌ |
| 교수자 대시보드 | 라이트 | `--gold-on-light` | ✓ | ✓ (차트·경고) |
| 교수자 studio | 라이트 | `--gold-on-light` | ✓ | ✓ (비용 미터) |
| 학생 진입 (`/v/...`) | 라이트 | `--gold-on-light` | ✓ | △ (저장 dot 등 가벼움) |
| 학생 player | 다크 | `--gold` | ✓ | △ |
| 인터스티셜 퀴즈 | 다크 오버레이 | `--gold` | ✓ | ❌ |

---

## 10. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-05 | v1: 다크/골드 + 그라데이션 메쉬 정책 확정 (legacy 보존) |
| 2026-05-12 | **v2 전면 전환** — Studio(05)·Student(06) prototype 추출 토큰 통합. 라이트 베이지 베이스로 일원화. 학습자 다크 강제 정책 폐기 (player 한정). 마스코트 정책 폐기. 한자 강조 토큰 신설. 오로라 메쉬·violet/cyan/pink 그라데이션 폐기. |

---

## 11. Legacy v1 (아카이브)

> 아래는 2026-05-05 ~ 2026-05-12 사이 운영된 v1 정책. **현재 사용하지 않음**. 코드에서 발견되면 v2 토큰으로 교체 대상.

### v1 영역별 컬러

| 영역 | 베이스 | 포인트 |
|---|---|---|
| 메인 사이트 | `#0A0A0A` 다크 | 골드 + 오로라 메쉬 |
| 교수자 화면 | 라이트 | 골드 |
| 학습자 화면 | **다크 강제** | 무채색 |

### v1 폐기 토큰
```css
/* 아래는 모두 v2 에서 폐기 */
--grad-violet:   linear-gradient(135deg, #A78BFA 0%, #6366F1 100%);
--grad-electric: linear-gradient(135deg, #FFB627 0%, #F59E0B 100%);
--grad-cyan:     linear-gradient(135deg, #22D3EE 0%, #0EA5E9 100%);
--grad-pink:     linear-gradient(135deg, #F472B6 0%, #EC4899 100%);

.aurora-bg { /* radial-gradient 다중 오브 + aurora-shift keyframes */ }

/* 마스코트 컬러 — mascot.md 폐기와 함께 */
--mascot-base:  #6B5B47;
--mascot-light: #A89678;
--mascot-eye:   #1A1A1A;
--mascot-beak:  #D4923A;
```

### v1 → v2 마이그레이션 표

| v1 토큰 | v2 토큰 |
|---|---|
| `--bg-dark`, `--bg-dark-soft`, `--bg-card-dark` | 동일 (다크 표면 한정 유지) |
| `--bg-light`, `--bg-card-light`, `--bg-sidebar-light` | `--bg`, `--bg-card` (light prefix 제거 — 기본이 됨) |
| `--text-on-light`, `--text-on-light-muted`, `--text-on-light-subtle` | `--text`, `--text-muted`, `--text-subtle` |
| `--text-on-dark`, `--text-on-dark-muted`, `--text-on-dark-subtle` | `--text-dark`, `--text-dark-muted`, `--text-dark-subtle` |
| `--line-on-light` | `--line` |
| `--line-on-dark` | `--line-dark` |
| `--gold-text-on-light` | `--gold-on-light` |
| `--gold-text-on-dark` | `--gold` |
| `--gold-glow-soft/medium/strong` | `--gold-soft`/`--gold-medium`/`--gold-glow` (이름 단순화) |
| `--shadow-card-hover` (골드 글로우) | `--shadow-md` + `border-color: var(--gold-on-light)` 조합 |
| `.aurora-bg`, `--grad-violet/cyan/pink` | **삭제** |
| 마스코트 토큰 전체 | **삭제** (mascot.md 폐기) |
