import { describe, it, expect, beforeEach } from "vitest";
import { stashAuthNext, takeAuthNext } from "@/lib/authNext";

/**
 * OAuth 라운드트립을 건너 살아남는 딥링크.
 *
 * 학기 초 첫 수업에서 40명이 강좌 QR 을 스캔한다. 로그인하러 나갔다가 돌아올 때
 * 원래 주소를 잃으면 **등록(join)이 영영 호출되지 않아** 그 학기 명단이 빈다.
 * 게이트를 켜는 순간 그 학생들이 전부 재생 불가가 된다.
 */
describe("authNext", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("보관한 내부 경로를 그대로 돌려준다", () => {
    stashAuthNext("/c/chinese-grammar-a1b2c3d4");
    expect(takeAuthNext()).toBe("/c/chinese-grammar-a1b2c3d4");
  });

  it("한 번 꺼내면 지워진다", () => {
    stashAuthNext("/c/abc");
    takeAuthNext();
    // 남겨 두면 다음 로그인 때 엉뚱한 강좌로 튄다.
    expect(takeAuthNext()).toBeNull();
  });

  it("외부 URL 은 보관하지 않는다", () => {
    stashAuthNext("https://evil.example.com/steal");
    expect(takeAuthNext()).toBeNull();
  });

  it("프로토콜 상대 URL 도 막는다", () => {
    // '//evil.com' 은 브라우저가 외부 주소로 해석한다.
    stashAuthNext("//evil.example.com");
    expect(takeAuthNext()).toBeNull();
  });

  it("빈 값은 기존 보관분을 지운다", () => {
    stashAuthNext("/c/abc");
    stashAuthNext(null);
    expect(takeAuthNext()).toBeNull();
  });

  it("보관한 적 없으면 null", () => {
    expect(takeAuthNext()).toBeNull();
  });
});
