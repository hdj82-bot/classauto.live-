# DEPS_TO_ADD.STUDIO — 신규 의존성 없음 확인서

> **창**: W1 (창1)
> **작업일**: 2026-05-07

본 PR (`feat/studio-wizard`) 은 **신규 npm 의존성을 도입하지 않습니다**.

---

## 사용한 라이브러리는 모두 기존 `frontend/package.json` 의존성

| 사용처 | 라이브러리 | 비고 |
|---|---|---|
| 페이지 라우팅 | `next` (16.2.1) | 기존 |
| 인증 보호 | `@/components/ProtectedRoute` (기존) | layout.tsx 가 처리 |
| HTTP | `axios` (1.13.6) | 기존 (`@/lib/api`) |
| 상태 관리 | React 19 hooks | 기존 |
| 스타일 | Tailwind CSS 4 | 기존 |
| 테스트 | `vitest`, `@testing-library/react` | 기존 |

---

## 도입을 검토했으나 보류한 항목

### `qrcode` (또는 `qr-image`)

QR PNG 생성. `Step5Share` 의 "QR 다운로드" 버튼이 이걸 도입하면 즉시
동작 가능.

**보류 사유**:
- 1024×1024 + 중앙 로고 오버레이는 클라이언트 단에서 생성하면 인쇄용
  품질이 떨어짐 (canvas 합성 → JPEG 압축 손실)
- 학생 강의 URL 을 외부 서드파티 QR API 에 보내는 건 학생 데이터 보호
  정책 위반 소지
- 백엔드에서 PNG 를 한 번 생성·캐시하는 게 더 적합 → **BACKEND_ASKS.STUDIO §3**

### `react-dropzone`

드래그/드롭 PPT 업로드. 본 PR 의 `Step1PptUpload` 는 이미 `useRef` +
`onDragOver` / `onDrop` 으로 자체 구현 — 기존 `/professor/lecture/new`
와 동일 패턴.

**보류 사유**: 자체 구현 분량이 ~30줄, 라이브러리 추가 부담 대비 가치 낮음.

### Chart 라이브러리 (recharts / chart.js / nivo)

Step3 / Step4 에 미니 차트 도입 검토했으나, 본 PR 의 시각화는 진행 바 +
비용 미터로 충분. 차트는 창3 (`/professor/analytics`) 에서 본격 도입
검토 대상.

---

## 결론

본 PR 은 **순수 React + 기존 의존성** 으로 완성. 통합 PR 시 추가 검증이
필요한 dependency drift 없음.
