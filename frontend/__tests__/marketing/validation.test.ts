import { describe, it, expect } from "vitest";
import {
  isFilled,
  isEmail,
  looksLikeSchoolEmail,
  isNumericOrEmpty,
  isNumericRequired,
} from "@/components/marketing/validation";

describe("marketing/validation", () => {
  describe("isFilled", () => {
    it("treats whitespace-only as empty", () => {
      expect(isFilled("")).toBe(false);
      expect(isFilled("   ")).toBe(false);
      expect(isFilled("\n\t")).toBe(false);
      expect(isFilled("a")).toBe(true);
    });
  });

  describe("isEmail", () => {
    it("accepts a valid address and rejects malformed ones", () => {
      expect(isEmail("name@school.ac.kr")).toBe(true);
      expect(isEmail("a@b.co")).toBe(true);
      expect(isEmail("not-an-email")).toBe(false);
      expect(isEmail("foo@bar")).toBe(false);
      expect(isEmail("@school.ac.kr")).toBe(false);
      expect(isEmail("a@@b.com")).toBe(false);
    });
  });

  describe("looksLikeSchoolEmail", () => {
    it("matches .ac.kr / .edu / .edu.{cc} domains and only those", () => {
      expect(looksLikeSchoolEmail("hdj82@kyonggi.ac.kr")).toBe(true);
      expect(looksLikeSchoolEmail("name@uni.edu")).toBe(true);
      expect(looksLikeSchoolEmail("name@uni.edu.au")).toBe(true);
      expect(looksLikeSchoolEmail("hdj82@gmail.com")).toBe(false);
      expect(looksLikeSchoolEmail("name@school.org")).toBe(false);
    });
  });

  describe("isNumericOrEmpty", () => {
    it("allows blank but rejects non-digits when populated", () => {
      expect(isNumericOrEmpty("")).toBe(true);
      expect(isNumericOrEmpty("   ")).toBe(true);
      expect(isNumericOrEmpty("60")).toBe(true);
      expect(isNumericOrEmpty("60명")).toBe(false);
      expect(isNumericOrEmpty("abc")).toBe(false);
    });
  });

  describe("isNumericRequired", () => {
    it("requires a non-empty digits-only value", () => {
      expect(isNumericRequired("")).toBe(false);
      expect(isNumericRequired("12")).toBe(true);
      expect(isNumericRequired("12a")).toBe(false);
    });
  });
});
