# Animations (동적 요소)

> **상태**: v2 갱신 · 2026-05-12 (easing 토큰 통합)
> **결정**: 페이지별 동적 요소는 유지하되, aurora 메쉬·violet/cyan/pink 그라데이션은 [colors.md v2 정책](./colors.md) 에 따라 폐기. 새 easing 변수는 `--ease-out` / `--ease-spring` 두 개로 정리.

---

## 0. Easing 토큰 (v2 신설)

```css
--ease-out:    cubic-bezier(0.32, 0.72, 0, 1);   /* 기본 ease-out — 진입·hover */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 살짝 튀는 spring — pop-in, success */
```

직접 cubic-bezier 를 박지 말고 변수로만 참조. duration은 컴포넌트별 자율이지만 §1.2 가이드 따름.

---

## 1. 핵심 원칙

### 1.1 모션의 4가지 역할
1. **방향 안내** — 어디에서 어디로 (페이지 전환)
2. **상태 변화** — 클릭·호버 피드백
3. **주목 유도** — CTA 펄스, 신규 콘텐츠
4. **분위기** — 부드러운 흐름 (그라데이션 메쉬 v1 정책은 폐기)

### 1.2 페르소나별 모션 톤 (v2)

| 영역 | 모션 톤 | 기본 속도 | easing |
|---|---|---|---|
| 메인 사이트 (랜딩 등) | 부드러움 + 임팩트 | 200-360ms | `--ease-out` |
| 교수자 화면 (라이트) | 빠르고 기능적 | 140-220ms | `--ease-out` |
| 교수자 success 피드백 (저장됨 dot 등) | 살짝 통통 | 280ms | `--ease-spring` |
| 학생 진입·상세 (라이트) | 부드러움 | 360-500ms fade-in stagger | `--ease-out` |
| 학생 player (다크) | 매우 부드러움 | 300-500ms | `--ease-out` |
| 인터스티셜 퀴즈 | 점진적 강도 증가 | 1단계 200ms → 3단계 500ms | `--ease-out` |

### 1.3 절대 원칙
- `prefers-reduced-motion: reduce` 반드시 지원 (모든 동적 요소 비활성화 또는 즉시 최종 상태)
- 60fps 유지 (transform·opacity만 애니메이션, layout 변경 X)
- 자동 재생 무한 루프는 모바일 배터리 고려 (60초 이상은 일시정지 옵션)
- localStorage 사용 금지 (artifact·SSR 호환). state·서버 세션·URL 쿼리만.

### 1.4 v2 폐기 항목
- ❌ `aurora-bg` radial-gradient 다중 오브 (오로라 메쉬)
- ❌ `--grad-violet` / `--grad-cyan` / `--grad-pink` 사용
- ❌ `aurora-shift` keyframes
- ❌ 학습자 영역의 다크 강제와 결합된 글로우 펄스 — 학생 player 에서만 유지

---

## 2. /index.html (랜딩) — 6가지 개선

### 2.1 히어로 배경 그라데이션 메쉬
```css
.aurora-bg::after {
  background:
    radial-gradient(ellipse at 20% 30%, rgba(167, 139, 250, 0.15), transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(255, 182, 39, 0.12), transparent 50%);
  animation: aurora-shift 60s ease-in-out infinite;
}

@keyframes aurora-shift {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(2%, -1%); }
  66% { transform: translate(-1%, 2%); }
}
```

영상 위 ::after 레이어. 60초 주기 — 의식적으로 인지되지 않을 정도로 느리게.

### 2.2 통계 카운터 카운트업
```javascript
function animateCount(element, target, duration = 1500) {
  const start = 0;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.floor(start + (target - start) * easeOut).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// IntersectionObserver로 진입 시 1회만 실행
```

Paperlogy ExtraBold + tabular-nums.

### 2.3 Feature 카드 아이콘 그라데이션 stroke
```css
.fc-icon {
  stroke: url(#grad-violet);  /* SVG defs 참조 */
  transition: transform 300ms ease-out, filter 300ms;
}
.fc-icon:hover {
  transform: rotate(-8deg) scale(1.1);
  filter: drop-shadow(0 0 12px var(--gold-glow-medium));
}
```

각 아이콘별 그라데이션:
- violet: `#A78BFA → #6366F1`
- electric: `#FFB627 → #F59E0B`
- cyan: `#22D3EE → #0EA5E9`
- pink: `#F472B6 → #EC4899`

### 2.4 차트 그래프 동적화
```css
.chart-line {
  stroke: url(#grad-electric);
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: draw-line 2s ease-out forwards;
}

@keyframes draw-line {
  to { stroke-dashoffset: 0; }
}
```

페이지 진입 시 라인이 그려지는 효과. 데이터 포인트는 stagger로 순차 등장. 호버 시 툴팁.

