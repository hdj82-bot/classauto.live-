"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteLook,
  generateLooks,
  getPhotoAvatar,
  isDeferredMode,
  listLooks,
  saveLook,
  selectLook,
  uploadPhotoAvatar,
} from "./photoAvatarApi";
import { LOOK_BATCH_DEFAULT } from "./photoAvatarTypes";
import type {
  Look,
  LookGenerateInput,
  OnboardingStep,
  PhotoAvatarGroup,
} from "./photoAvatarTypes";

/**
 * 본인 아바타 온보딩의 서버 상태 + 단계 흐름을 관리하는 훅 (v0.2).
 *
 * - 진입 시 서버 상태(그룹·룩)를 읽어 **현재 단계를 복원**한다(새로고침해도
 *   localStorage 없이 서버 기준으로 이어짐).
 * - provider=gpt 는 train 이 없어 업로드 즉시 그룹이 ``ready`` 다 → 별도 학습
 *   단계/폴링 없이 바로 룩 생성으로 진입한다(docs §0.3 1단계 압축).
 * - 룩에 ``generating`` 이 하나라도 있으면 3초 주기로 폴링한다.
 *
 * 액션(upload/generate/select)은 hard 에러를 throw 하므로 호출자가 토스트로
 * 표면화한다. 폴링은 조용히 자기 보정한다.
 */

const LOOKS_POLL_MS = 3000;

/** 서버 상태로부터 진입 단계를 도출한다(train 단계 없음). */
function deriveStep(group: PhotoAvatarGroup, looks: Look[]): OnboardingStep {
  if (group.status !== "ready") return "upload"; // none / failed / (legacy training)
  if (looks.some((l) => l.status === "ready")) return "select";
  return "generate";
}

export interface PhotoAvatarFlow {
  step: OnboardingStep;
  group: PhotoAvatarGroup;
  looks: Look[];
  selectedLookId: string | null;
  initializing: boolean;
  deferred: boolean;
  /** 룩 생성/조회가 진행 중인지(폴링 중). */
  looksPending: boolean;
  /** 직전 룩 배치 생성에 사용된 입력 — LookDetailModal 의 재생성 base. */
  lastInput: LookGenerateInput | null;
  goTo: (step: OnboardingStep) => void;
  uploadPhoto: (file: File) => Promise<void>;
  /** 구조화 옵션으로 룩 배치(기본 LOOK_BATCH_DEFAULT 장)를 생성한다. */
  generate: (input: LookGenerateInput) => Promise<void>;
  select: (lookId: string) => Promise<void>;
  /** 후보 룩을 라이브러리에 저장(확정). */
  save: (lookId: string) => Promise<void>;
  /** 라이브러리에서 룩 1개를 삭제(누적 cap 회복). */
  remove: (lookId: string) => Promise<void>;
}

export function usePhotoAvatarFlow(): PhotoAvatarFlow {
  const [step, setStep] = useState<OnboardingStep>("upload");
  const [group, setGroup] = useState<PhotoAvatarGroup>({
    group_id: null,
    status: "none",
  });
  const [looks, setLooks] = useState<Look[]>([]);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const [lastInput, setLastInput] = useState<LookGenerateInput | null>(null);

  const looksTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearLooksTimer = useCallback(() => {
    if (looksTimer.current) {
      clearInterval(looksTimer.current);
      looksTimer.current = null;
    }
  }, []);

  const startLooksPolling = useCallback(() => {
    clearLooksTimer();
    looksTimer.current = setInterval(async () => {
      const list = await listLooks();
      setLooks(list);
      setDeferred(isDeferredMode());
      if (!list.some((l) => l.status === "generating")) clearLooksTimer();
    }, LOOKS_POLL_MS);
  }, [clearLooksTimer]);

  // 초기화: 서버 상태로 단계 복원 + 필요한 폴링 시작.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await getPhotoAvatar();
        if (cancelled) return;
        setGroup(g);
        let list: Look[] = [];
        if (g.status === "ready") {
          list = await listLooks();
          if (cancelled) return;
          setLooks(list);
        }
        setStep(deriveStep(g, list));
        setDeferred(isDeferredMode());
        if (list.some((l) => l.status === "generating")) startLooksPolling();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startLooksPolling]);

  useEffect(
    () => () => {
      clearLooksTimer();
    },
    [clearLooksTimer],
  );

  const uploadPhoto = useCallback(async (file: File) => {
    // v0.2 gpt: 업로드 즉시 그룹 ready → 곧장 룩 생성 단계로(train 없음).
    const g = await uploadPhotoAvatar(file);
    setGroup(g);
    setDeferred(isDeferredMode());
    if (g.status === "ready") setStep("generate");
    // ready 가 아니면(레거시/오류) deriveStep 기준 upload 에 머문다.
    else setStep(deriveStep(g, []));
  }, []);

  const generate = useCallback(
    async (input: LookGenerateInput) => {
      // 구조화 옵션으로 한 배치(기본 LOOK_BATCH_DEFAULT 장)를 생성한다.
      await generateLooks(input, LOOK_BATCH_DEFAULT);
      setLastInput(input); // LookDetailModal 재생성용 base.
      const list = await listLooks();
      setLooks(list);
      setDeferred(isDeferredMode());
      startLooksPolling();
    },
    [startLooksPolling],
  );

  const select = useCallback(async (lookId: string) => {
    setSelectedLookId(lookId); // 낙관적 — 갤러리 선택 즉시 반영
    // 기본 룩 지정 = 확정 → 라이브러리 자동 저장(백엔드와 동일). 낙관적 반영.
    setLooks((prev) =>
      prev.map((l) => (l.look_id === lookId ? { ...l, saved: true } : l)),
    );
    await selectLook(lookId);
    setDeferred(isDeferredMode());
  }, []);

  const save = useCallback(async (lookId: string) => {
    // 낙관적 저장 — 실패하면 list 폴링/재조회가 보정한다.
    setLooks((prev) =>
      prev.map((l) => (l.look_id === lookId ? { ...l, saved: true } : l)),
    );
    await saveLook(lookId);
    setDeferred(isDeferredMode());
  }, []);

  const remove = useCallback(async (lookId: string) => {
    // 낙관적 제거 — 실패하면 list 폴링이 다시 채운다.
    setLooks((prev) => prev.filter((l) => l.look_id !== lookId));
    setSelectedLookId((prev) => (prev === lookId ? null : prev));
    await deleteLook(lookId);
    setDeferred(isDeferredMode());
  }, []);

  const goTo = useCallback(
    (next: OnboardingStep) => {
      // ① 업로드로 되돌아가면(다른 사진으로 다시 시작) 이전 룩/선택은 무효 —
      // 새 사진은 새 그룹을 학습하므로 기존 룩이 남아 ③④ 에 섞이면 안 된다.
      // (mock 백엔드도 재업로드 시 룩을 비운다 — photoAvatarApi.uploadPhotoAvatar.)
      if (next === "upload") {
        clearLooksTimer();
        setLooks([]);
        setSelectedLookId(null);
      }
      setStep(next);
    },
    [clearLooksTimer],
  );

  const looksPending = looks.some((l) => l.status === "generating");

  return {
    step,
    group,
    looks,
    selectedLookId,
    initializing,
    deferred,
    looksPending,
    lastInput,
    goTo,
    uploadPhoto,
    generate,
    select,
    save,
    remove,
  };
}
