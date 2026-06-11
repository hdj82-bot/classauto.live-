import { describe, it, expect } from "vitest";
import {
  pickActiveCaption,
  splitIntoSentences,
} from "@/components/player/captionTiming";

describe("splitIntoSentences", () => {
  it("splits Korean sentences on terminal punctuation", () => {
    expect(splitIntoSentences("첫째 문장이다. 둘째 문장이다.")).toEqual([
      "첫째 문장이다.",
      "둘째 문장이다.",
    ]);
  });

  it("splits CJK sentences without trailing spaces", () => {
    expect(splitIntoSentences("第一句。第二句。第三句。")).toEqual([
      "第一句。",
      "第二句。",
      "第三句。",
    ]);
  });

  it("returns the whole text when there is no terminator", () => {
    expect(splitIntoSentences("종결부호 없는 한 문장")).toEqual([
      "종결부호 없는 한 문장",
    ]);
  });
});

describe("pickActiveCaption", () => {
  const zh = "第一句。第二句。第三句。"; // 3문장
  const ko = "첫째 문장입니다. 둘째 문장입니다. 셋째 문장입니다."; // 3문장(균등 길이)

  it("shows the single block when there is only one sentence", () => {
    expect(pickActiveCaption("한 문장만 있다", undefined, 5, 10)).toBe(
      "한 문장만 있다",
    );
  });

  it("advances sentence-by-sentence across the real audio duration", () => {
    // duration=12s, 균등 가중 ⇒ 0–4s 첫째, 4–8s 둘째, 8–12s 셋째.
    expect(pickActiveCaption(zh, ko, 1, 12)).toBe("第一句。");
    expect(pickActiveCaption(zh, ko, 6, 12)).toBe("第二句。");
    expect(pickActiveCaption(zh, ko, 11, 12)).toBe("第三句。");
  });

  it("clamps the very end of the slide to the last sentence", () => {
    expect(pickActiveCaption(zh, ko, 12, 12)).toBe("第三句。");
    expect(pickActiveCaption(zh, ko, 99, 12)).toBe("第三句。");
  });

  it("clamps negative/zero elapsed to the first sentence", () => {
    expect(pickActiveCaption(zh, ko, 0, 12)).toBe("第一句。");
    expect(pickActiveCaption(zh, ko, -3, 12)).toBe("第一句。");
  });

  it("weights display time by source sentence length when counts match", () => {
    // 발화 원문 첫 문장이 매우 길면(=음성이 오래 걸림) 첫 자막이 더 오래 머문다.
    const longFirst =
      "이것은 아주 아주 아주 아주 아주 아주 길고 긴 첫 번째 문장입니다. 짧다. 짧다.";
    // 중간 시점(6/12=0.5)에 첫 문장 가중이 0.5를 넘으면 여전히 첫째 자막.
    expect(pickActiveCaption(zh, longFirst, 6, 12)).toBe("第一句。");
  });

  it("falls back to subtitle-length weighting when sentence counts differ", () => {
    const koTwo = "한 문장. 두 문장."; // 2문장 ≠ 자막 3문장 ⇒ 자막 길이로 가중
    // 균등 길이 자막 3문장, 0.5 시점 ⇒ 둘째.
    expect(pickActiveCaption(zh, koTwo, 6, 12)).toBe("第二句。");
  });
});
