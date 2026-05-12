"use client";

import styles from "./StudentEntry.module.css";

/**
 * CourseTitle — 강의 제목을 06 prototype 의 `.course-title` 스타일로 렌더링.
 *
 * 06 prototype 의 시연 데이터는 `<span class="han">把</span>자문<span class="pcl">
 * (把字句)</span> 입문` 형태. 백엔드가 일반 `title: string` 만 주기 때문에
 * 다음 휴리스틱을 적용한다:
 *
 *   1) 제목이 CJK 문자로 시작하면 첫 한 글자(또는 연속된 CJK 글자 블록)를
 *      `.han` 으로 강조 (골드 색).
 *   2) 괄호 `(...)` 안 내용은 보조 표기로 보고 `.pcl` 로 작게 회색 처리.
 *   3) 그 외는 일반 텍스트.
 *
 * 한자 강의가 아니라면(영어/한국어 일반 제목) 휴리스틱이 매칭되지 않아
 * 그냥 평범한 디스플레이 타이틀로 렌더링된다 — 회귀 없음.
 */
const CJK = /[㐀-鿿豈-﫿]/;

export default function CourseTitle({ title }: { title: string }) {
  const segments = parseCourseTitle(title);
  return (
    <h1 className={styles.courseTitle}>
      {segments.map((seg, i) => {
        if (seg.kind === "han") return <span key={i} className="han">{seg.text}</span>;
        if (seg.kind === "pcl") return <span key={i} className="pcl">{seg.text}</span>;
        return <span key={i}>{seg.text}</span>;
      })}
    </h1>
  );
}

type Seg = { kind: "han" | "pcl" | "plain"; text: string };

export function parseCourseTitle(title: string): Seg[] {
  if (!title) return [{ kind: "plain", text: "" }];
  const out: Seg[] = [];
  let i = 0;
  // (1) 선두 한자 블록을 .han 으로 분리
  let leadEnd = 0;
  while (leadEnd < title.length && CJK.test(title[leadEnd]!)) leadEnd += 1;
  if (leadEnd > 0) {
    out.push({ kind: "han", text: title.slice(0, leadEnd) });
    i = leadEnd;
  }
  // (2) 나머지 — 괄호 `(...)` 만 .pcl, 그 외는 plain
  while (i < title.length) {
    const open = title.indexOf("(", i);
    if (open === -1) {
      out.push({ kind: "plain", text: title.slice(i) });
      break;
    }
    const close = title.indexOf(")", open);
    if (close === -1) {
      out.push({ kind: "plain", text: title.slice(i) });
      break;
    }
    if (open > i) out.push({ kind: "plain", text: title.slice(i, open) });
    out.push({ kind: "pcl", text: ` ${title.slice(open, close + 1)} ` });
    i = close + 1;
  }
  return out;
}
