"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, bootstrapAuth } from "@/lib/api";

/**
 * 본문 슬라이드쇼 재생 엔진 (docs/planning/08-cost-optimization.md).
 *
 * 강의 본문은 단일 MP4 가 아니라 **슬라이드 이미지 + 구간 TTS 음성 + 타임라인**으로
 * 재생된다. 이 훅은 `/api/lectures/{slug}/slideshow` 를 받아 단일 `<audio>` 요소를
 * 슬라이드 순서대로 이어 재생하며, 비디오 요소와 동등한 API(currentTime/duration/
 * isPlaying/seek)를 노출해 PlayerV2 가 컨트롤·진행바·퀴즈·집중도를 그대로 쓰게 한다.
 *
 * 타임라인은 **실제 음성 길이**(audio metadata)로 만든다. 음성이 아직 생성되지
 * 않았거나(실패·생성 중) 길이를 못 읽은 슬라이드는 세그먼트 추정치(end-start)를
 * 무음 구간으로 쓴다. 재생은 rAF 루프 하나로 구동하며, 슬라이드 경계에 도달하면
 * 다음 슬라이드 음성을 이어 재생한다.
 */

/** 자막 정밀 싱크 cue — 발성 시각(해당 슬라이드 음성 자체 타임라인, 초) 기준. */
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** 자막 위치 — 영상 영역 기준 정규화 좌표(0~1, 자막 박스 중심). null = 기본(하단 중앙). */
export interface SubtitlePosition {
  x: number;
  y: number;
}

export interface SlideshowSlide {
  slide_index: number;
  image_url: string | null;
  audio_url: string | null;
  start_seconds: number;
  end_seconds: number;
  text: string;
  subtitle_text: string | null;
  /** 발성 시각 기반 자막 cue. null = 정렬 미수행/실패 → 글자수 폴백. */
  subtitle_cues: SubtitleCue[] | null;
}

interface SlideshowWire {
  lecture_id: string;
  is_expired: boolean;
  /** 본문 렌더 완료 여부. 구버전 백엔드 응답엔 없으므로 optional — 없으면 true 취급. */
  is_ready?: boolean;
  total_seconds: number;
  /** 교수자가 정한 자막 위치. 구버전 응답엔 없으므로 optional. */
  subtitle_position?: SubtitlePosition | null;
  slides: SlideshowSlide[];
}

export interface SlideshowPlayback {
  slides: SlideshowSlide[];
  /** 슬라이드쇼 데이터 fetch + 음성 길이 해석이 끝났는지(로딩 완료). */
  ready: boolean;
  /** 본문 렌더가 실제로 끝났는지(Video done). false 면 "준비 중"을 표시한다. */
  bodyReady: boolean;
  isExpired: boolean;
  /** 교수자가 정한 자막 위치(정규화 좌표). null = 기본(하단 중앙). */
  subtitlePosition: SubtitlePosition | null;
  currentIndex: number;
  currentSlide: SlideshowSlide | null;
  /** 현재 슬라이드가 시작된 뒤 흐른 실측 시간(초). 자막 동기화용. */
  currentSlideElapsed: number;
  /** 현재 슬라이드의 실측 재생 길이(초). 자막 동기화용(추정 end-start 아님). */
  currentSlideDuration: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** 숨겨진 `<audio>` 요소에 연결한다. */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  seekTo: (sec: number) => void;
  seekDelta: (delta: number) => void;
  restart: () => void;
}

const MIN_SLIDE_SEC = 3;
const META_TIMEOUT_MS = 4000;

/** 슬라이드 1장의 재생 길이(초)를 음성 metadata 로, 못 읽으면 추정치로 해석. */
function resolveDuration(s: SlideshowSlide): Promise<number> {
  const est = Math.max(
    MIN_SLIDE_SEC,
    (s.end_seconds || 0) - (s.start_seconds || 0),
  );
  if (!s.audio_url || typeof Audio === "undefined") return Promise.resolve(est);
  const url = s.audio_url;
  return new Promise<number>((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    let done = false;
    const finish = (v: number) => {
      if (done) return;
      done = true;
      resolve(v > 0 && isFinite(v) ? v : est);
    };
    a.addEventListener("loadedmetadata", () => finish(a.duration));
    a.addEventListener("error", () => finish(est));
    setTimeout(() => finish(est), META_TIMEOUT_MS);
    a.src = url;
  });
}

