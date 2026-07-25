import { describe, it, expect, beforeEach, vi } from "vitest";
import { redirect } from "next/navigation";
import OwnerInvitesRedirect from "@/app/owner/invites/page";

/**
 * 스펙 14 §A — `/owner/invites` 는 삭제하지 않고 운영자 콘솔로 redirect 하는
 * 스텁만 남긴다(계정주가 북마크해 뒀을 수 있음). 종전 `OwnerInvitesPage.test.tsx`
 * 가 검증하던 화면 로직은 `__tests__/admin/AdminInvitesPage.test.tsx` 로 이관됐다.
 *
 * `/owner/costs` 는 이번 범위가 아니다. 종목별 비용 분해를 `/admin/costs` 로
 * 포팅하는 스펙 §E-2 가 끝나기 전에 redirect 를 걸면 그 화면만 볼 수 있는
 * 데이터가 사라진다. 그때까지 `/owner/costs` 는 기존 대시보드 그대로 두고,
 * 검증도 `OwnerCostsPage.test.tsx` 가 계속 맡는다.
 */
describe("owner → admin redirect stubs", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("/owner/invites 는 /admin/invites 로 보낸다", () => {
    OwnerInvitesRedirect();
    expect(redirect).toHaveBeenCalledWith("/admin/invites");
  });
});
