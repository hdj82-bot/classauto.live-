import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LearnerTable from "@/components/professor/learners/LearnerTable";
import { I18nProvider } from "@/contexts/I18nContext";
import type { LearnerRow } from "@/components/professor/learners/types";

const NOW = Date.UTC(2026, 4, 7, 12, 0, 0);
const today = new Date(NOW).toISOString();
const fourDaysAgo = new Date(NOW - 4 * 24 * 60 * 60 * 1000).toISOString();

const ROWS: LearnerRow[] = [
  {
    userId: "u-alice",
    name: "앨리스",
    studentNumber: "201912345",
    progressPct: 85,
    watchRatio: 80,
    qaCount: 3,
    respondedCount: 3,
    responseRate: 100,
    noResponseCnt: 0,
    watchedSec: 600,
    totalSec: 750,
    attendanceType: "live",
    startedAt: today,
    status: "in_progress",
  },
  {
    userId: "u-bob",
    name: "밥",
    studentNumber: "201967890",
    progressPct: 12,
    watchRatio: 10,
    qaCount: 0,
    respondedCount: 0,
    responseRate: null,
    noResponseCnt: 2,
    watchedSec: 80,
    totalSec: 750,
    attendanceType: "vod",
    startedAt: fourDaysAgo,
    status: "in_progress",
  },
  {
    userId: "u-carol",
    name: "캐롤",
    studentNumber: "201955555",
    progressPct: 100,
    watchRatio: 95,
    qaCount: 5,
    respondedCount: 5,
    responseRate: 100,
    noResponseCnt: 0,
    watchedSec: 750,
    totalSec: 750,
    attendanceType: "live",
    startedAt: today,
    status: "completed",
  },
];

interface HarnessProps {
  initialFilter?: "all" | "at-risk" | "completed" | "in-progress";
  onOpenDetail?: (id: string) => void;
}

function Harness({ initialFilter = "all", onOpenDetail = () => {} }: HarnessProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <I18nProvider>
      <LearnerTable
        rows={ROWS}
        filter={initialFilter}
        sortKey="progressPct"
        sortDir="asc"
        search=""
        selectedIds={selected}
        onToggleSelect={(id) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onToggleSelectAll={(next) =>
          setSelected(next ? new Set(ROWS.map((r) => r.userId)) : new Set())
        }
        onSort={() => {}}
        onOpenDetail={onOpenDetail}
        now={NOW}
      />
    </I18nProvider>
  );
}

describe("LearnerTable", () => {
  it("renders all rows by default", () => {
    render(<Harness />);
    expect(screen.getByTestId("learner-row-u-alice")).toBeTruthy();
    expect(screen.getByTestId("learner-row-u-bob")).toBeTruthy();
    expect(screen.getByTestId("learner-row-u-carol")).toBeTruthy();
  });

  it("tags each row with its computed risk", () => {
    render(<Harness />);
    expect(
      screen.getByTestId("learner-row-u-alice").getAttribute("data-risk"),
    ).toBe("low");
    expect(
      screen.getByTestId("learner-row-u-bob").getAttribute("data-risk"),
    ).toBe("high");
    expect(
      screen.getByTestId("learner-row-u-carol").getAttribute("data-risk"),
    ).toBe("completed");
  });

  it("filters down to at-risk only", () => {
    render(<Harness initialFilter="at-risk" />);
    expect(screen.getByTestId("learner-row-u-bob")).toBeTruthy();
    expect(screen.queryByTestId("learner-row-u-alice")).toBeNull();
    expect(screen.queryByTestId("learner-row-u-carol")).toBeNull();
  });

  it("filters down to completed only", () => {
    render(<Harness initialFilter="completed" />);
    expect(screen.getByTestId("learner-row-u-carol")).toBeTruthy();
    expect(screen.queryByTestId("learner-row-u-alice")).toBeNull();
  });

  it("invokes detail callback when row link clicked", () => {
    const onOpen = vi.fn();
    render(<Harness onOpenDetail={onOpen} />);
    fireEvent.click(screen.getByTestId("learner-row-detail-u-alice"));
    expect(onOpen).toHaveBeenCalledWith("u-alice");
  });

  it("toggles single row selection via checkbox", () => {
    render(<Harness />);
    const cb = screen.getByTestId(
      "learner-row-select-u-alice",
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    // Re-query after re-render
    expect(
      (screen.getByTestId("learner-row-select-u-alice") as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("select-all checkbox selects every visible row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("learner-table-select-all"));
    for (const id of ["u-alice", "u-bob", "u-carol"]) {
      expect(
        (screen.getByTestId(`learner-row-select-${id}`) as HTMLInputElement)
          .checked,
      ).toBe(true);
    }
  });

  it("renders empty state when no rows match", () => {
    render(
      <I18nProvider>
        <LearnerTable
          rows={[]}
          filter="all"
          sortKey="progressPct"
          sortDir="asc"
          search=""
          selectedIds={new Set()}
          onToggleSelect={() => {}}
          onToggleSelectAll={() => {}}
          onSort={() => {}}
          onOpenDetail={() => {}}
          now={NOW}
        />
      </I18nProvider>,
    );
    expect(screen.getByTestId("learner-table-empty")).toBeTruthy();
  });
});