export function useSlideshowPlayback(
  slug: string | null,
  onProgress?: (sec: number) => void,
): SlideshowPlayback {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [slides, setSlides] = useState<SlideshowSlide[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [bodyReady, setBodyReady] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [subtitlePosition, setSubtitlePosition] =
    useState<SubtitlePosition | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // 이벤트/rAF 클로저가 최신값을 읽도록 ref 동기화.
  const slidesRef = useRef<SlideshowSlide[]>([]);
  const durationsRef = useRef<number[]>([]);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  const loadedIndexRef = useRef<number>(-1); // 현재 audio.src 에 로드된 슬라이드
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastEmitSecRef = useRef<number>(-1);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  useEffect(() => {
    durationsRef.current = durations;
  }, [durations]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // 슬라이드별 누적 시작 오프셋 + 전체 길이.
  const offsets = useMemo(() => {
    const o: number[] = [];
    let acc = 0;
    for (const d of durations) {
      o.push(acc);
      acc += d;
    }
    return o;
  }, [durations]);
  const offsetsRef = useRef<number[]>([]);
  useEffect(() => {
    offsetsRef.current = offsets;
  }, [offsets]);
  const duration = useMemo(
    () => durations.reduce((a, b) => a + b, 0),
    [durations],
  );

  // ─── 데이터 fetch + 실제 음성 길이 해석 ───
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      // access 토큰은 메모리 전용이라 새 탭(교수자 미리보기 window.open)·직접 URL
      // 진입 시 휘발된다. slideshow 는 미발행 강의를 소유 교수자에게만 보여주는데,
      // 토큰 없이(익명) 호출하면 404(401 아님 → refresh 인터셉터가 못 잡음)로 떨어져
      // "영상이 준비되지 않았습니다"에 갇힌다. 호출 전에 refresh 쿠키로 토큰을
      // 선제 복원한다. 발행 강의(학생)는 쿠키가 없어 즉시 false 로 빠지고 익명 호출.
      await bootstrapAuth();
      if (cancelled) return;
      try {
        const { data } = await api.get<SlideshowWire>(
          `/api/lectures/${slug}/slideshow`,
        );
        if (cancelled) return;
        if (data.is_expired) {
          setIsExpired(true);
          setReady(true);
          return;
        }
        // 구버전 백엔드(필드 없음)는 true 로 간주해 종전 동작 유지.
        setBodyReady(data.is_ready !== false);
        setSubtitlePosition(data.subtitle_position ?? null);
        const ss = data.slides ?? [];
        setSlides(ss);
        const resolved = await Promise.all(ss.map(resolveDuration));
        if (cancelled) return;
        setDurations(resolved);
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // ─── 슬라이드 i 의 음성을 (intra 초부터) 로드/재생 ───
  const loadSlideAudio = useCallback((index: number, intra: number) => {
    const a = audioRef.current;
    const s = slidesRef.current[index];
    if (!a) return;
    if (s?.audio_url) {
      if (loadedIndexRef.current !== index) {
        a.src = s.audio_url;
        loadedIndexRef.current = index;
      }
      try {
        a.currentTime = Math.max(0, intra);
      } catch {
        /* metadata 미로딩 — canplay 후 시도 */
      }
      if (isPlayingRef.current) a.play().catch(() => {});
    } else {
      // 음성 없는 슬라이드 — audio 는 멈춰두고 wallclock 으로 진행.
      try {
        a.pause();
      } catch {
        /* no-op */
      }
      loadedIndexRef.current = -1;
    }
  }, []);

  const emit = useCallback((t: number) => {
    const sec = Math.floor(t);
    if (sec !== lastEmitSecRef.current) {
      lastEmitSecRef.current = sec;
      onProgressRef.current?.(sec);
    }
  }, []);

  // ─── rAF 루프 — isPlaying 동안만 구동 ───
  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  // rAF 루프 본체는 ref 에 담아 자기참조(다음 프레임 예약)를 안전하게 한다.
  const tickRef = useRef<(ts: number) => void>(() => {});
  useEffect(() => {
    tickRef.current = (ts: number) => {
      const i = currentIndexRef.current;
      const total = slidesRef.current.length;
      if (total === 0) {
        stopLoop();
        return;
      }
      const a = audioRef.current;
      const s = slidesRef.current[i];
      const off = offsetsRef.current[i] ?? 0;
      const dur = durationsRef.current[i] ?? MIN_SLIDE_SEC;

      let t: number;
      if (s?.audio_url && a) {
        t = off + a.currentTime;
      } else {
        const last = lastTsRef.current ?? ts;
        t = currentTimeRef.current + (ts - last) / 1000;
      }
      lastTsRef.current = ts;

      // 슬라이드 경계 — 추정 길이 도달 또는 (길이 추정이 빗나간 경우) 음성 종료 시.
      const audioEnded = !!(s?.audio_url && a && a.ended);
      if (t >= off + dur - 0.05 || audioEnded) {
        if (i + 1 < total) {
          const nextOff = offsetsRef.current[i + 1] ?? off + dur;
          currentIndexRef.current = i + 1;
          currentTimeRef.current = nextOff;
          setCurrentIndex(i + 1);
          setCurrentTime(nextOff);
          loadSlideAudio(i + 1, 0);
          emit(nextOff);
          rafRef.current = requestAnimationFrame((n) => tickRef.current(n));
          return;
        }
        // 마지막 슬라이드 끝 — 정지.
        const end = off + dur;
        currentTimeRef.current = end;
        setCurrentTime(end);
        isPlayingRef.current = false;
        setIsPlaying(false);
        emit(end);
        stopLoop();
        return;
      }

      currentTimeRef.current = t;
      setCurrentTime(t);
      emit(t);
      rafRef.current = requestAnimationFrame((n) => tickRef.current(n));
    };
  }, [emit, loadSlideAudio, stopLoop]);

  const startLoop = useCallback(() => {
    stopLoop();
    rafRef.current = requestAnimationFrame((ts) => tickRef.current(ts));
  }, [stopLoop]);

  const play = useCallback(() => {
    if (slidesRef.current.length === 0) return;
    isPlayingRef.current = true;
    setIsPlaying(true);
    const i = currentIndexRef.current;
    const off = offsetsRef.current[i] ?? 0;
    loadSlideAudio(i, currentTimeRef.current - off);
    startLoop();
  }, [loadSlideAudio, startLoop]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    try {
      audioRef.current?.pause();
    } catch {
      /* no-op */
    }
    stopLoop();
  }, [stopLoop]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [pause, play]);

  const seekTo = useCallback(
    (sec: number) => {
      const offs = offsetsRef.current;
      const durs = durationsRef.current;
      const total = durs.reduce((a, b) => a + b, 0);
      const target = Math.max(0, Math.min(total, sec));
      // target 이 속한 슬라이드 인덱스.
      let idx = 0;
      for (let j = 0; j < offs.length; j += 1) {
        if (target >= offs[j]) idx = j;
        else break;
      }
      currentIndexRef.current = idx;
      currentTimeRef.current = target;
      setCurrentIndex(idx);
      setCurrentTime(target);
      loadedIndexRef.current = -1; // 강제 재로드
      loadSlideAudio(idx, target - (offs[idx] ?? 0));
      emit(target);
      if (isPlayingRef.current) startLoop();
    },
    [emit, loadSlideAudio, startLoop],
  );

  const seekDelta = useCallback(
    (delta: number) => {
      seekTo(currentTimeRef.current + delta);
    },
    [seekTo],
  );

  const restart = useCallback(() => {
    seekTo(0);
  }, [seekTo]);

  // 외부(키보드 단축키 등)에서 audio 를 직접 play/pause 했을 때 상태 동기화.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => {
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        startLoop();
      }
    };
    const onPause = () => {
      // 슬라이드 전환 중의 일시적 pause 는 무시 — 사용자가 멈춘 경우만 반영.
      if (isPlayingRef.current && a.currentTime > 0 && !a.ended) {
        // 전환 직후(ended)면 루프가 이미 다음 슬라이드를 재생한다.
      }
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [ready, startLoop]);

  // 언마운트 정리.
  useEffect(() => () => stopLoop(), [stopLoop]);

  const currentSlide = slides[currentIndex] ?? null;
  // 자막 동기화는 추정 타임라인(start/end_seconds)이 아니라 실측 음성 기반
  // offsets/durations 로 계산해야 음성과 어긋나지 않는다.
  const currentSlideDuration = durations[currentIndex] ?? 0;
  const currentSlideElapsed = Math.max(
    0,
    Math.min(currentTime - (offsets[currentIndex] ?? 0), currentSlideDuration),
  );

  return {
    slides,
    ready,
    bodyReady,
    isExpired,
    subtitlePosition,
    currentIndex,
    currentSlide,
    currentSlideElapsed,
    currentSlideDuration,
    isPlaying,
    currentTime,
    duration,
    audioRef,
    togglePlay,
    play,
    pause,
    seekTo,
    seekDelta,
    restart,
  };
}
