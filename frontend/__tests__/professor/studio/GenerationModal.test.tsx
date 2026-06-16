import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GenerationModal from "@/components/professor/studio/v2/GenerationModal";

// 회귀(2026-06-16 사용자 보고): 추천 질문(Q&A) 답변이 '대기 중'인데도 "슬라이드 쇼가
// 완성되었어요!" 가 떴다. 완성 판정이 슬라이드만 보고 Q&A 진행을 무시한 탓. 모달이
// Q&A 상태로 한 번 더 게이팅하도록 고쳤다.
describe("GenerationModal — Q&A 완료까지 '완성' 보류", () => {
  const base = {
    open: true,
    lectureTitle: "테스트 강의",
    slideCount: 10,
    processedSlides: 10, // 슬라이드 TTS 완료
  };

  it("Q&A 답변이 대기 중이면 '완성'이 아니라 '추천 질문 답변 만드는 중'을 보인다", () => {
    render(
      <GenerationModal
        {...base}
        done
        qaItems={[{ status: "pending" }, { status: "pending" }, { status: "pending" }]}
      />,
    );
    expect(screen.queryByText(/완성되었어요/)).toBeNull();
    expect(screen.getByText("추천 질문 답변 만드는 중…")).toBeTruthy();
  });

  it("Q&A 한 개라도 렌더 중이면 아직 '완성'이 아니다", () => {
    render(
      <GenerationModal
        {...base}
        done
        qaItems={[{ status: "ready" }, { status: "rendering" }, { status: "ready" }]}
      />,
    );
    expect(screen.queryByText(/완성되었어요/)).toBeNull();
  });

  it("슬라이드 + Q&A 모두 완료면 '모두 완성'을 보인다", () => {
    render(
      <GenerationModal
        {...base}
        done
        qaItems={[{ status: "ready" }, { status: "ready" }, { status: "ready" }]}
      />,
    );
    expect(screen.getByText(/모두 완성되었어요/)).toBeTruthy();
  });

  it("Q&A 가 없으면 슬라이드 완료만으로 완성이다", () => {
    render(<GenerationModal {...base} done qaItems={[]} />);
    expect(screen.getByText(/모두 완성되었어요/)).toBeTruthy();
  });
});
