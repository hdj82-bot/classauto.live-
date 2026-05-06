# 디자인 시스템 (Design System)

ClassAuto의 모든 시각·인터랙션 결정을 담은 디자인 시스템 가이드.

---

## 문서 목록

| 파일 | 내용 | 상태 |
|---|---|---|
| [00-README.md](./00-README.md) | 이 파일 — 디자인 시스템 인덱스 | ✓ |
| [typography.md](./typography.md) | 폰트 정책 (Pretendard + Paperlogy) | ✓ 확정 |
| [colors.md](./colors.md) | 색상 시스템 (다크/골드, 그라데이션) | ✓ 확정 |
| [animations.md](./animations.md) | 동적 요소 가이드 (16가지 개선) | ✓ 확정 |
| [icons.md](./icons.md) | 그라데이션 SVG 아이콘 정책 | ✓ 확정 |
| [mascot.md](./mascot.md) | 올빼미 마스코트 가이드 | ✓ 확정 |

---

## 핵심 원칙 5가지

### 1. 두 폰트만 사용
**Pretendard** (본문) + **Paperlogy** (디스플레이) 두 가지 외 폰트 도입 금지.
숫자도 Pretendard tabular-nums 사용 (Geist Mono 대체).

### 2. 페르소나별 시각 톤 분리
- 메인 사이트·교수자: 다크 베이스 + 골드 (또는 라이트 + 골드)
- 학습자: 다크 모드 강제 (`#0A0A0A`)
- 두 영역 간 전환 시 시각적 충격이 의도적

### 3. 무채색 + 그라데이션 (ElevenLabs 톤)
의미적 컬러(빨강·녹색)는 교수자 데이터 시각화에서만 허용. 그 외 영역은 무채색 + 골드 + 그라데이션 메쉬.

### 4. 모든 이모지는 그라데이션 SVG로 통일 (옵션 C)
페이지 전체에서 같은 의미는 같은 SVG. 이모지 폰트 의존 금지.

### 5. 마스코트는 학습자 영역에서만
올빼미 캐릭터는 집중 경고·인터스티셜 퀴즈·demo CTA에만 등장. 메인 사이트·교수자 화면에는 등장 안 함.

---

## 디자인 시스템 적용 우선순위

### 즉시 적용 (모든 페이지)
- 폰트 (Pretendard + Paperlogy)
- 색상 변수 (CSS custom properties)
- 그라데이션 SVG 아이콘

### 페이지별 적용
- 동적 요소 (페이지 특성에 맞게)
- 마스코트 (학습자 영역만)

### 점진적 적용
- 접근성 옵션 (모션 줄이기 토글)
- 다국어 폰트 fallback (중국어·영어)

---

## 변경 시 주의

디자인 시스템은 **여러 페이지에 영향을 미칩니다**. 변경 시:
1. 본 디렉터리의 관련 문서 업데이트
2. 영향받는 페이지 모두 재검토
3. PR 본문에 영향 페이지 명시
4. CLAUDE.md의 작업 우선순위에 반영

---

## CSS 변수 시스템 (참고)

권장 변수 구조 (자세한 사항은 colors.md):

```css
:root {
  /* 베이스 */
  --bg-light: #FAFAF7;
  --bg-dark: #0A0A0A;
  --bg-card: #FFFFFF;
  --text-primary: #0A0A0A;
  --text-muted: rgba(255, 255, 255, 0.55);

  /* 골드 */
  --gold: #FFB627;
  --gold-glow-soft: rgba(255, 182, 39, 0.03);
  --gold-glow-medium: rgba(255, 182, 39, 0.15);

  /* 그라데이션 */
  --grad-violet: linear-gradient(135deg, #A78BFA, #6366F1);
  --grad-electric: linear-gradient(135deg, #FFB627, #F59E0B);
  --grad-cyan: linear-gradient(135deg, #22D3EE, #0EA5E9);
  --grad-pink: linear-gradient(135deg, #F472B6, #EC4899);

  /* 의미적 컬러 (교수자 영역만) */
  --semantic-warning: #EF4444;
  --semantic-success: #10B981;

  /* 라인·디바이더 */
  --line: rgba(255, 255, 255, 0.08);
  --line-subtle: rgba(255, 255, 255, 0.04);
}
```
