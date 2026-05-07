"use client";

import LegalShell from "./LegalShell";
import { PRIVACY } from "./legalSections";

/**
 * `/privacy` 페이지 본체 — 15개 항목 + 변경 이력. 콘텐츠는
 * `messages/_patches/legalHub.{ko,en}.json` 의 `legalHub.privacy.*` 에 위치.
 *
 * 정책 정합:
 *   - 한국 개인정보보호법 + 정보통신망법 + GDPR 핵심 (제15조-제22조)
 *   - 학생 데이터 특별 보호 §9 ↔ 06-student-pages.md §4.3 + CLAUDE.md "학생 데이터 보호"
 *   - RAG 임베딩 §8 ↔ pgvector 보존·삭제 정책
 *   - 데모 데이터 §10 ↔ 02-guardrails.md §7.3
 *   - 안전성 확보 조치 §12 ↔ 07-additional-pages.md §3 (security 페이지)
 */
export default function PrivacyContent() {
  return <LegalShell spec={PRIVACY} />;
}
