"use client";

import { useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { EngagementData } from "./types";

/**
 * 학습자 참여도 — 시청 비율 분포 곡선 + 학생별 표.
 *
 * - 5-bin (0~20, 20~40, 40~60, 60~80, 80~100) histogram. SVG 로 부드러운
 *   영역 그래프(area chart)로 그려서 "곡선" 인상을 준다 — 학습 분포의
 *   개형을 한눈에 보고 정원에서 어느 구간에 몰려있는지 파악.
 * - 막대 위에 라벨로 "n명" 표시 — 색상 단독 의존 X.
 * - 하단: 학생별 참여 지표 표 (시청률·질문·응답률·무반응).
 *
 * 빈 데이터: students.length === 0 + summary.totalStudents === 0 → EmptyState.
 */
interface EngagementCurveProps {
  data: EngagementData;
}

const BIN_COUNT = 5;
const SVG_W = 480;
const SVG_H = 180;

export default function EngagementCurve({ data }: EngagementCurveProps) {
  const { t, tValue } = useAnalyticsI18n();
  const summary = data.summary ?? {
    totalStudents: 0,
    totalQAQuestions: 0,
    overallResponseRate: 0,
    totalNoResponseEvents: 0,
  };
  const students = data.students ?? [];

  const binLabels = (tValue<string[]>("engagement.ratioBins") ??
    ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"]).slice(0, BIN_COUNT);

  const bins = useMemo(() => {
    const out = new Array(BIN_COUNT).fill(0);
    for (const s of students) {
      const r = Math.max(0, Math.min(100, Number(s.watchRatio ?? 0)));
      const idx = r >= 100 ? BIN_COUNT - 1 : Math.min(BIN_COUNT - 1, Math.floor(r / 20));
      out[idx] += 1;
    }
    return out;
  }, [students]);

  if ((summary.totalStudents ?? 0) === 0 && students.length === 0) {
    return (
      <EmptyState
        title={t("engagement.empty")}
        description={t("engagement.emptyDesc")}
      />
    );
  }

  const maxBin = Math.max(1, ...bins);
  const padX = 32;
  const padY = 16;
  const innerW = SVG_W - padX * 2;
  const innerH = SVG_H - padY * 2 - 18;
  const stepX = innerW / (BIN_COUNT - 1);

  // 정점 좌표 계산 — area path
  const points = bins.map((v, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - v / maxBin) * innerH;
    return { x, y, v };
  });

  // 부드러운 곡선: 단순 polyline + 약한 corner-rounding 효과를 위해
  // quadratic Bezier 의 control point 를 두 정점 중간에 배치.
  const linePath = points
    .map((p, i, arr) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = arr[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `Q ${cx} ${prev.y} ${cx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
    })
    .join(" ");

  const areaPath =
    `${linePath} L ${padX + innerW} ${padY + innerH} L ${padX} ${padY + innerH} Z`;

  return (
    <div className="space-y-6">
      {/* 요약 4종 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label={t("engagement.summaryStudents")}
          value={summary.totalStudents}
        />
        <SummaryTile
          label={t("engagement.summaryQA")}
          value={summary.totalQAQuestions}
        />
        <SummaryTile
          label={t("engagement.summaryResponseRate")}
          value={`${summary.overallResponseRate}%`}
          color={ANALYTICS_PALETTE.success}
        />
        <SummaryTile
          label={t("engagement.summaryNoResponse")}
          value={summary.totalNoResponseEvents}
          color={
            summary.totalNoResponseEvents > 0
              ? ANALYTICS_PALETTE.warning
              : ANALYTICS_PALETTE.text
          }
        />
      </div>

      {/* 시청 비율 곡선 */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>{t("engagement.ratioLegend")}</span>
          <span>{t("engagement.watchRatio")}</span>
        </div>
        <div className="overflow-x-auto -mx-2 px-2">
          <svg
            role="img"
            aria-label={t("engagement.ratioLegend")}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            height={SVG_H}
            preserveAspectRatio="xMinYMid meet"
            style={{ maxWidth: SVG_W * 1.4 }}
          >
            <defs>
              <linearGradient id="engagement-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={ANALYTICS_PALETTE.gold} stopOpacity={0.45} />
                <stop offset="100%" stopColor={ANALYTICS_PALETTE.gold} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            {/* 가로 그리드 */}
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <line
                key={g}
                x1={padX}
                x2={padX + innerW}
                y1={padY + g * innerH}
                y2={padY + g * innerH}
                stroke={ANALYTICS_PALETTE.border}
                strokeDasharray={g === 1 ? undefined : "2 4"}
              />
            ))}

            <path
              d={areaPath}
              fill="url(#engagement-area)"
              className="motion-safe:transition-opacity motion-safe:duration-500"
            />
            <path
              d={linePath}
              fill="none"
              stroke={ANALYTICS_PALETTE.gold}
              strokeWidth={2}
              strokeLinejoin="round"
            />

            {/* 정점 + 라벨 */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={3.5} fill={ANALYTICS_PALETTE.gold} />
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={ANALYTICS_PALETTE.text}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {p.v}
                </text>
                <text
                  x={p.x}
                  y={padY + innerH + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={ANALYTICS_PALETTE.textMuted}
                >
                  {binLabels[i]}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* 학생별 표 */}
      <div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {t("engagement.studentsTitle")}
        </p>
        {students.length === 0 ? (
          <EmptyState
            title={t("engagement.empty")}
            description={t("engagement.emptyDesc")}
            bordered={false}
          />
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="pb-2 pr-3">
                    {t("engagement.tableName")}
                  </th>
                  <th scope="col" className="pb-2 pr-3">
                    {t("engagement.tableNumber")}
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    {t("engagement.tableWatch")}
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    {t("engagement.tableQA")}
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    {t("engagement.tableResponseRate")}
                  </th>
                  <th scope="col" className="pb-2 text-right">
                    {t("engagement.tableNoResponse")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.userId} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-900">{s.name ?? "-"}</td>
                    <td className="py-2 pr-3 text-gray-500">
                      {s.student_number ?? "-"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {(s.watchRatio ?? 0).toFixed(0)}%
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {s.qaCount}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {s.responseRate === null
                        ? "—"
                        : `${(s.responseRate ?? 0).toFixed(0)}%`}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{
                        color:
                          (s.noResponseCnt ?? 0) > 0
                            ? ANALYTICS_PALETTE.warning
                            : ANALYTICS_PALETTE.textMuted,
                      }}
                    >
                      {s.noResponseCnt ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: color ?? ANALYTICS_PALETTE.text }}
      >
        {value}
      </p>
    </div>
  );
}
