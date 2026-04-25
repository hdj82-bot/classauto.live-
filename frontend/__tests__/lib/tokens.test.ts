import { describe, it, expect, beforeEach } from "vitest";
import { tokens } from "@/lib/tokens";

// High 5 이후: refresh_token 은 HttpOnly 쿠키로 관리되고 JS 에서 접근 불가.
// access_token 은 모듈 스코프 변수(메모리)에만 보관된다.

describe("tokens", () => {
  beforeEach(() => {
    tokens.clear();
    localStorage.clear();
  });

  it("returns null when no access stored", () => {
    expect(tokens.getAccess()).toBeNull();
  });

  it("stores and retrieves access token", () => {
    tokens.set("access-123");
    expect(tokens.getAccess()).toBe("access-123");
  });

  it("clears access token", () => {
    tokens.set("access-123");
    tokens.clear();
    expect(tokens.getAccess()).toBeNull();
  });

  it("overwrites existing access token", () => {
    tokens.set("old-access");
    tokens.set("new-access");
    expect(tokens.getAccess()).toBe("new-access");
  });

  it("does not persist access to localStorage", () => {
    tokens.set("access-xyz");
    expect(localStorage.getItem("ifl_access_token")).toBeNull();
    expect(localStorage.getItem("ifl_refresh_token")).toBeNull();
  });
});
