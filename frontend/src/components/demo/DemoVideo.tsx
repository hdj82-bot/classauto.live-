"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_FIELDS, type DemoField } from "./demoTypes";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  field: DemoField;
}

/**
 * 데모 영상 플레이어.
 *
 * 영상 파일이 아직 없으므로 placeholder 정지 화면을 보여주되,
 * `<video>` 엘리먼트는 마운트해두어 영상이 추가되면 즉시 재생되도록 한다.
 *
 * TODO(W3 후속): /public/demo/{slug}.mp4, /public/demo/{slug}.poster.jpg
 *   파일 추가 후 placeholder 분기 제거.
 */
export default function DemoVideo({ field }: Props) {
  const { t } = useDemoI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [hasSource, setHasSource] = useState(false);

  const cfg = DEMO_FIELDS[field];
  const videoSrc = `/demo/${cfg.slug}.mp4`;
  const posterSrc = `/demo/${cfg.slug}.poster.svg`;

  // HEAD 체크로 영상 존재 여부 확인 — placeholder 분기.
  useEffect(() => {
    let cancelled = false;
    fetch(videoSrc, { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setHasSource(res.ok);
      })
      .catch(() => {
        if (!cancelled) setHasSource(false);
      });
    return () => {
      cancelled = true;
    };
  }, [videoSrc]);

  const togglePlay = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  // 2026-05-13 PM: 외곽 컨테이너는 라이트 카드 (#FFFFFF, 라이트 베이지 페이지와
  // 매치), 영상 박스 자체만 검은색 유지 (영상 콘텐츠 시청 측면). YouTube/Vimeo
  // 와 동일한 패턴.
  //
  // 사이즈 정렬 (사용자 결정 2026-05-13 PM): 부모 grid 가 1:1 비율로 두 cell 을
  // stretch 시키므로, 본 컴포넌트는 `h-full + flex flex-col` 로 row 높이를 가득
  // 채우고, 영상 박스(`flex-1`) 가 캡션을 제외한 나머지 공간을 모두 차지하게
  // 한다. aspect-video 는 제거 — 16:9 가 깨질 우려는 video 의 object-cover 가
  // 처리. placeholder 분기도 동일하게 채움.
  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04)] flex flex-col">
      <div className="flex-1 w-full bg-black relative">
        {hasSource ? (
          <video
            ref={ref}
            src={videoSrc}
            poster={posterSrc}
            preload="metadata"
            playsInline
            controls
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="demo-video"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          >
            <track kind="captions" srcLang="ko" label="한국어" default />
          </video>
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
            data-testid="demo-video-placeholder"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <span className="text-3xl" aria-hidden="true">🎬</span>
            </div>
            <p className="text-white text-base font-semibold mb-2">
              {t("experience.videoPlaceholderTitle")}
            </p>
            <p className="text-sm text-white/55 max-w-md">
              {t("experience.videoPlaceholderDesc")}
            </p>
            {/* TODO 주석 — i18n 키로도 노출하지만 dev 환경에서만 보이게 */}
            {process.env.NODE_ENV !== "production" && (
              <code className="mt-4 text-[11px] text-amber-400/80 bg-black/40 px-2 py-1 rounded">
                {t("experience.videoTodo", { slug: cfg.slug })}
              </code>
            )}
          </div>
        )}

        {hasSource && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB627]"
            aria-label={playing ? t("experience.videoControlsPause") : t("experience.videoControlsPlay")}
          >
            <span className="sr-only">
              {playing ? t("experience.videoControlsPause") : t("experience.videoControlsPlay")}
            </span>
          </button>
        )}
      </div>

      <p className="px-4 py-2.5 text-[11px] text-[rgba(10,10,10,0.55)] shrink-0">
        {t("experience.videoCaption")}
      </p>
    </div>
  );
}
