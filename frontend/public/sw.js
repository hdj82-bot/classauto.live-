// ClassAuto — Service Worker
// 캐시 전략: 명시 프리캐시 자산(오프라인 페이지·아이콘) → Cache First,
//            API → Network First, 네비게이션 → Network First (+offline 폴백).
//
// 캐시 이름 bump: v3 — 이슈 #167.
//   기존 v2 는 `/_next/static/` 빌드 청크를 Cache First 로 무기한 영구 캐시했다.
//   Vercel 은 `/_next/static/` 를 content-hash 파일명 + `immutable` 헤더로
//   서빙하므로 브라우저 HTTP 캐시가 이미 최적·정확하다. 그 위에 SW Cache First
//   가 한 겹 더 끼면, 배포가 누적되는 동안 한 캐시 세대(classauto-v2)에
//   **이전 빌드의 청크**가 영구히 남아 — Network First 로 늘 최신인 HTML(=새
//   빌드의 RSC/hydration 데이터)과 짝이 어긋난다 → React 가 클라이언트 재렌더로
//   복구하는 recoverable hydration mismatch(프로덕션 minified #418). 정적 분석·
//   단위 테스트로 안 잡히고 "재방문 사용자에서만" 나던 증상과 정확히 일치.
//
//   해결: 빌드 산출물은 SW 가 **가로채지 않는다**(respondWith 호출 안 함 →
//   브라우저 기본 fetch + 자체 immutable HTTP 캐시가 처리, 항상 정합).
//   SW 는 의도적으로 프리캐시한 안정 자산과 오프라인 폴백만 담당한다.
//   v2 → v3 이름 변경으로 activate 시 기존 stale 캐시가 전부 purge 되어,
//   영향받던 재방문 사용자의 누적 stale 청크도 함께 비워진다.

const CACHE_NAME = "classauto-v3";
const OFFLINE_URL = "/offline";

const STATIC_ASSETS = [
  "/offline",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg",
];

// 위 목록만 Cache First 대상. 빌드 청크(/_next/static/ 등)는 제외 — 위 주석 참조.
const PRECACHED_PATHS = new Set(STATIC_ASSETS);

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 같은 origin만 처리
  if (url.origin !== self.location.origin) return;

  // API 요청 → Network First
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 명시적으로 프리캐시한 안정 자산(오프라인 페이지·아이콘)만 Cache First.
  // 그 외 정적 산출물(/_next/static/ 등)은 가로채지 않고 브라우저에 위임한다
  // — stale 청크 ↔ 최신 HTML 불일치(#418, 이슈 #167) 차단.
  if (PRECACHED_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 네비게이션 요청 → Network First with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }
});

// ── 전략 ────────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(OFFLINE_URL);
    return cached || new Response("Offline", { status: 503 });
  }
}
