#!/usr/bin/env node
// ko 와 en 의 키셋이 완전히 일치하는지 검증한다. 한쪽에만 존재하는 키가 있으면
// stderr 에 출력하고 exit 1.
//
// 검사 범위: messages/ko.json·en.json 본체 + messages/_patches/*.<loc>.json 패치.
// 런타임(I18nContext.tsx)은 본체에 패치를 deep-merge 해 쓰므로, 검사도 동일하게
// 병합한 뒤 평탄화해야 실제 사용 키셋의 패리티를 본다. (종전엔 본체만 검사해
// 패치에만 추가된 키의 ko/en 누락을 놓쳤다.)
//
// 사용:        node scripts/check-i18n-keys.mjs   (= npm run i18n:check)
// CI 통합:     package.json scripts.i18n:check 에 연결됨.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "messages");
const patchesDir = join(messagesDir, "_patches");

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

/**
 * I18nContext.tsx 의 mergePatch 와 동일한 재귀 deep-merge.
 * 패치는 새 키/브랜치를 추가하거나 스칼라를 덮어쓴다.
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
function mergePatch(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = mergePatch(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    process.stderr.write(`[i18n] ${label} 파싱 실패: ${err.message}\n`);
    process.exit(2);
  }
}

function loadJson(name) {
  return readJson(join(messagesDir, `${name}.json`), `${name}.json`);
}

/**
 * _patches 디렉터리에서 주어진 로케일의 패치 파일(이름순)을 읽어 반환.
 * 디렉터리가 없으면 빈 배열.
 * @param {"ko"|"en"} loc
 * @returns {Record<string, unknown>[]}
 */
function loadPatches(loc) {
  let entries;
  try {
    entries = readdirSync(patchesDir);
  } catch {
    return []; // _patches 미존재 — 본체만 검사
  }
  const suffix = `.${loc}.json`;
  return entries
    .filter((f) => f.endsWith(suffix))
    .sort()
    .map((f) => readJson(join(patchesDir, f), `_patches/${f}`));
}

const locales = ["ko", "en"];
const keysByLocale = Object.fromEntries(
  locales.map((loc) => {
    const merged = loadPatches(loc).reduce(
      (acc, p) => mergePatch(acc, p),
      loadJson(loc),
    );
    return [loc, new Set(flatten(merged))];
  }),
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
