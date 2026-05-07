import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";
import AttentionWidget from "@/components/professor/dashboardHome/AttentionWidget";

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

const empty = {
  pendingQa: [],
  laggingLearners: [],
  frequentPauseSlides: [],
};

describe("AttentionWidget", () => {
  it("renders all three empty fallbacks when no data", () => {
    render(wrap(<AttentionWidget data={empty} />));
    expect(screen.getByText("응답 대기 중인 질문이 없습니다.")).toBeTruthy();
    expect(screen.getByText("시청 부진 학습자가 없습니다.")).toBeTruthy();
    expect(
      screen.getByText("재생 구간 데이터가 도착하면 표시됩니다."),
    ).toBeTruthy();
  });

  it("renders pending Q&A list with link to inbox", () => {
    render(
      wrap(
        <AttentionWidget
          data={{
            pendingQa: [
              {
                id: "q1",
                lectureId: "L1",
                question: "GDP가 뭐예요?",
                inScope: true,
                createdAt: new Date().toISOString(),
              },
            ],
            laggingLearners: [],
            frequentPauseSlides: [],
          }}
        />,
      ),
    );
    expect(screen.getByText("GDP가 뭐예요?")).toBeTruthy();
    // 인박스 점프 링크
    expect(screen.getByText(/Q&A 인박스 열기/)).toBeTruthy();
  });

  it("invokes notify handler for lagging learner", () => {
    const onNotify = vi.fn();
    render(
      wrap(
        <AttentionWidget
          data={{
            pendingQa: [],
            laggingLearners: [
              { userId: "u1", name: "학생1", daysSinceLastActivity: 4 },
            ],
            frequentPauseSlides: [],
          }}
          onNotifyLagging={onNotify}
        />,
      ),
    );
    fireEvent.click(screen.getByText("알림 발송"));
    expect(onNotify).toHaveBeenCalledWith("u1");
  });
});
