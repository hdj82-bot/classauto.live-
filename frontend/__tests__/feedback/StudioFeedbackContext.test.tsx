import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import { LectureProvider, useRegisterLecture } from "@/contexts/LectureContext";
import ActionBar from "@/components/professor/studio/v2/ActionBar";

/**
 * 스튜디오에서 낸 제보에 강의가 붙는지 — 교수님이 지정한 검증 축.
 *
 * 진입점(ActionBar)과 강의를 아는 쪽(스튜디오 페이지)이 **형제**라 등록 방식이
 * 실제로 값을 나르는지는 이 조합에서만 확인된다. 컴포넌트를 따로 보면 둘 다
 * 통과하는데 조합하면 빈 값이 가는 실수를 막는다.
 */

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/professor/studio/lec-1",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useOptionalAuth: () => ({ user: { role: "professor" } }),
}));

vi.mock("@/lib/api", () => ({ feedbackApi: { submit: mocks.submit } }));

/** 스튜디오 마법사가 하는 일(라우트 param 으로 즉시 등록)을 그대로 흉내낸다. */
function StudioLike({ title }: { title?: string }) {
  useRegisterLecture("lec-1", title);
  return (
    <ActionBar
      current={1}
      total={3}
      acceptedCount={1}
      canPrev={false}
      onPrev={() => {}}
      onGenerate={() => {}}
    />
  );
}

const renderStudio = (title?: string) =>
  render(
    <I18nProvider>
      <LectureProvider>
        <StudioLike title={title} />
      </LectureProvider>
    </I18nProvider>,
  );

async function submit(message: string) {
  fireEvent.click(screen.getByTestId("feedback-launcher"));
  const textarea = await screen.findByRole("textbox");
  fireEvent.change(textarea, { target: { value: message } });
  fireEvent.submit(textarea.closest("form")!);
}

describe("스튜디오 제보 → 강의 맥락", () => {
  beforeEach(() => {
    mocks.submit.mockReset();
    mocks.submit.mockResolvedValue({ data: {} });
  });

  it("ActionBar 에서 낸 제보에 lecture_id 와 page 가 함께 간다", async () => {
    renderStudio("3주차 — 把자문");
    await submit("슬라이드 5에서 렌더가 멈춥니다");

    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith({
        category: "idea",
        message: "슬라이드 5에서 렌더가 멈춥니다",
        page: "/professor/studio/lec-1",
        lecture_id: "lec-1",
      }),
    );
  });

  it("어느 강의로 전달되는지 제보자에게 보여준다", async () => {
    renderStudio("3주차 — 把자문");
    fireEvent.click(screen.getByTestId("feedback-launcher"));

    // 안 보여주면 제보자가 "무슨 강의였는지"를 본문에 또 쓴다.
    expect(await screen.findByTestId("feedback-dialog-lecture")).toBeTruthy();
    expect(screen.getByText(/3주차 — 把자문/)).toBeTruthy();
  });

  it("강의 제목이 아직 안 왔어도 lecture_id 는 붙는다", async () => {
    // 스튜디오는 라우트 param 으로 id 를 먼저 알고 제목은 나중에 채워진다.
    renderStudio(undefined);
    await submit("로딩 중에 낸 제보");

    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0].lecture_id).toBe("lec-1");
  });
});
