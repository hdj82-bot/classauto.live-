"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateLooks,
  getPhotoAvatar,
  isDeferredMode,
  listLooks,
  selectLook,
  uploadPhotoAvatar,
} from "./photoAvatarApi";
import type {
  Look,
  OnboardingStep,
  PhotoAvatarGroup,
} from "./photoAvatarTypes";

/**
 * 본인 아바타 온보딩의 서버 상태 + 단계 흐름을 관리하는 훅.
 *
 * - 진입 시 서버 상태(그룹·룩)를 읽어 **현재 단계를 복원**한다(새로고침해도
 *   localStorage 없이 서버 기준으로 이어짐).
 * - 그룹이 ``training`` 이면 4초 주기로 폴링하다 ``ready`` 시 자동으로 룩 생성
 *   단계로 넘긴다.
 * - 룩에 ``generating`` 이 하나라도 있으면 3초 주기로 폴링한다.
 *
 * 액션(upload/generate/select)은 hard 에러를 throw 하므로 호출자가 토스트로
 * 표면화한다. 폴링은 조용히 자기 보정한다.
 */

const GROUP_POLL_MS = 4000;
const LOOKS_POLL_MS = 3000;
// 학습이 이 횟수(≈3분)를 넘겨도 training 이면 "지연" 으로 보고 사용자에게 안내한다.
// HeyGen 학습은 보통 1~2분이면 끝나므로, 그 이상이면 백엔드/HeyGen 지연을 의심한다.
// 폴링은 계속하되(여전히 끝날 수 있으므로) 무한 스피너 대신 안내·재시도를 노출한다.
const GROUP_STALL_AFTER = 45;

/** 서버 상태로부터 진입 단계를 도출한다. */
function deriveStep(group: PhotoAvatarGroup, looks: Look[]): OnboardingStep {
  if (group.status === "training") return "training";
  if (group.status !== "ready") return "upload"; // none / failed
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
  /** 학습이 예상(≈3분)보다 오래 걸리는지 — 무한 대기 대신 안내·재시도 노출용. */
  trainingStalled: boolean;
  /** 룩 생성/조회가 진행 중인지(폴링 중). */
  looksPending: boolean;
  goTo: (step: OnboardingStep) => void;
  uploadPhoto: (file: File) => Promise<void>;
  generate: (prompt: string, count: number) => Promise<void>;
  select: (lookId: string) => Promise<void>;
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
  const [trainingStalled, setTrainingStalled] = useState(false);

  // training 단계에서 ready 로 전이될 때 자동 전진은 사용자가 그 화면에 있을
  // 때만 — 뒤로 돌아가 다른 단계를 보고 있으면 강제 이동하지 않는다.
  const stepRef = useRef(step);
  stepRef.current = step;

  const groupTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const looksTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearGroupTimer = useCallback(() => {
    if (groupTimer.current) {
      clearInterval(groupTimer.current);
      groupTimer.current = null;
    }
  }, []);
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

  const startGroupPolling = useCallback(() => {
    clearGroupTimer();
    // 새 학습이 시작될 때마다 지연 카운터/플래그를 초기화한다.
    let attempts = 0;
    setTrainingStalled(false);
    groupTimer.current = setInterval(async () => {
      attempts += 1;
      const g = await getPhotoAvatar();
      setGroup(g);
      setDeferred(isDeferredMode());
      if (g.status === "ready") {
        clearGroupTimer();
        setTrainingStalled(false);
        // 학습 화면에 머물러 있었다면 룩 생성 단계로 자동 전진.
        if (stepRef.current === "training") setStep("generate");
      } else if (g.status === "failed" || g.status === "none") {
        clearGroupTimer();
      } else if (attempts >= GROUP_STALL_AFTER) {
        // 여전히 training — 폴링은 계속하되 안내를 띄운다(무한 스피너 방지).
        setTrainingStalled(true);
      }
    }, GROUP_POLL_MS);
  }, [clearGroupTimer]);

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
        if (g.status === "training") startGroupPolling();
        if (list.some((l) => l.status === "generating")) startLooksPolling();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startGroupPolling, startLooksPolling]);

  useEffect(
    () => () => {
      clearGroupTimer();
      clearLooksTimer();
    },
    [clearGroupTimer, clearLooksTimer],
  );

  const uploadPhoto = useCallback(
    async (file: File) => {
      const g = await uploadPhotoAvatar(file);
      setGroup(g);
      setDeferred(isDeferredMode());
      setStep("training");
      if (g.status === "training") startGroupPolling();
      else if (g.status === "ready") setStep("generate");
    },
    [startGroupPolling],
  );

  const generate = useCallback(
    async (prompt: string, count: number) => {
      await generateLooks(prompt, count);
      const list = await listLooks();
      setLooks(list);
      setDeferred(isDeferredMode());
      startLooksPolling();
    },
    [startLooksPolling],
  );

  const select = useCallback(async (lookId: string) => {
    setSelectedLookId(lookId); // 낙관적 — 갤러리 선택 즉시 반영
    await selectLook(lookId);
    setDeferred(isDeferredMode());
  }, []);

  const goTo = useCallback((next: OnboardingStep) => setStep(next), []);

  const looksPending = looks.some((l) => l.status === "generating");

  return {
    step,
    group,
    looks,
    selectedLookId,
    initializing,
    deferred,
    trainingStalled,
    looksPending,
    goTo,
    uploadPhoto,
    generate,
    select,
  };
}
