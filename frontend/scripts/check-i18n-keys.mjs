#!/usr/bin/env node
// N5 (round 4): ko.json 과 en.json 의 키셋이 완전히 일치하는지 검증.
// 한쪽에만 존재하는 키가 있으면 stderr 에 출력하고 exit 1.
//
// 사용:
//   node scripts/check-i18n-keys.mjs
//
// CI/Pre-commit 통합:
//   frontend/package.json 의 scripts 블록에 다음을 추가하면 npm run i18n:check 로 실행 가능.
//   "scripts": { "i18n:check": "node scripts/check-i18n-keys.mjs" }
//   ※ 본 PR(Window 2 round 4)은 frontend/package.json 을 수정하지 않으므로,
//     Window 3 PR-B 에서 scripts.i18n:check 통합을 요청한다 (PR 본문 참조).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "messages");

/**
 * 중첩 객체 → 도트 표기 키 목록 평탄화.
 * @param {unknown} obj
 * @param {string} prefix
 * @returns {string[]}
 */
function flatten(obj, prefix = "") {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  const out = [];
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(...flatten(obj[key], path));
  }
  return out;
}

function loadJson(name) {
  const path = join(messagesDir, `${name}.json`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    process.stderr.write(`[i18n] ${name}.json 파싱 실패: ${err.message}\n`);
    process.exit(2);
  }
}

const locales = ["ko", "en"];
const keysByLocale = Object.fromEntries(
  locales.map((loc) => [loc, new Set(flatten(loadJson(loc)))]),
);

const allKeys = new Set();
for (const set of Object.values(keysByLocale)) {
  for (const k of set) allKeys.add(k);
}

const missing = {};
for (const loc of locales) {
  const miss = [...allKeys].filter((k) => !keysByLocale[loc].has(k)).sort();
  if (miss.length > 0) missing[loc] = miss;
}

if (Object.keys(missing).length === 0) {
  process.stdout.write(
    `[i18n] OK — ${locales.join("/")} 키셋 동기화 (${keysByLocale[locales[0]].size}개)\n`,
  );
  process.exit(0);
}

process.stderr.write("[i18n] 키 누락 발견:\n");
for (const [loc, miss] of Object.entries(missing)) {
  process.stderr.write(`  ${loc}.json 에 누락된 키 (${miss.length}개):\n`);
  for (const k of miss) process.stderr.write(`    - ${k}\n`);
}
process.exit(1);
