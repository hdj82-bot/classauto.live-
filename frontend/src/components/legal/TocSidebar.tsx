"use client";

import { useEffect, useMemo, useState } from "react";
import type { TocItem } from "./types";
import { useLegalI18n } from "./useLegalI18n";

interface Props {
  items: TocItem[];
  /** Last item is usually the change-log anchor — receives a thin divider. */
  trailingItem?: TocItem;
}

/**
 * 우측 sticky TOC.
 *
 * 동작:
 *   - `IntersectionObserver` 로 화면에 들어온 첫 섹션을 active 로 표시. 여러
 *     섹션이 동시에 보일 때는 가장 위에 있는 섹션을 active 로 선택.
 *   - 클릭 시 `<a href="#anchor">` 의 기본 점프 동작을 유지하면서, JS 가 활성화된
 *     환경에서는 `event.preventDefault()` 후 부드러운 `scrollIntoView` 로
 *     이동. JS 비활성·SSR 에서도 anchor 점프가 동작함을 보장.
 *   - 모바일 (lg 미만) 에선 sticky sidebar 가 의미가 없어 `<nav>` 가 본문 위에
 *     pill-button 스택으로 평평하게 노출됨.
 *
 * 접근성: `<nav aria-label="legal-toc">` + 리스트. 활성 항목에
 * `aria-current="location"` 를 부여 → 스크린 리더가 어디를 보고 있는지 인지.
 */
export default function TocSidebar({ items, trailingItem }: Props) {
  const { t } = useLegalI18n();
  // useMemo 로 안정 reference 를 만들어 effect deps 가 매 렌더 새로 만들어지지
  // 않게 한다. items / trailingItem 이 props 그대로일 때 동일 배열 재사용.
  const allItems = useMemo(
    () => (trailingItem ? [...items, trailingItem] : items),
    [items, trailingItem],
  );
  const [activeId, setActiveId] = useState<string | null>(
    items[0]?.id ?? null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;
    const targets = allItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // 화면 안에 들어온 entries 중 가장 위 (top 이 작은) 것을 active 로
        // 채택. 모두 화면 밖이면 active 유지.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -65% 0px", threshold: [0, 0.4] },
    );
    for (const el of targets) obs.observe(el);
    return () => obs.disconnect();
  }, [allItems]);

  const handleAnchorClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    if (typeof window === "undefined") return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    // hash update — 사용자가 URL 을 공유했을 때 같은 위치로 진입 가능.
    if ("history" in window && window.history.replaceState) {
      window.history.replaceState(null, "", `#${id}`);
    }
    setActiveId(id);
  };

  return (
    <nav
      data-testid="legal-toc"
      aria-label={t("common.tocTitle")}
      className="lg:sticky lg:top-24"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 mb-3">
        {t("common.tocTitle")}
      </p>
      <ol className="space-y-1 text-sm">
        {items.map((item) => (
          <TocLink
            key={item.id}
            item={item}
            active={activeId === item.id}
            onClick={handleAnchorClick}
          />
        ))}
        {trailingItem && (
          <li className="pt-2 mt-2 border-t border-white/5">
            <TocLink
              item={trailingItem}
              active={activeId === trailingItem.id}
              onClick={handleAnchorClick}
              variant="trailing"
              standalone
            />
          </li>
        )}
      </ol>
    </nav>
  );
}

function TocLink({
  item,
  active,
  onClick,
  variant = "default",
  standalone = false,
}: {
  item: TocItem;
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
  variant?: "default" | "trailing";
  standalone?: boolean;
}) {
  const baseCls =
    "block rounded-lg px-3 py-1.5 leading-snug transition motion-reduce:transition-none";
  const stateCls = active
    ? "bg-amber-400/10 text-amber-200 ring-1 ring-amber-300/30"
    : "text-white/55 hover:text-white/85 hover:bg-white/5";

  return standalone ? (
    <a
      href={`#${item.id}`}
      data-testid={`legal-toc-link-${item.id}`}
      data-toc-target={item.id}
      data-active={active}
      data-variant={variant}
      aria-current={active ? "location" : undefined}
      onClick={(e) => onClick(e, item.id)}
      className={`${baseCls} ${stateCls}`}
    >
      {item.label}
    </a>
  ) : (
    <li>
      <a
        href={`#${item.id}`}
        data-testid={`legal-toc-link-${item.id}`}
        data-toc-target={item.id}
        data-active={active}
        data-variant={variant}
        aria-current={active ? "location" : undefined}
        onClick={(e) => onClick(e, item.id)}
        className={`${baseCls} ${stateCls}`}
      >
        {item.label}
      </a>
    </li>
  );
}