### 2.5 Mesh-network 비주얼
```css
.mesh-node {
  animation: float 6s ease-in-out infinite;
  animation-delay: var(--delay);
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(var(--dx), var(--dy)); }
}

.mesh-line {
  stroke-dasharray: 4 8;
  animation: pulse-flow 3s linear infinite;
}

@keyframes pulse-flow {
  to { stroke-dashoffset: -12; }
}
```

각 노드 다른 위상 (`--delay`), 라인엔 펄스 빛 흐름.

### 2.6 스크롤 트리거 페이드인
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
```

```css
.fade-up {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 600ms, transform 600ms;
}
.fade-up.visible {
  opacity: 1;
  transform: translateY(0);
}
.fade-up:nth-child(2) { transition-delay: 100ms; }
.fade-up:nth-child(3) { transition-delay: 200ms; }
```

---

## 3. /features.html — 4가지 개선

### 3.1 Video-input-icon 모핑
PPT 페이지 → 영상으로 변환되는 SVG 모핑 애니메이션. 3초 루프.

```css
.morph-icon path {
  d: path('...slide rectangle...');
  animation: ppt-to-video 3s ease-in-out infinite;
}

@keyframes ppt-to-video {
  0%, 100% { d: path('...slide...'); }
  50% { d: path('...play button...'); }
}
```

### 3.2 Module-icon 4개 호버 분해 재조립
```css
.module-icon-part {
  transition: transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.module-icon:hover .part-1 { transform: translate(-4px, -4px); }
.module-icon:hover .part-2 { transform: translate(4px, -4px); }
.module-icon:hover .part-3 { transform: translate(-4px, 4px); }
.module-icon:hover .part-4 { transform: translate(4px, 4px); }
```

평소엔 정적, hover 시만 동적 — 성능 우선.

### 3.3 Progress shimmer
```css
.progress-bar {
  background: linear-gradient(90deg,
    var(--gold) 0%,
    #FFFFFF 50%,
    var(--gold) 100%);
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

@keyframes shimmer {
  to { background-position: -200% 0; }
}
```

100% 도달 시:
```css
.progress-complete::after {
  content: '✓';
  animation: check-draw 600ms ease-out forwards;
}
```

### 3.4 Isometric 그리드 패럴랙스
```javascript
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  document.querySelector('.iso-grid').style.transform =
    `translateY(${scrolled / 8}px)`;
});
```

스크롤 1/8 속도로 이동. throttle 적용.

---

## 4. /dashboard.html — 6가지 개선

### 4.1 통계 카드 카운트업 + sparkline
- 숫자: 카운트업 (위 `animateCount` 함수 재사용)
- sparkline: 지난 7일 추이 미니 SVG 차트
- 카드 hover 시 sparkline 색이 채워지며 활성화

```html
<div class="stat-card" data-target="78">
  <div class="stat-number">0</div>
  <svg class="sparkline" viewBox="0 0 100 30">
    <polyline class="spark-line" points="0,20 20,15 40,18 60,10 80,12 100,5"/>
    <polygon class="spark-fill" points="0,30 0,20 20,15 40,18 60,10 80,12 100,5 100,30"/>
  </svg>
</div>
```

### 4.2 메인 차트 — gradient fill 영역
```css
.area-chart-fill {
  fill: url(#area-gradient);
  opacity: 0;
  animation: fade-in 800ms ease-out 400ms forwards;
}
```

```html
<linearGradient id="area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="#FFB627" stop-opacity="0.3"/>
  <stop offset="100%" stop-color="#FFB627" stop-opacity="0"/>
</linearGradient>
```

데이터 포인트 호버 시 글로우 + 툴팁 슬라이드인. 시간 범위 토글 시 morph 트랜지션.

### 4.3 도넛 차트
```css
.donut-segment {
  stroke-dasharray: 251.2;  /* 2 * π * r */
  stroke-dashoffset: 251.2;
  animation: donut-fill 1.5s ease-out forwards;
}

@keyframes donut-fill {
  to { stroke-dashoffset: var(--final-offset); }
}
```

각 섹션 호버 시 살짝 바깥으로 튀어나옴 + 중앙 숫자 카운트업.

### 4.4 활동 피드 — 새 항목 슬라이드인
```css
.activity-item.new {
  animation:
    slide-in-top 400ms ease-out,
    glow-fade 3s ease-out 400ms;
}

@keyframes slide-in-top {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes glow-fade {
  0% { background: rgba(255, 182, 39, 0.15); }
  100% { background: transparent; }
}
```

### 4.5 사이드바 nav-icon 8개
```css
.nav-icon.active {
  filter: drop-shadow(0 0 8px var(--gold-glow-medium));
  animation: pulse-subtle 3s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% { filter: drop-shadow(0 0 8px var(--gold-glow-medium)); }
  50% { filter: drop-shadow(0 0 14px var(--gold-glow-strong)); }
}

.nav-item:hover .nav-icon {
  animation: wiggle 0.4s ease-in-out;
}

@keyframes wiggle {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}
```

클릭 시 잉크 리플 효과 (Material Design):

```css
.nav-item::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 182, 39, 0.2);
  transform: scale(0);
  opacity: 0;
}
.nav-item:active::after {
  animation: ripple 600ms ease-out;
}

