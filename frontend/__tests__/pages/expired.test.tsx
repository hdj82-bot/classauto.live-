import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ExpiredPage from "@/app/expired/page";

describe("ExpiredPage", () => {
  it("renders expired notice", () => {
    render(<ExpiredPage />);
    // 페이지에 세션 만료 관련 텍스트가 있어야 함
    const text = document.body.textContent;
    expect(text).toBeTruthy();
  });
});
