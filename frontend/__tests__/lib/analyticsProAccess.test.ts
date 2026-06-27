import { describe, it, expect } from "vitest";
import { canSeeAnalyticsPro } from "@/lib/analyticsProAccess";

describe("canSeeAnalyticsPro", () => {
  it("allows the two owner accounts (case/space-insensitive)", () => {
    expect(canSeeAnalyticsPro("classauto101@gmail.com")).toBe(true);
    expect(canSeeAnalyticsPro("HDJ82@kyonggi.ac.kr")).toBe(true);
    expect(canSeeAnalyticsPro("  hdj82@kyonggi.ac.kr ")).toBe(true);
  });

  it("blocks beta testers and empty/nullish emails", () => {
    expect(canSeeAnalyticsPro("tester@univ.ac.kr")).toBe(false);
    expect(canSeeAnalyticsPro("")).toBe(false);
    expect(canSeeAnalyticsPro(null)).toBe(false);
    expect(canSeeAnalyticsPro(undefined)).toBe(false);
  });
});