@keyframes ripple {
  to { transform: scale(4); opacity: 0; }
}
```

### 4.6 비용 미터 — 그라데이션 진행 바
```css
.cost-meter-fill {
  width: var(--percent);
  background: linear-gradient(90deg, #10B981 0%, #FFB627 70%, #EF4444 100%);
  background-size: 200% 100%;
  background-position: calc(100% - var(--percent)) 0;
  transition: width 800ms ease-out, background-position 800ms ease-out;
}

.cost-meter-fill[data-warning="true"] {
  animation: pulse-warning 1.5s ease-in-out infinite;
}

@keyframes pulse-warning {
  0%, 100% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
  50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.6); }
}
```

80% 한도 초과 시 펄스 깜빡임. 숫자는 티커 카운터 효과 (선택적).

---

## 5. 학습자 영역 동적 요소

### 5.1 Q&A 패널 슬라이드인
```css
.qa-panel {
  transform: translateX(100%);
  transition: transform 400ms cubic-bezier(0.32, 0.72, 0, 1);
}
.qa-panel.open {
  transform: translateX(0);
}
```

영상도 동시에 좌측으로 축소:
```css
.video-wrapper {
  transition: width 400ms cubic-bezier(0.32, 0.72, 0, 1);
}
.qa-panel.open ~ .video-wrapper {
  width: 60%;
}
```

### 5.2 AI 답변 thinking dots
```css
.thinking-dots span {
  animation: pulse-dot 1.4s ease-in-out infinite;
}
.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes pulse-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
```

### 5.3 집중 경고 1단계 — 화면 가장자리 펄스
```css
.attention-1 {
  box-shadow: inset 0 0 60px rgba(167, 139, 250, 0);
  animation: edge-pulse 2s ease-in-out infinite;
}

@keyframes edge-pulse {
  0%, 100% { box-shadow: inset 0 0 60px rgba(167, 139, 250, 0); }
  50% { box-shadow: inset 0 0 120px rgba(167, 139, 250, 0.3); }
}
```

### 5.4 집중 경고 2단계 — 영상 페이드 + 모달
```css
.attention-2-overlay {
  background: rgba(10, 10, 10, 0.6);
  backdrop-filter: blur(8px);
  opacity: 0;
  animation: fade-in 400ms ease-out forwards;
}
```

### 5.5 인터스티셜 퀴즈 카운트다운
```css
.quiz-timer {
  stroke-dasharray: 283;  /* 2π × 45 */
  stroke-dashoffset: 0;
  animation: timer-countdown 10s linear forwards;
}

@keyframes timer-countdown {
  to { stroke-dashoffset: 283; }
}
```

10초 카운트다운 시각화.

---

## 6. 데모 페이지 동적 요소

### 6.1 분야 선택 카드 호버
```css
.field-card {
  transition: transform 300ms ease-out, box-shadow 300ms;
}
.field-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px var(--gold-glow-medium);
}
```

### 6.2 추천 질문 카드 펄스
```css
.suggestion-card {
  animation: subtle-pulse 3s ease-in-out infinite;
}
.suggestion-card:nth-child(2) { animation-delay: 1.5s; }

@keyframes subtle-pulse {
  0%, 100% { box-shadow: 0 0 0 var(--gold-glow-soft); }
  50% { box-shadow: 0 0 16px var(--gold-glow-medium); }
}
```

### 6.3 도전 과제 배지 글로우
```css
.challenge-badge.completed {
  animation: badge-glow 1s ease-out;
}

@keyframes badge-glow {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); filter: drop-shadow(0 0 16px var(--gold)); }
  100% { transform: scale(1); }
}
```

---

## 7. prefers-reduced-motion 정책

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  .aurora-bg::after { animation: none; }
  .pulse-warning { animation: none; }
  .stat-number { /* 카운트업 대신 즉시 표시 */ }
}
```

모든 페이지 CSS 최상단에 포함.

---

## 8. 성능 가이드

### 8.1 GPU 가속만 사용
- ✅ `transform`, `opacity`, `filter`
- ❌ `width`, `height`, `top`, `left`, `margin`

### 8.2 will-change 신중히
복잡한 애니메이션 시작 직전에만:
```javascript
element.style.willChange = 'transform';
// 애니메이션 종료 후
element.style.willChange = 'auto';
```

### 8.3 IntersectionObserver 활용
화면 밖 요소는 애니메이션 멈춤:
```javascript
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    entry.target.classList.toggle('paused', !entry.isIntersecting);
  });
});
```

### 8.4 throttle / debounce
스크롤·resize 이벤트는 throttle 16ms (60fps):
```javascript
function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}
```

---

## 9. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-05 | 페이지별 16가지 동적 요소 정책 확정 |
| 2026-05-05 | prefers-reduced-motion 의무 지원 |
| 2026-05-05 | 페르소나별 모션 톤 분리 |
