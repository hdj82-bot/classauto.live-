import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/contexts/I18nContext";

/**
 * Course QR — 학기 초 첫 수업 슬라이드에 띄우는 등록 QR (스펙 15 §1.1).
 *
 * 회귀 가드:
 *   1. QR 이 **강좌 진입 절대 주소**를 인코딩한다 — 상대 경로면 스캔한 휴대폰이 못 연다
 *   2. 다운로드·복사 직후 ✓ 피드백 — 브라우저가 조용히 처리해 "무반응"으로 보인다
 *   3. 문구가 "학기 초 1회 스캔" 용도를 말한다(강의별 QR 과 혼동 방지)
 */

const toDataURL = vi.hoisted(() => vi.fn());

vi.mock("qrcode", () => ({ default: { toDataURL } }));

import CourseQrPanel from "@/components/professor/learners/CourseQrPanel";

const renderPanel = () =>
  render(
    <I18nProvider>
      <CourseQrPanel courseSlug="chinese-grammar-a1b2c3d4" courseTitle="중국어문법의 이해" />
    </I18nProvider>,
  );

describe("CourseQrPanel", () => {
  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue("data:image/png;base64,STUB");
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("강좌 진입 절대 주소를 QR 로 만든다", async () => {
    renderPanel();
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());

    const [url, opts] = toDataURL.mock.calls[0];
    // 상대 경로면 스캔한 휴대폰이 열 수 없다.
    expect(url).toBe(`${window.location.origin}/c/chinese-grammar-a1b2c3d4`);
    // ShareLinks 와 같은 설정 — 슬라이드에 띄워도 뭉개지지 않는 크기.
    expect(opts).toMatchObject({ width: 480, margin: 2, errorCorrectionLevel: "M" });
  });

  it("링크 복사에 ✓ 피드백을 준다", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("course-qr-copy"));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/c/chinese-grammar-a1b2c3d4`,
      ),
    );
    // 조용히 끝나면 교수자는 눌린 줄 모른다.
    await waitFor(() =>
      expect(screen.getByTestId("course-qr-copy").textContent).toContain("✓"),
    );
  });

  it("PNG 내려받기에 ✓ 피드백을 준다", async () => {
    renderPanel();
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("course-qr-download"));
    await waitFor(() =>
      expect(screen.getByTestId("course-qr-download").textContent).toContain("✓"),
    );
  });

  it("학기 초 1회 스캔 용도를 문구로 말한다", async () => {
    renderPanel();
    // 강의별 QR(스튜디오 5단계)과 혼동하면 교수자가 매주 다시 뿌린다.
    expect(await screen.findByText(/학기 초 첫 수업/)).toBeTruthy();
  });

  it("학생 화면을 새 탭에서 미리 볼 수 있다", async () => {
    renderPanel();
    const link = await screen.findByTestId("course-qr-preview");
    expect(link.getAttribute("href")).toBe(
      `${window.location.origin}/c/chinese-grammar-a1b2c3d4`,
    );
  });

  it("QR 생성이 실패해도 링크는 남는다", async () => {
    toDataURL.mockRejectedValue(new Error("boom"));
    renderPanel();
    // 이미지 하나 때문에 화면 전체가 죽으면 수업 중에 손쓸 방법이 없다.
    const input = await screen.findByLabelText(/학생 진입 링크/);
    expect((input as HTMLInputElement).value).toContain("/c/chinese-grammar-a1b2c3d4");
  });
});
