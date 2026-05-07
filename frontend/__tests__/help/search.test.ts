import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  searchHelp,
} from "@/components/help/search";
import type {
  HelpCategoryId,
  HelpFaqItem,
} from "@/components/help/types";

const fixture: Record<HelpCategoryId, HelpFaqItem[]> = {
  "getting-started": [
    { q: "ClassAuto 계정은 어떻게 만들 수 있나요?", a: "베타 기간엔 학교 이메일 인증 후 가입 가능합니다." },
    { q: "첫 로그인 후 무엇부터 해야 하나요?", a: "환영 모달의 5단계 가이드를 따라가세요." },
  ],
  "video-creation": [
    { q: "어떤 형식의 PPT 를 업로드할 수 있나요?", a: ".pptx 만 지원합니다. 슬라이드 노트가 풍부하면 좋습니다." },
  ],
  students: [
    { q: "학생들에게 강의를 어떻게 공유하나요?", a: "URL · QR · 단축 코드 중 선택할 수 있습니다." },
  ],
  billing: [
    { q: "환불은 가능한가요?", a: "결제 후 7일 이내 사용량이 일정 기준 미만이면 전액 환불 가능합니다." },
  ],
  security: [
    { q: "학생 데이터는 어떻게 보호되나요?", a: "광고 미사용, 졸업 후 자동 삭제, 학교 단위 격리 저장." },
  ],
  troubleshooting: [
    { q: "PPT 업로드가 멈춰있어요.", a: "파일 확장자가 .pptx 인지 먼저 확인하세요." },
  ],
};

const categoryLabels: Record<HelpCategoryId, string> = {
  "getting-started": "시작하기",
  "video-creation": "영상 제작",
  students: "학생 관리",
  billing: "결제·구독",
  security: "보안·데이터",
  troubleshooting: "문제 해결",
};

describe("searchHelp", () => {
  const index = buildSearchIndex(fixture, categoryLabels);

  it("returns empty array for empty / whitespace query", () => {
    expect(searchHelp(index, "")).toEqual([]);
    expect(searchHelp(index, "   ")).toEqual([]);
  });

  it("matches a token in question text and labels matchedField=question", () => {
    const hits = searchHelp(index, "PPT");
    // PPT 키워드는 video-creation Q 와 troubleshooting Q 두 곳에 등장
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.matchedField === "question")).toBe(true);
  });

  it("falls back to answer match when question has no token", () => {
    const hits = searchHelp(index, "전액");
    // 환불 답변 본문의 '전액' 만 매칭
    expect(hits.length).toBe(1);
    expect(hits[0].matchedField).toBe("answer");
    expect(hits[0].categoryId).toBe("billing");
  });

  it("matches by category label as a soft fallback", () => {
    const hits = searchHelp(index, "결제");
    // category label 만 일치 — 카테고리 라벨에 '결제' 포함
    expect(hits.some((h) => h.categoryId === "billing")).toBe(true);
  });

  it("ranks question matches above answer matches", () => {
    const hits = searchHelp(index, "환불");
    // billing.q 가 질문 매칭 — 가장 높은 순위
    expect(hits[0].categoryId).toBe("billing");
    expect(hits[0].matchedField).toBe("question");
  });

  it("returns empty when query has no matches", () => {
    expect(searchHelp(index, "양자컴퓨팅")).toEqual([]);
  });
});
