"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/**
 * Professor 셸 컨텍스트 — 페이지가 Topbar 중앙 영역에 자기 컨텐츠(편집 가능한
 * 강의 제목 등)를 끼워 넣기 위한 통로.
 *
 * layout 은 Topbar 를 셸 상단에 고정 렌더하므로, 그 안쪽의 페이지(studio 등)가
 * Topbar 중앙을 직접 그릴 수 없다. 이 컨텍스트로 페이지가 `setCenterSlot(<...>)`
 * 하면 Topbar 가 그 노드를 중앙에 렌더한다(언마운트 시 null 로 되돌린다).
 *
 * `setCenterSlot` 는 useState 세터라 참조가 안정적 — 페이지 useEffect 의 deps 에
 * 넣어도 루프가 생기지 않는다(centerSlot 값이 바뀌어도 세터 함수는 동일).
 */
interface ShellContextValue {
  centerSlot: ReactNode;
  setCenterSlot: Dispatch<SetStateAction<ReactNode>>;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [centerSlot, setCenterSlot] = useState<ReactNode>(null);
  const value = useMemo(
    () => ({ centerSlot, setCenterSlot }),
    [centerSlot],
  );
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

/** 셸 컨텍스트. Provider 밖(셸 외부 페이지)에서는 null. */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext);
}
