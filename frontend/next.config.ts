import type { NextConfig } from "next";

// 보안 헤더 — 모든 응답에 적용. SSL/TLS 는 Vercel/Railway 또는 nginx 가
// 처리하므로 HSTS 는 호스팅 계층에 맡긴다.
const securityHeaders = [
  {
    // MIME sniffing 방지
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // referrer 누출 최소화
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // 카메라/마이크/위치/USB 등 민감 권한 차단 — 본 앱은 사용 안 함
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // 클릭재킹 방지 (CSP frame-ancestors 미지원 브라우저 대비)
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",

  images: {
    // 외부 이미지 host allowlist — Supabase Storage 와 S3 (HeyGen 출력 등)
    // 환경변수가 없으면 명시적으로 비워둔다 (의도적인 lock-down).
    remotePatterns: [
      // Supabase Storage public bucket
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [
            {
              protocol: "https" as const,
              hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      // 앱이 사용하는 S3 버킷 — env 가 없으면 비활성
      ...(process.env.NEXT_PUBLIC_S3_PUBLIC_BUCKET_HOST
        ? [
            {
              protocol: "https" as const,
              hostname: process.env.NEXT_PUBLIC_S3_PUBLIC_BUCKET_HOST,
              pathname: "/**",
            },
          ]
        : []),
      // HeyGen 결과물 CDN (avatar 음성/영상 썸네일). 도메인은 변경될 수 있으므로
      // 운영 시 NEXT_PUBLIC_HEYGEN_CDN_HOST 로 핀 가능.
      ...(process.env.NEXT_PUBLIC_HEYGEN_CDN_HOST
        ? [
            {
              protocol: "https" as const,
              hostname: process.env.NEXT_PUBLIC_HEYGEN_CDN_HOST,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
