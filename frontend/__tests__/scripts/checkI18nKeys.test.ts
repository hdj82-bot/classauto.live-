// N5 (round 4): scripts/check-i18n-keys.mjs 의 동작 회귀 테스트.
// - 정상: 동일 키셋 → exit 0
// - 비정상: 한쪽에 누락 → exit 1 + stderr 메시지
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(FRONTEND_ROOT, "scripts", "check-i18n-keys.mjs");

function runScript(scriptPath: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: e.status ?? -1,
      stdout: typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString("utf8") ?? ""),
      stderr: typeof e.stderr === "string" ? e.stderr : (e.stderr?.toString("utf8") ?? ""),
    };
  }
}

function makeFixtureDir(): { dir: string; cleanup: () => void } {
  // 스크립트는 cwd 기준이 아니라 자기 위치 기준으로 messages/ 를 찾으므로,
  // fixture 디렉토리에 scripts/ 를 만들고 스크립트를 복사 + messages/ 를 동봉.
  const dir = mkdtempSync(join(tmpdir(), "i18n-check-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "messages"), { recursive: true });
  copyFileSync(SCRIPT, join(dir, "scripts", "check-i18n-keys.mjs"));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("scripts/check-i18n-keys.mjs", () => {
  it("동일한 키셋이면 exit 0", () => {
    const { dir, cleanup } = makeFixtureDir();
    try {
      writeFileSync(
        join(dir, "messages", "ko.json"),
        JSON.stringify({ common: { a: "가", b: "나" } }, null, 2),
      );
      writeFileSync(
        join(dir, "messages", "en.json"),
        JSON.stringify({ common: { a: "A", b: "B" } }, null, 2),
      );
      const result = runScript(join(dir, "scripts", "check-i18n-keys.mjs"));
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/OK/);
    } finally {
      cleanup();
    }
  });

  it("한쪽에만 키가 있으면 exit 1 + stderr 에 누락 키 보고", () => {
    const { dir, cleanup } = makeFixtureDir();
    try {
      writeFileSync(
        join(dir, "messages", "ko.json"),
        JSON.stringify({ common: { a: "가", onlyKo: "한국어전용" } }, null, 2),
      );
      writeFileSync(
        join(dir, "messages", "en.json"),
        JSON.stringify({ common: { a: "A", onlyEn: "english only" } }, null, 2),
      );
      const result = runScript(join(dir, "scripts", "check-i18n-keys.mjs"));
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("common.onlyKo");
      expect(result.stderr).toContain("common.onlyEn");
    } finally {
      cleanup();
    }
  });

  it("실제 messages/ko.json 과 en.json 키셋이 일치한다 (회귀 가드)", () => {
    const result = runScript(SCRIPT);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/OK/);
  });
});
