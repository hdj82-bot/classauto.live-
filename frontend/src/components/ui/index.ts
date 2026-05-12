/**
 * UI 공용 컴포넌트 barrel — v2 (2026-05-12)
 *
 * 모든 페이지·worktree (창 2/3/4) 에서 이 한 경로로 import.
 *
 *   import { Button, Card, GoldPill, Han, BrandDot, SavedChip } from "@/components/ui";
 *
 * 새 공용 컴포넌트는 여기에 추가. 페이지별 (landing/student/professor) 로컬
 * 컴포넌트는 본 barrel 에서 export 하지 말 것 — 그쪽 폴더 안에서만 사용.
 */

export { default as Button } from "./Button";
export { default as Card } from "./Card";
export { default as GoldPill } from "./GoldPill";
export { default as Han } from "./Han";
export { default as BrandDot } from "./BrandDot";
export { default as SavedChip } from "./SavedChip";

// 기존 v1 부터 있던 컴포넌트 — Toast/Modal/LoadingSpinner 는 그대로 노출
export { default as LoadingSpinner } from "./LoadingSpinner";
export { default as Modal } from "./Modal";
// ToastProvider 등 multi-export
export * from "./Toast";
