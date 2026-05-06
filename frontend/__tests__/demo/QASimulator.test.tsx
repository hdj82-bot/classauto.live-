import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";
import QASimulator from "@/components/demo/QASimulator";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";

const renderWithProviders = (ui: ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

describe("QASimulator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the chat header, greeting and suggested questions", () => {
    renderWithProviders(<QASimulator field="social" />);
    expect(screen.getByText("강의 도우미")).toBeTruthy();
    expect(screen.getByText(/무엇이든 물어보세요/)).toBeTruthy();
    expect(
      screen.getByTestId("demo-suggested-suggested.socialQ1"),
    ).toBeTruthy();
  });

  it("answers an on-topic suggested question with source citation", async () => {
    renderWithProviders(<QASimulator field="social" />);
    fireEvent.click(
      screen.getByTestId("demo-suggested-suggested.socialQ1"),
    );

    // mock latency 700ms 진행
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId("demo-answer-ontopic")).toBeTruthy();
    expect(screen.getByText(/슬라이드 7-8/)).toBeTruthy();
    expect(screen.getByText(/2:14-3:02/)).toBeTruthy();
  });

  it("rejects an off-topic free-text question with the RAG-scope message", async () => {
    renderWithProviders(<QASimulator field="social" />);
    const input = screen.getByTestId("demo-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "오늘 점심 뭐 먹지?" } });
    fireEvent.click(screen.getByTestId("demo-send"));

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId("demo-answer-offtopic")).toBeTruthy();
    expect(screen.getByText(/이 질문은 강의 범위 밖이에요/)).toBeTruthy();
  });

  it("hides the input and shows the limit-reached CTA after 3 questions", async () => {
    const onLimit = vi.fn();
    renderWithProviders(
      <QASimulator field="natural" onLimitReached={onLimit} />,
    );

    const input = screen.getByTestId("demo-input") as HTMLTextAreaElement;
    const send = screen.getByTestId("demo-send");

    for (const q of ["광속이 일정한 이유?", "쌍둥이 역설?", "광속 불변?"]) {
      fireEvent.change(input, { target: { value: q } });
      fireEvent.click(send);
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
    }

    // microtask 로 부모에 알림이 흘러가도록 한 번 flush
    await act(async () => {
      await Promise.resolve();
    });

    expect(onLimit).toHaveBeenCalled();
    expect(screen.getByTestId("demo-limit-reached")).toBeTruthy();
    expect(screen.queryByTestId("demo-input")).toBeNull();
  });
});
