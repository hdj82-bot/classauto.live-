# Icons (그라데이션 SVG 정책)

> **상태**: v2 갱신 · 2026-05-12 — 그라데이션 컬러 매핑 변경
> **결정**: 모든 이모지를 그라데이션 SVG로 통일 (옵션 C). v2에서 그라데이션은 **골드 단일 톤(electric)** 기본, 필요 시 monochrome line + accent gold 로 단순화. v1 의 violet · cyan · pink 그라데이션은 폐기 (colors.md §6.3 참조).

---

## ⚠️ v2 변경 요약

| 항목 | v1 | v2 |
|---|---|---|
| 그라데이션 컬러 매핑 | violet (스크립트·books), cyan (chart·data), pink (감정), electric (미디어), success (긍정) | **electric (골드) 단일** + monochrome line. 의미 구분은 아이콘 형태로. |
| 다크 표면 위 stroke | 흰색 | `var(--text-dark)` 또는 `var(--gold)` |
| 라이트 표면 위 stroke | `#0A0A0A` | `var(--text)` 또는 `var(--gold-on-light)` |
| hover 시 그라데이션 전환 | 단색 → 그라데이션 stroke | 색·굵기 변화로 단순화 (acceleration 회피) |

아래 §2 의 매핑 표에서 violet · cyan · pink 라고 적힌 항목은 모두 **electric 또는 monochrome 로 대체**.

---

## 1. 정책 — 옵션 C 채택

### 1.1 옵션 비교 (의사결정 기록)

| | A. 모든 이모지를 SVG로 | B. 이모지 + hover 효과 | **C. 카테고리별 통일 (채택)** |
|---|---|---|---|
| 일관성 | 매우 높음 | 낮음 | 높음 |
| 작업량 | 매우 많음 | 빠름 | 중간 |
| 디자인 시스템 통합 | ✓ | ✗ | ✓ |
| ElevenLabs 톤 | ✓ | ✗ | ✓ |

옵션 C: **같은 의미는 같은 SVG**. 페이지 전체에서 일관되게 재사용.

### 1.2 핵심 원칙
- ❌ 이모지 폰트 사용 금지 (📹 👥 💬 등 unicode 이모지)
- ✅ 모든 시각 심볼은 SVG 또는 SVG 컴포넌트로 구현
- ✅ 같은 의미는 페이지 전체에서 같은 SVG 사용
- ✅ 그라데이션 stroke 또는 fill 적용 (콘텍스트별)

---

## 2. 카테고리별 SVG 매핑

### 2.1 콘텐츠·미디어
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| 📹 | `icon-video` | electric | demo, features, dashboard |
| 🎬 | `icon-clapperboard` | electric | studio, features |
| 📝 | `icon-document` | violet | studio (스크립트), inbox |
| 📊 | `icon-chart` | cyan | dashboard, analytics |
| 📈 | `icon-trend-up` | success | dashboard 카운터 |
| 📚 | `icon-books` | violet | use-cases, /v/[ID] |

### 2.2 사용자·역할
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| 👥 | `icon-users` | violet | dashboard, pricing |
| 👤 | `icon-user` | violet | profile, learners |
| 🎓 | `icon-graduation` | electric | demo CTA, beta-apply |
| 🏛️ | `icon-institution` | electric | pricing 기관 라이선스, contact |

### 2.3 인터랙션
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| 💬 | `icon-chat` | electric | Q&A 패널, demo |
| 🎤 | `icon-mic` | pink | Q&A 음성 입력 |
| ▶ | `icon-play` | (단색 골드) | 영상 컨트롤, 카드 CTA |
| ⏸ | `icon-pause` | (단색) | 영상 컨트롤 |
| 📌 | `icon-pin` | electric | RAG 출처 인용 |

### 2.4 시간·진행
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| ⏱️ | `icon-timer` | cyan | demo (3분 소요), 스트릭 |
| 🔥 | `icon-fire` | electric | 학습 스트릭 |
| ✓ | `icon-check` | success | 체크리스트, 정답 |
| ✗ | `icon-x` | warning | 오답, 거부 |

### 2.5 기능·기술
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| ⚡ | `icon-bolt` | electric | 베타 배너, 빠른 기능 |
| 🔒 | `icon-lock` | (단색) | 보안 정책, 비밀번호 |
| 🛡️ | `icon-shield` | violet | trust, security |
| 🌐 | `icon-globe` | cyan | 다국어, 글로벌 |
| 💰 | `icon-coin` | electric | 비용 미터 |
| 🏆 | `icon-trophy` | electric | 도전 과제, 인증서 |
| 💡 | `icon-bulb` | electric | 안내·팁 |

### 2.6 공유·소셜
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| 📧 | `icon-mail` | (단색) | 공유 |
| 🔗 | `icon-link` | (단색) | URL 복사 |
| 📱 | `icon-qr` | (단색) | QR 코드 |
| 카톡 | `icon-kakao` | (브랜드 컬러) | 공유 |
| X | `icon-x-logo` | (단색) | 공유 |

### 2.7 학습·UX 마이크로인터랙션
| 이모지 (이전) | SVG 이름 | 그라데이션 | 사용 페이지 |
|:---:|---|---|---|
| 👍 | `icon-thumbs-up` | (단색) | 익명 반응 |
| 🤔 | `icon-thinking` | (단색) | 익명 반응 |
| 😊 | `icon-smile` | (단색) | 익명 반응 |
| 🦉 | (마스코트는 별도) | 마스코트 컬러 | 집중 경고, 퀴즈 |

