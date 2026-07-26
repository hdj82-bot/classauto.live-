"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 지금 화면이 어떤 강의를 보고 있는지 — 피드백에 맥락을 붙이기 위한 최소 컨텍스트.
 *
 * 피드백은 `page`(라우트)만 갖고 있었는데 `/lecture/[slug]` 하나에 모든 강의가 모여
 * 운영자가 **어느 강의에서 난 문제인지 알 수 없었다.** 슬러그를 역추적하려면 강의
 * 목록을 뒤져야 하고, 그 사이 제목이 바뀌면 못 찾는다.
 *
 * **없어도 되는 컨텍스트다.** provider 밖에서 부르면 `null` 이고, 피드백은
 * `lecture_id` 없이 그대로 제출된다 — 맥락을 못 붙였다고 제보 자체를 막으면
 * 베타에서 가장 필요한 신호를 잃는다.
 *
 * 값을 provider 의 prop 이 아니라 **등록**으로 받는 이유: 강의를 아는 쪽은 데이터를
 * 가져오는 플레이어이고, 피드백 버튼은 그 형제다. prop 으로 나르려면 페이지가
 * 플레이어 내부 상태를 다시 끌어올려야 한다.
 */
export interface LectureContextValue {
  lectureId: string;
  lectureTitle?: string;
}

interface LectureRegistry {
  current: LectureContextValue | null;
  register: (value: LectureContextValue | null) => void;
}

const LectureContext = createContext<LectureRegistry | null>(null);

export function LectureProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<LectureContextValue | null>(null);
  const register = useCallback(
    (value: LectureContextValue | null) => setCurrent(value),
    [],
  );
  const value = useMemo<LectureRegistry>(
    () => ({ current, register }),
    [current, register],
  );
  return (
    <LectureContext.Provider value={value}>{children}</LectureContext.Provider>
  );
}

/**
 * 강의를 아는 화면이 자기 강의를 등록한다. provider 밖이면 아무 일도 하지 않는다 —
 * 플레이어가 어디에 놓이든 깨지지 않아야 한다.
 */
export function useRegisterLecture(
  lectureId: string | null | undefined,
  lectureTitle?: string,
): void {
  const ctx = useContext(LectureContext);
  const register = ctx?.register;
  useEffect(() => {
    if (!register) return;
    register(lectureId ? { lectureId, lectureTitle } : null);
    // 떠날 때 비운다 — 남겨 두면 다음 화면의 피드백에 엉뚱한 강의가 붙는다.
    return () => register(null);
  }, [register, lectureId, lectureTitle]);
}

/** 현재 강의. provider 밖이거나 아직 로딩 중이면 `null`. */
export function useOptionalLecture(): LectureContextValue | null {
  return useContext(LectureContext)?.current ?? null;
}
