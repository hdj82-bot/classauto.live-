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

  it("splits a long single sentence at clause(comma) boundaries", () => {
    // 마침표 하나뿐인 긴 문장(번역 자막에서 흔함)을 쉼표 절 경계에서 더 쪼갠다.
    expect(
      splitIntoSentences(
        "이 두 언어는 겉으로는 비슷해 보일 수 있지만, 실제로는 상당히 중대한 구조적 차이를 가지고 있습니다.",
      ),
    ).toEqual([
      "이 두 언어는 겉으로는 비슷해 보일 수 있지만,",
      "실제로는 상당히 중대한 구조적 차이를 가지고 있습니다.",
    ]);
  });

  it("keeps short comma sentences intact (below split threshold)", () => {
    // 짧은 문장은 쉼표가 있어도 쪼개지 않아 과도한 깜빡임을 막는다.
    expect(splitIntoSentences("짧고, 단순.")).toEqual(["짧고, 단순."]);
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

  it("applies an explicit lead to advance captions earlier", () => {
    // 미리보기 '자막 빠르기' 슬라이더가 넘기는 leadSeconds 인자.
    // 경계(0.333) 직전 시점이라도 큰 리드를 주면 다음 문장으로 넘어간다.
    expect(pickActiveCaption(zh, ko, 3.9, 12, 0)).toBe("第一句。");
    expect(pickActiveCaption(zh, ko, 3.9, 12, 1.5)).toBe("第二句。");
  });
});
