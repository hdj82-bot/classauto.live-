"use client";

/**
 * 음성 미리듣기 음량 정규화.
 *
 * ElevenLabs 샘플(preview_url)은 보이스마다 녹음 레벨이 달라 그대로 재생하면
 * 어떤 건 크고 어떤 건 작게 들린다. 이 모듈은 클립을 Web Audio 로 디코드해
 * RMS(평균 제곱근 음량)를 재고, 목표 RMS 에 맞춘 게인을 곱해 재생한다 — 결과적으로
 * 모든 미리듣기가 비슷한 체감 음량으로 들린다. 게인 적용 후 피크가 한도를 넘으면
 * 게인을 낮춰 클리핑(찢어짐)을 막는다. 디코드한 버퍼·게인은 URL 기준으로 캐시해
 * 다시 들을 때 즉시 재생한다.
 *
 * 어떤 이유로든(CORS 차단·미지원 브라우저·디코드 실패) Web Audio 경로가 막히면
 * 일반 ``<audio>`` 재생으로 폴백한다 — 정규화는 못 해도 미리듣기 자체는 끊기지
 * 않는다.
 *
 * 반환 핸들의 ``stop()`` 은 재생을 멈추고, 아직 로딩 중이면 시작 자체를 취소한다.
 * 재생은 항상 사용자 제스처(미리듣기 버튼) 안에서 시작되므로 자동재생 정책·
 * AudioContext resume 에 걸리지 않는다.
 */

export interface PreviewPlayHandle {
  stop: () => void;
}

// 목표 RMS(선형 진폭). 발화 음성 기준 약 -18 dBFS. 클립들을 이 음량으로 끌어 맞춘다.
const TARGET_RMS = 0.12;
// 아주 작은 클립을 과증폭(노이즈 부각)하지 않도록 게인 상·하한을 둔다.
const MAX_GAIN = 16;
const MIN_GAIN = 0.1;
// 게인 적용 후 피크가 이 값을 넘지 않게 보정(클리핑 방지).
const PEAK_CEILING = 0.97;

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) {
    try {
      _ctx = new AC();
    } catch {
      return null;
    }
  }
  return _ctx;
}

// 디코드 버퍼·계산된 게인 캐시(세션 수명). URL 단위 — 같은 보이스를 다시 들으면
// 네트워크·디코드·분석 없이 즉시 재생한다.
const bufferCache = new Map<string, AudioBuffer>();
const gainCache = new Map<string, number>();
const inflight = new Map<string, Promise<AudioBuffer>>();

/** RMS 기준 정규화 게인. 무음에 가까우면 1, 그 외엔 목표 RMS/측정 RMS(상·하한·피크 보정). */
function computeGain(buf: AudioBuffer): number {
  let sumSq = 0;
  let count = 0;
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i += 1) {
      const s = data[i];
      sumSq += s * s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
    }
    count += data.length;
  }
  if (count === 0) return 1;
  const rms = Math.sqrt(sumSq / count);
  if (rms <= 1e-5) return 1; // 사실상 무음 — 건드리지 않는다.
  let gain = TARGET_RMS / rms;
  gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, gain));
  if (peak > 0 && gain * peak > PEAK_CEILING) gain = PEAK_CEILING / peak;
  return gain;
}

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const pending = inflight.get(url);
  if (pending) return pending;
  const task = (async () => {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) throw new Error(`preview fetch ${resp.status}`);
    const arr = await resp.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    bufferCache.set(url, buf);
    gainCache.set(url, computeGain(buf));
    return buf;
  })();
  inflight.set(url, task);
  try {
    return await task;
  } finally {
    inflight.delete(url);
  }
}

/**
 * ``url`` 음원을 음량 정규화해 1회 재생한다. 재생이 자연 종료되거나 실패하면
 * ``onEnded`` 가 한 번 호출된다(수동 stop 에서는 호출하지 않는다). 반환 핸들의
 * ``stop()`` 으로 중지하며, 로딩 중이면 시작을 취소한다.
 */
export function playNormalizedPreview(
  url: string,
  onEnded?: () => void,
): PreviewPlayHandle {
  let cancelled = false;
  let stopInner: (() => void) | null = null;
  let ended = false;
  const finishOnce = () => {
    if (ended || cancelled) return;
    ended = true;
    onEnded?.();
  };

  const ctx = getCtx();
  // 사용자 제스처 안에서 동기적으로 resume — await 이후엔 제스처 컨텍스트가 풀린다.
  if (ctx && ctx.state === "suspended") void ctx.resume();

  const playRaw = () => {
    try {
      const audio = new Audio(url);
      audio.onended = finishOnce;
      audio.onerror = finishOnce;
      stopInner = () => {
        try {
          audio.pause();
        } catch {
          /* no-op */
        }
      };
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(finishOnce);
    } catch {
      finishOnce();
    }
  };

  void (async () => {
    if (ctx) {
      try {
        const buf = await loadBuffer(ctx, url);
        if (cancelled) return;
        const gain = gainCache.get(url) ?? 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(g).connect(ctx.destination);
        src.onended = finishOnce;
        stopInner = () => {
          try {
            src.onended = null;
            src.stop();
          } catch {
            /* no-op */
          }
        };
        src.start();
        return;
      } catch {
        if (cancelled) return;
        // Web Audio 실패(CORS·디코드 등) — 아래 일반 재생으로 폴백.
      }
    }
    if (cancelled) return;
    playRaw();
  })();

  return {
    stop: () => {
      cancelled = true;
      if (stopInner) stopInner();
    },
  };
}
