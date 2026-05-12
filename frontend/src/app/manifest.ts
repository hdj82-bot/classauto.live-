import type { MetadataRoute } from "next";

/**
 * PWA manifest — v2 (2026-05-12)
 *
 * IFL Platform · indigo (#4F46E5) → ClassAuto · 라이트 베이지 (#FAFAF7).
 * theme_color 는 iOS/Android 상태바 색이며 사이트 background 와 일치시킨다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClassAuto",
    short_name: "ClassAuto",
    description: "AI 기반 플립러닝 플랫폼 — 학자가 학자를 위해 만든 도구",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FAFAF7",
    theme_color: "#FAFAF7",
    icons: [
      {
        src: "/icons/icon-192x192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512x512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
