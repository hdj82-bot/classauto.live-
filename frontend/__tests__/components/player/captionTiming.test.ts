import { describe, it, expect } from "vitest";
import {
  detectCaptionScript,
  pickActiveCaption,
  pickActiveCaptionWithCues,
  splitIntoSentences,
} from "@/components/player/captionTiming";
import type { SubtitleCue } from "@/components/player/useSlideshowPlayback";

describe("detectCaptionScript", () => {
  it("detects Korean when Hangul syllables are present", () => {
    expect(detectCaptionScript("오늘은 번역 오류를 분석합니다.")).toBe("ko");
  });

  it("treats Korean-with-Han-emphasis as Korean (Hangul wins)", () => {
    // 한국어 본문 + 한자 강조(飜譯) — 한글이 있으면 한국어로 본다.
    expect(detectCaptionScript("飜譯의 오류를 봅니다")).toBe("ko");
  });

  it("detects Chinese when only Han characters are present", () => {
    expect(detectCaptionScript("今天我们分析翻译错误。")).toBe("zh");
  });

  it("returns null for Latin-only text", () => {
    expect(detectCaptionScript("Today we analyze errors.")).toBeNull();
    expect(detectCaptionScript("")).toBeNull();
  });
});

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

describe("pickActiveCaptionWithCues", () => {
  const zh = "第一句。第二句。第三句。"; // 발화(3문장)
  const ko = "첫째 문장입니다. 둘째 문장입니다. 셋째 문장입니다."; // 번역 자막(3문장)
  // 발성 시각 cue — 균등하지 않은 실제 발성 길이를 흉내(첫 문장이 길다).
  const cues: SubtitleCue[] = [
    { start: 0, end: 7, text: "第一句。" },
    { start: 7, end: 9, text: "第二句。" },
    { start: 9, end: 12, text: "第三句。" },
  ];

  it("falls back to char-weight when there are no cues", () => {
    expect(pickActiveCaptionWithCues(zh, ko, null, 6, 12)).toBe(
      pickActiveCaption(zh, ko, 6, 12),
    );
    expect(pickActiveCaptionWithCues(zh, ko, [], 6, 12)).toBe(
      pickActiveCaption(zh, ko, 6, 12),
    );
  });

  it("syncs same-language captions by real cue times (lead=0)", () => {
    // 자막==발화: cue 텍스트를 시각창대로 보여준다. 균등분배라면 6s 는 둘째지만
    // 실제 발성(첫 문장 0–7s)에 맞춰 6s 에도 여전히 첫째다.
    expect(pickActiveCaptionWithCues(zh, undefined, cues, 6, 12, 0)).toBe(
      "第一句。",
    );
    expect(pickActiveCaptionWithCues(zh, undefined, cues, 8, 12, 0)).toBe(
      "第二句。",
    );
    expect(pickActiveCaptionWithCues(zh, undefined, cues, 10, 12, 0)).toBe(
      "第三句。",
    );
  });

  it("maps cue index to the translated sentence when counts match", () => {
    // 번역 자막: cue(발화 문장) 인덱스를 같은 순번 번역 문장에 매핑.
    expect(pickActiveCaptionWithCues(ko, zh, cues, 6, 12, 0)).toBe(
      "첫째 문장입니다.",
    );
    expect(pickActiveCaptionWithCues(ko, zh, cues, 8, 12, 0)).toBe(
      "둘째 문장입니다.",
    );
    expect(pickActiveCaptionWithCues(ko, zh, cues, 11, 12, 0)).toBe(
      "셋째 문장입니다.",
    );
  });

  it("clamps before-first/after-last to first/last cue", () => {
    expect(pickActiveCaptionWithCues(zh, undefined, cues, -2, 12, 0)).toBe(
      "第一句。",
    );
    expect(pickActiveCaptionWithCues(zh, undefined, cues, 99, 12, 0)).toBe(
      "第三句。",
    );
  });

  it("uses cue timeline (not char-weight) when translated counts differ", () => {
    // 핵심 수정: 번역 문장 수(2) ≠ cue 수(3) 여도 cue 의 실제 발성 타임라인을 쓴다.
    // cue 글자수는 동일(4자)이라 발화 진행률 f 는 시간에 따라 0→1 로 고르게 흐른다.
    // 두 문장(길이 동일)이므로 f<0.5 면 첫째, 이상이면 둘째.
    const koTwo = "한 문장입니다. 두 문장입니다."; // 2문장 ≠ cue 3개
    // 첫 cue(0–7s) 안 초반(2s): f ≈ (2/7)*(1/3) ≈ 0.095 → 첫째
    expect(pickActiveCaptionWithCues(koTwo, zh, cues, 2, 12, 0)).toBe(
      "한 문장입니다.",
    );
    // 세 번째 cue(9–12s) 후반(11s): f ≈ 2/3 + (2/3)*(1/3) ≈ 0.89 → 둘째
    expect(pickActiveCaptionWithCues(koTwo, zh, cues, 11, 12, 0)).toBe(
      "두 문장입니다.",
    );
  });

  it("translated mismatch still reflects real (non-uniform) cue timing", () => {
    // cue 글자수가 비대칭이면 발화 진행률도 비대칭 — 첫 cue 가 긴 발화를 담으면
    // 그 구간 동안 번역도 앞쪽 문장에 더 오래 머문다(균등 elapsed/dur 과 다름).
    const cuesSkew: SubtitleCue[] = [
      { start: 0, end: 2, text: "very long first spoken sentence here." }, // 37자
      { start: 2, end: 12, text: "short." }, // 6자
    ];
    const koTwo = "가나다. 라마바."; // 2문장(동일 길이)
    // 첫 cue 끝(2s): f ≈ 37/43 ≈ 0.86 → 이미 둘째 문장 (시간상 2/12 밖에 안 지났지만
    // 발화 내용의 86%가 첫 cue 에 있으므로 번역도 둘째로 넘어가 있어야 정확).
    expect(pickActiveCaptionWithCues(koTwo, "x. y.", cuesSkew, 2, 12, 0)).toBe(
      "라마바.",
    );
  });
});
