import type { Locale } from "@/contexts/I18nContext";

/**
 * 게시판 날짜 표기 — 오늘이면 시:분, 그 외엔 YYYY.MM.DD. locale 에 맞춰 표기.
 * 서버는 ISO8601(UTC, timezone-aware) 문자열을 내려준다.
 */
export function formatBoardDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
