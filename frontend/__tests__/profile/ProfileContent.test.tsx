import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProfileContent from "@/components/student/profile/ProfileContent";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
import type { ProfileSnapshot } from "@/components/student/profile/types";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "alice@kyonggi.ac.kr",
      name: "앨리스",
      role: "student",
      school: "경기대학교",
      department: "중어중문학과",
      studentNumber: "201912345",
    },
    isLoading: false,
    login: () => {},
    logout: async () => {},
  }),
}));

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );

const SAMPLE_SNAPSHOT: ProfileSnapshot = {
  user: {
    id: "u1",
    email: "alice@kyonggi.ac.kr",
    name: "앨리스",
    school: "경기대학교",
    department: "중어중문학과",
    studentNumber: "201912345",
  },
  streak: {
    currentDays: 12,
    longestDays: 25,
    thisWeekDays: 5,
    days: Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      watchedMinutes: i % 3 === 0 ? 0 : (i + 1) * 3,
    })),
  },
  stats: {
    watchedMinutes: 120,
    videosCompleted: 5,
    averageAccuracy: 82,
    questionsSent: 14,
    encouragementsReceived: 3,
  },
  inProgress: [
    { courseId: "c1", title: "현대중국사회", percent: 70, lastWatchedAt: "2026-05-04" },
  ],
  completed: [],
  certificates: [],
  encouragements: [],
  recentQuestions: [],
  mocked: false,
};

beforeEach(() => {
  document.body.classList.remove(
    "a11y-font-large",
    "a11y-font-x-large",
    "a11y-high-contrast",
  );
  window.sessionStorage.clear();
});

describe("ProfileContent", () => {
  it("renders all major sections from a provided snapshot", () => {
    wrap(<ProfileContent initialSnapshot={SAMPLE_SNAPSHOT} />);
    expect(screen.getByTestId("profile-page")).toBeTruthy();
    expect(screen.getByText("앨리스")).toBeTruthy();
    expect(screen.getByTestId("profile-streak")).toBeTruthy();
    expect(screen.getByTestId("profile-stats")).toBeTruthy();
    expect(screen.getByTestId("profile-courses")).toBeTruthy();
    expect(screen.getByTestId("profile-certificates")).toBeTruthy();
    expect(screen.getByTestId("profile-encouragements")).toBeTruthy();
    expect(screen.getByTestId("profile-recent-questions")).toBeTruthy();
    expect(screen.getByTestId("profile-privacy-notice")).toBeTruthy();
    expect(screen.getByTestId("a11y-open-button")).toBeTruthy();
  });

  it("forces dark mode (#0A0A0A bg-black) at the page root", () => {
    wrap(<ProfileContent initialSnapshot={SAMPLE_SNAPSHOT} />);
    const page = screen.getByTestId("profile-page");
    // Wrapped by DarkShell which applies bg-[#0A0A0A] on the parent div
    const shell = page.parentElement!;
    expect(shell.className).toMatch(/bg-\[#0A0A0A\]/);
  });

  it("flags mocked snapshot with a 'sample data' badge", () => {
    wrap(
      <ProfileContent
        initialSnapshot={{ ...SAMPLE_SNAPSHOT, mocked: true }}
      />,
    );
    expect(screen.getByTestId("profile-mock-badge")).toBeTruthy();
    expect(screen.getByTestId("profile-page").getAttribute("data-mocked")).toBe(
      "true",
    );
  });

  it("does not render any external-share / advertising / marketing UI elements", async () => {
    wrap(<ProfileContent initialSnapshot={SAMPLE_SNAPSHOT} />);
    await waitFor(() =>
      expect(screen.getByTestId("profile-page")).toBeTruthy(),
    );

    // 정책 회귀 lint — 본 페이지의 a/button 라벨에 광고/외부 SNS 공유 류
    // 키워드가 등장하면 학생 데이터 보호 정책 위반.
    const labels: string[] = [];
    document.querySelectorAll("a, button").forEach((el) => {
      const text = (el.textContent ?? "").toLowerCase();
      const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
      labels.push(text, aria);
    });
    for (const forbidden of [
      "광고",
      "advertis",
      "share to facebook",
      "share to x",
      "share to twitter",
      "share to kakao",
      "third-party",
      "마케팅 공유",
    ]) {
      const hit = labels.find((l) => l.includes(forbidden));
      expect(hit, `forbidden action label found: ${forbidden}`).toBeUndefined();
    }
  });

  it("uses sessionStorage only — no localStorage writes after mount", () => {
    const writes: Array<[string, string]> = [];
    const orig = window.localStorage.setItem;
    window.localStorage.setItem = (k: string, v: string) => {
      writes.push([k, v]);
      orig.call(window.localStorage, k, v);
    };
    try {
      wrap(<ProfileContent initialSnapshot={SAMPLE_SNAPSHOT} />);
    } finally {
      window.localStorage.setItem = orig;
    }
    expect(writes).toEqual([]);
  });
});
