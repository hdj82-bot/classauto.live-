"use client";

import LegalShell from "./LegalShell";
import { TERMS } from "./legalSections";

/**
 * `/terms` 페이지 본체 — 14개 조항 + 변경 이력. 실제 콘텐츠는 모두
 * `messages/_patches/legalHub.{ko,en}.json` 의 `legalHub.terms.*` 에 위치.
 *
 * 본 PR 의 source-of-truth 는 다음 기획 문서들과 1:1 정합:
 *   - 결제·환불·해지 (Article 9·10) ↔ 01-pricing-policy.md §4
 *   - 가드레일 위반 / 자동 차단 (Article 12) ↔ 02-guardrails.md §5·§6
 *   - 학생 데이터 보호 (Article 8) ↔ 06-student-pages.md §4.3 + 07-additional-pages.md §2
 */
export default function TermsContent() {
  return <LegalShell spec={TERMS} />;
}
