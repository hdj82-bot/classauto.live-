"use client";

import { useLandingI18n } from "./useLandingI18n";

/**
 * Mesh-network 비주얼 — docs/design-system/animations.md §2.5.
 *
 * 6 노드 (PPT → AI → 영상 / RAG / 평가 / 다국어) 가 그라데이션 라인으로 연결되며
 * float (위상 분산) + pulse-flow (라인 빛 흐름). 플랫폼의 "한 번 업로드 → 모든
 * 학습 흐름" 메시지를 시각화.
 *
 * SVG 기반이라 dependency 0. `prefers-reduced-motion` 일 때 모든 animation
 * 자동 비활성 (CSS @media 가 처리).
 *
 * 모바일에서는 노드 라벨이 겹칠 수 있어 가로 스크롤 또는 축소된 레이아웃.
 * 본 구현은 viewBox + max-w 로 컨테이너에 맞춰 fit — 별도 분기 없음.
 */
export default function MeshNetworkVisual() {
  const { t } = useLandingI18n();

  // 노드 좌표 (640×320 viewBox 기준)
  const nodes = [
    { id: "ppt",       cx: 60,  cy: 160, label: t("platform.node.ppt"),       grad: "electric" as const, delay: 0 },
    { id: "ai",        cx: 220, cy: 80,  label: t("platform.node.ai"),        grad: "violet"   as const, delay: 0.6 },
    { id: "video",     cx: 220, cy: 240, label: t("platform.node.video"),     grad: "electric" as const, delay: 1.2 },
    { id: "rag",       cx: 420, cy: 70,  label: t("platform.node.rag"),       grad: "cyan"     as const, delay: 0.3 },
    { id: "assess",    cx: 420, cy: 250, label: t("platform.node.assess"),    grad: "pink"     as const, delay: 0.9 },
    { id: "translate", cx: 580, cy: 160, label: t("platform.node.translate"), grad: "cyan"     as const, delay: 1.5 },
  ];

  // 노드 간 연결선
  const lines: Array<[string, string]> = [
    ["ppt", "ai"],
    ["ppt", "video"],
    ["ai", "rag"],
    ["video", "rag"],
    ["video", "assess"],
    ["ai", "assess"],
    ["rag", "translate"],
    ["assess", "translate"],
  ];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n] as const));

  return (
    <figure
      className="mesh-network max-w-3xl mx-auto"
      role="img"
      aria-label={t("a11y.meshDecoration")}
    >
      <style>{`
        .mesh-network .mesh-node {
          animation: mesh-float 6s ease-in-out infinite;
          animation-delay: var(--delay, 0s);
          will-change: transform;
          transform-box: fill-box;
          transform-origin: center;
        }
        .mesh-network .mesh-line {
          stroke-dasharray: 4 8;
          animation: mesh-pulse-flow 3s linear infinite;
        }
        @keyframes mesh-float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(0, -6px); }
        }
        @keyframes mesh-pulse-flow {
          to { stroke-dashoffset: -12; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mesh-network .mesh-node,
          .mesh-network .mesh-line {
            animation: none;
          }
        }
      `}</style>

      <svg
        viewBox="0 0 640 320"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        aria-hidden="true"
      >
        {/* 연결선 — 노드 뒤에 깔리도록 먼저 그림 */}
        <g>
          {lines.map(([fromId, toId]) => {
            const a = byId[fromId];
            const b = byId[toId];
            return (
              <line
                key={`${fromId}-${toId}`}
                className="mesh-line"
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke="url(#grad-violet)"
                strokeWidth="1.5"
                strokeOpacity="0.5"
              />
            );
          })}
        </g>

        {/* 노드 — 원 + 라벨 */}
        <g>
          {nodes.map((n) => (
            <g
              key={n.id}
              className="mesh-node"
              style={{ ["--delay" as string]: `${n.delay}s` }}
            >
              <circle
                cx={n.cx}
                cy={n.cy}
                r="22"
                fill="white"
                stroke={`url(#grad-${n.grad})`}
                strokeWidth="2"
              />
              <circle
                cx={n.cx}
                cy={n.cy}
                r="6"
                fill={`url(#grad-${n.grad})`}
              />
              <text
                x={n.cx}
                y={n.cy + 42}
                textAnchor="middle"
                className="text-[11px] fill-gray-700"
                style={{ fontFamily: "'Pretendard Variable', sans-serif", fontWeight: 600 }}
              >
                {n.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </figure>
  );
}
