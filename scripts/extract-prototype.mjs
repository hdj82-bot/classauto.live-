// Claude Design 번들 HTML 에서 실제 template (디자인 본문) 만 빼낸다.
// 사용법: node scripts/extract-prototype.mjs <input.html> <output.html>
//
// 번들 구조:
//   <script type="__bundler/template">JSON_STRING</script>
//   JSON 안에는 manifest UUID 가 src/href 자리에 박혀있어 시각만 빌드 시점에
//   blob URL 로 치환된다. 이 추출본은 정적 HTML 로 저장해 디자인 토큰·레이아웃·
//   클래스 네임을 읽는 용도. UUID 들은 그대로 두어도 무방하다 (asset 가 binary
//   라 변환 가치 낮음).

import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node extract-prototype.mjs <in.html> <out.html>");
  process.exit(1);
}

const src = readFileSync(inPath, "utf8");

// <script type="__bundler/template">...</script> 를 가장 큰 청크로 잡는다.
const match = src.match(
  /<script type="__bundler\/template">([\s\S]*?)<\/script>/,
);
if (!match) {
  console.error("template script tag not found");
  process.exit(2);
}

let template;
try {
  template = JSON.parse(match[1]);
} catch (e) {
  console.error("template JSON parse failed:", e.message);
  process.exit(3);
}

writeFileSync(outPath, template, "utf8");
console.log(`wrote ${template.length} bytes to ${outPath}`);
