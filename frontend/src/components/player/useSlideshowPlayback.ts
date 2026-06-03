"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

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

export interface SlideshowSlide {
  slide_index: number;
  image_url: string | null;
  audio_url: string | null;
  start_seconds: number;
  end_seconds: number;
  text: string;
  subtitle_text: string | null;
}

interface SlideshowWire {
  lecture_id: string;
  is_expired: boolean;
  total_seconds: number;
  slides: SlideshowSlide[];
}

export interface SlideshowPlayback {
  slides: SlideshowSlide[];
  ready: boolean;
  isExpired: boolean;
  currentIndex: number;
  currentSlide: SlideshowSlide | null;
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
  const [isExpired, setIsExpired] = useState(false);
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

  return {
    slides,
    ready,
    isExpired,
    currentIndex,
    currentSlide,
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
