// Shared client-side validators for the marketing forms (/beta-apply and
// /contact). Pure functions — no React, no DOM — so the same predicates can
// be unit-tested directly.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCHOOL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.(ac\.kr|edu|edu\.[a-z]{2,3})$/i;
const NUMERIC_RE = /^[0-9]+$/;

export function isFilled(value: string): boolean {
  return value.trim().length > 0;
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Soft check used to surface a hint, never to block submission. */
export function looksLikeSchoolEmail(value: string): boolean {
  return SCHOOL_EMAIL_RE.test(value.trim());
}

export function isNumericOrEmpty(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return NUMERIC_RE.test(trimmed);
}

export function isNumericRequired(value: string): boolean {
  return NUMERIC_RE.test(value.trim());
}
