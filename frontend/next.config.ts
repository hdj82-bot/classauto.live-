import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy — XSS / 데이터 인젝션 표면 축소.
//
// 제약: Next.js 는 hydration 부트스트랩을 인라인 <script> 로 주입하고, 이 앱은
// style={{...}} 인라인 스타일을 광범위하게 쓴다. nonce 를 쓰려면 미들웨어가
// 필요하나 이번 작업 범위(next.config.ts 단독) 밖이라, script/style 에 한해
// 'unsafe-inline' 을 허용한다(프레임워크 제약상 현실적 최소치). dev 는 HMR 이
// eval + websocket 을 쓰므로 'unsafe-eval' / ws: 를 dev 에서만 추가한다.
//
// connect/img 는 백엔드 API·Sentry·S3·Supabase 가 런타임 env 로 결정돼 호스트를
// 정적으로 핀하기 어렵다 → https: 로 폭을 두되 http(평문)·data 인젝션은 막는다.
const scriptSrc = isProd
  ? "'self' 'unsafe-inline'"
  : "'self' 'unsafe-inline' 'unsafe-eval'";
const connectSrc = isProd ? "'self' https:" : "'self' https: ws: wss:";

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // 클릭재킹 방지(최신 브라우저). 구형 대비 X-Frame-Options 와 함께 둔다.
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "media-src 'self' https: blob:",
  // 프로덕션에서만 평문 요청을 https 로 승격(dev localhost http 방해 방지).
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

// 보안 헤더 — 모든 응답에 적용.
const securityHeaders = [
  {
    // XSS·인젝션 표면 축소 (위 cspDirectives 참조)
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    // HSTS — https 강제. Vercel/Railway 가 TLS 종단을 처리하지만, 응답 헤더로
    // 명시해 다운그레이드(SSL stripping) 를 차단한다. localhost http 응답엔
    // 브라우저가 HSTS 를 무시하므로 dev 에도 무해. 2년 + 서브도메인 + preload.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
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
    // 민감 권한 정책. 마이크는 본인 음성 녹음(내 목소리로 음성 만들기)에 쓰므로
    // 자기 출처(self)에만 허용한다. microphone=() 로 두면 사용자가 브라우저
    // 권한을 허용해도 getUserMedia 가 정책 단계에서 막혀 녹음이 불가능하다.
    // 나머지(카메라/위치/결제/USB)는 미사용이라 전면 차단 유지.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
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