---

## 3. 그라데이션 정의 (SVG defs)

페이지 어딘가 한 번만 정의, 모든 SVG가 참조:

```html
<svg width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="grad-violet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A78BFA"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>

    <linearGradient id="grad-electric" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFB627"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>

    <linearGradient id="grad-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22D3EE"/>
      <stop offset="100%" stop-color="#0EA5E9"/>
    </linearGradient>

    <linearGradient id="grad-pink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F472B6"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>

    <linearGradient id="grad-success" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <linearGradient id="grad-warning" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F87171"/>
      <stop offset="100%" stop-color="#EF4444"/>
    </linearGradient>
  </defs>
</svg>
```

각 SVG에서 사용:
```html
<svg viewBox="0 0 24 24" width="24" height="24">
  <path d="..." stroke="url(#grad-electric)" stroke-width="2" fill="none"/>
</svg>
```

---

## 4. SVG 컴포넌트 구현 (Next.js)

### 4.1 React 컴포넌트 패턴

```jsx
// components/Icon.jsx
const ICONS = {
  'icon-video': {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M2 6a2 2 0 0 1 2-2h14...', stroke: 'currentColor' },
    ],
  },
  // ... 기타 아이콘
};

export function Icon({ name, gradient, size = 24, ...props }) {
  const icon = ICONS[name];
  if (!icon) return null;

  return (
    <svg
      viewBox={icon.viewBox}
      width={size}
      height={size}
      fill="none"
      {...props}
    >
      {icon.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={gradient ? `url(#grad-${gradient})` : 'currentColor'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

// 사용
<Icon name="icon-video" gradient="electric" size={32} />
```

### 4.2 사용 위치
- `components/Icon.jsx` — 컴포넌트
- `components/IconDefs.jsx` — 그라데이션 defs (페이지당 1회 마운트)
- `_app.tsx` 또는 `layout.tsx`에 IconDefs 포함

---

## 5. 사이즈 가이드

| 위치 | 크기 |
|---|---|
| 본문 인라인 (텍스트와 함께) | 14-16px |
| 버튼 안 | 16-20px |
| 카드 헤더 | 24-32px |
| 큰 강조 (히어로 메타) | 32-48px |
| Feature 카드 메인 아이콘 | 48-64px |
| 영상 컨트롤 (재생 버튼 등) | 24-32px |

---

## 6. 단색 vs 그라데이션 사용 규칙

### 6.1 단색 (currentColor 또는 골드)
- 영상 컨트롤 (▶ ⏸)
- 작은 인라인 아이콘 (텍스트 옆)
- 의미가 명확하지 않은 보조 아이콘
- 다크/라이트 모드 둘 다에서 보여야 하는 UI 아이콘

### 6.2 그라데이션
- 카드의 메인 아이콘 (시각적 임팩트)
- Feature 강조 (4가지 색상으로 구분)
- 히어로 메타 정보
- 통계 카드 stat-icon

### 6.3 호버 시 그라데이션 전환
평소엔 단색, 호버 시에만 그라데이션:
```css
.icon-button svg {
  stroke: currentColor;
  transition: stroke 200ms;
}
.icon-button:hover svg {
  stroke: url(#grad-electric);
}
```

---

## 7. 접근성

### 7.1 의미 있는 아이콘
```html
<svg role="img" aria-label="비디오 재생">
  <title>비디오 재생</title>
  <path .../>
</svg>
```

### 7.2 장식용 아이콘
```html
<svg aria-hidden="true">
  <path .../>
</svg>
```

### 7.3 색맹 친화
의미를 색상에만 의존하지 않음. 예:
- ✓ 녹색 + check 모양 (둘 다)
- ✗ 빨강 + X 모양 (둘 다)
- ⚠️ 주황 + ! 모양 (둘 다)

---

## 8. 아이콘 추가 프로세스

새 SVG가 필요할 때:

1. **이미 있는지 확인** — 비슷한 의미의 기존 아이콘 사용
2. **이름 결정** — `icon-카테고리-동작` 형식 (예: `icon-chart-bar`)
3. **SVG 라이브러리에서 가져오기** (권장 순서):
   - Lucide (기본 톤과 잘 맞음)
   - Heroicons (Tailwind 호환)
   - Phosphor (다양한 weight)
   - 자체 디자인 (위 라이브러리에 없을 때만)
4. **24x24 viewBox로 정규화**
5. **stroke-width 2로 통일**
6. **`components/Icon.jsx`에 등록**
7. **본 문서의 매핑 표에 추가**

---

## 9. 라이브러리 vs 자체 SVG

### 9.1 외부 라이브러리 사용 시
```bash
npm install lucide-react
```

```jsx
import { Video, Users, MessageCircle } from 'lucide-react';

<Video color="url(#grad-electric)" size={24} />
```

장점: 빠른 개발
단점: 그라데이션 적용이 까다로움 (color prop 한정)

### 9.2 자체 SVG 시스템 (권장)
- 그라데이션 자유롭게 적용
- 번들 크기 최적화 (사용하는 아이콘만)
- 디자인 시스템 통합

---

## 10. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-05 | 옵션 C (카테고리별 SVG 통일) 채택 |
| 2026-05-05 | 7개 카테고리 50개+ 아이콘 매핑 정의 |
| 2026-05-05 | 그라데이션 defs 6종 표준화 |
