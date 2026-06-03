"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { categoryLabel } from "./lookOptions";
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
  /**
   * 구조화 옵션으로 룩을 생성한다. count 미지정 시 기본 배치(LOOK_BATCH_DEFAULT 장),
   * 상세 모달의 "추가 요청" 재생성은 count=1 로 1장만 만든다. 이번 호출로 새로 생긴
   * 룩의 id 목록을 돌려줘 호출부가 그 룩(상세 모달)로 곧장 전환할 수 있게 한다.
   */
  generate: (input: LookGenerateInput, count?: number) => Promise<string[]>;
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
  // look_id → 생성에 쓴 구조화 입력. 한국어 카테고리 라벨(categoryLabel)을 룩마다
  // 정확히 붙이기 위한 세션 메모리. localStorage 미사용(CLAUDE.md) — 새로고침 시
  // 비워지고, 그때는 라벨 없이(영어 프롬프트 비노출) 표시된다.
  const [lookInputs, setLookInputs] = useState<Record<string, LookGenerateInput>>({});

  // 현재 룩 목록의 스냅샷(ref) — generate 직후 "새로 추가된 look_id" 를 stale
  // 클로저 없이 가려내기 위함. setLooks 가 일어나는 모든 경로보다 항상 한 발 뒤의
  // 커밋 값을 들고 있어, 새 배치가 들어오기 직전 상태와 비교할 수 있다.
  const looksRef = useRef<Look[]>([]);

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

  // looksRef 를 항상 최신 커밋 값으로 동기화(generate 의 diff 기준).
  useEffect(() => {
    looksRef.current = looks;
  }, [looks]);

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
    async (input: LookGenerateInput, count: number = LOOK_BATCH_DEFAULT) => {
      // 구조화 옵션으로 count 장을 생성한다(기본 LOOK_BATCH_DEFAULT, 모달 재생성=1).
      const beforeIds = new Set(looksRef.current.map((l) => l.look_id));
      await generateLooks(input, count);
      setLastInput(input); // LookDetailModal 재생성용 base.
      const list = await listLooks();
      // 이번 호출로 새로 생긴 룩에만 이 입력을 기록(한국어 카테고리 라벨용).
      // 이전 배치의 룩은 각자 자신의 입력을 이미 들고 있으므로 건드리지 않는다.
      const newIds = list.filter((l) => !beforeIds.has(l.look_id)).map((l) => l.look_id);
      if (newIds.length > 0) {
        setLookInputs((prev) => {
          const next = { ...prev };
          for (const id of newIds) next[id] = input;
          return next;
        });
      }
      setLooks(list);
      setDeferred(isDeferredMode());
      startLooksPolling();
      return newIds; // 호출부가 새 룩(상세 모달)로 곧장 전환할 수 있게.
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
    // 낙관적 저장 — 실패하면 saved 플래그를 되돌려 ⋮ 메뉴의 '저장'이 다시 떠
    // 재시도할 수 있게 한다(예전엔 saved=true 로 굳어 메뉴가 사라졌다).
    setLooks((prev) =>
      prev.map((l) => (l.look_id === lookId ? { ...l, saved: true } : l)),
    );
    try {
      await saveLook(lookId);
    } catch (err) {
      // 502/타임아웃 등으로 클라이언트가 오류를 받아도 서버엔 이미 커밋됐을 수 있다
      // (Railway 게이트웨이 오류·콜드스타트). 서버 상태를 재조회해 실제로 저장됐으면
      // 성공으로 처리한다 — "저장됐는데 실패 토스트가 뜨는" 거짓 실패를 막는다
      // (2026-06-03 사용자 보고: 누르면 실패했지만 새로고침하면 '저장됨'이었음).
      try {
        const list = await listLooks();
        setLooks(list);
        setDeferred(isDeferredMode());
        if (list.find((l) => l.look_id === lookId)?.saved) return; // 실제로 저장됨
      } catch {
        // 재조회마저 실패 — 아래에서 낙관 갱신을 롤백하고 원 오류를 전파한다.
      }
      setLooks((prev) =>
        prev.map((l) => (l.look_id === lookId ? { ...l, saved: false } : l)),
      );
      throw err;
    }
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

  // 표시용으로 각 룩에 한국어 카테고리 라벨을 부여한다(영어 프롬프트 비노출).
  // 입력을 모르는 룩(새로고침 후·레거시)은 라벨 없이 둔다 — 화면은 라벨이 있을
  // 때만 캡션을 그린다.
  const enrichedLooks = useMemo<Look[]>(
    () =>
      looks.map((l) => {
        const input = lookInputs[l.look_id];
        return input ? { ...l, categoryLabel: categoryLabel(input) } : l;
      }),
    [looks, lookInputs],
  );

  return {
    step,
    group,
    looks: enrichedLooks,
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
