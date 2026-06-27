"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";

// docs/planning/analytics-spec.md A블록(§2)의 강의별 분석 + AI 대면수업 브리핑.
// 6월 범위(§5): 실 이벤트 수집 전이라 백엔드가 scenario 로 합성 데이터를 만들어
// 집계·판정·AI 브리핑을 반환한다. 추후 실 집계가 같은 응답 계약으로 교체된다.
//
// 접근: 베타 토글(users.analytics_pro_enabled)이 켜진 교수자 + 운영자만. 권한이
// 없으면 백엔드가 403 → 안내 패널 표시(에러 토스트로 처리하지 않는다).

interface RosterEntry {
  id: number;
  name: string;
  level: string;
  score: number;
  top_weakness: string | null;
}

interface LectureAnalysis {
  student_count: number;
  avg_score: number;
  completion_rate: number;
  avg_watched: number;
  avg_questions: number;
  study_min_per: number;
  stdev: number;
  drop_concentration: number;
  weakness_totals: Record<string, number>;
  progress: {
    completed: number;
    in_progress: number;
    started: number;
    none: number;
  };
  roster: RosterEntry[];
  verdict: string;
  verdict_reason: string;
  recommended_direction: string;
}

interface StudentSolution {
  name: string;
  level: string;
  weakness: string;
  action: string;
}

interface BriefingResult {
  verdict_sentence: string;
  briefing: {
    approach_title: string;
    approach_detail: string;
    opening_move: string;
    recommended_minutes: number;
    focus_topics: string[];
  };
  student_solutions: StudentSolution[];
  source: string;
}

interface BriefingResponse {
  analysis: LectureAnalysis;
  ai: BriefingResult;
}

const SCENARIOS = ["excelling", "confused", "polarized", "dropout"] as const;
type Scenario = (typeof SCENARIOS)[number];

// 빠른 채우기용 전공 프리셋(§0-A 도메인 범용 — 특정 과목 비종속 시연). 어학뿐
// 아니라 공학·법학·예술 모두 같은 집계·판정 로직을 타는지 한 화면에서 확인.
const PRESETS: { subject: string; field: string; axes: string }[] = [
  { subject: "유체역학", field: "공학", axes: "오개념, 공식 적용 오류" },
  { subject: "헌법", field: "법학", axes: "쟁점 적용, 요건 누락" },
  { subject: "서양미술사", field: "예술학", axes: "기법, 비평 관점 누락" },
];

function levelClass(level: string): string {
  if (level === "부진") return "bg-red-100 text-red-700";
  if (level === "우수") return "bg-green-100 text-green-700";
  return "bg-amber-100 text-amber-700";
}

export default function AnalyticsProPage() {
  const { t } = useI18n();
  const { toast } = useToast();

  const [subject, setSubject] = useState(PRESETS[0].subject);
  const [field, setField] = useState(PRESETS[0].field);
  const [axesText, setAxesText] = useState(PRESETS[0].axes);
  const [scenario, setScenario] = useState<Scenario>("excelling");

  const [loading, setLoading] = useState(false);
  const [gated, setGated] = useState(false);
  const [result, setResult] = useState<BriefingResponse | null>(null);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setSubject(p.subject);
    setField(p.field);
    setAxesText(p.axes);
  };

  const handleGenerate = async () => {
    const axes = axesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!subject.trim() || !field.trim() || axes.length === 0) {
      toast(t("analyticsPro.errors.incomplete"), "error");
      return;
    }
    setLoading(true);
    setGated(false);
    try {
      const { data } = await api.post<BriefingResponse>(
        "/api/v1/analytics-pro/briefing",
        {
          course_profile: { subject, field, weakness_axes: axes },
          scenario,
          count: 40,
          seed: 1,
        }
      );
      setResult(data);
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 403) {
        setGated(true);
        setResult(null);
      } else {
        toast(t("analyticsPro.errors.failed"), "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const verdictLabel = (v: string) => t(`analyticsPro.verdict.${v}`);

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-widest text-amber-700">
          ANALYTICS PRO · BETA
        </p>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("analyticsPro.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t("analyticsPro.subtitle")}</p>
      </div>

      {/* 입력 패널 */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="ap-subject"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              {t("analyticsPro.form.subject")}
            </label>
            <input
              id="ap-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="ap-field"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              {t("analyticsPro.form.field")}
            </label>
            <input
              id="ap-field"
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="ap-axes"
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            {t("analyticsPro.form.weaknessAxes")}
          </label>
          <input
            id="ap-axes"
            value={axesText}
            onChange={(e) => setAxesText(e.target.value)}
            placeholder={t("analyticsPro.form.weaknessAxesHint")}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">
            {t("analyticsPro.form.presets")}:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.subject}
              onClick={() => applyPreset(p)}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              {p.field} · {p.subject}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label
            htmlFor="ap-scenario"
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            {t("analyticsPro.form.scenario")}
          </label>
          <select
            id="ap-scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as Scenario)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {verdictLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? t("analyticsPro.generating") : t("analyticsPro.generate")}
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner fullScreen={false} label={t("analyticsPro.generating")} />}

      {gated && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800"
          role="alert"
        >
          <p className="font-medium">{t("analyticsPro.gated.title")}</p>
          <p className="mt-1">{t("analyticsPro.gated.body")}</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-6">
          {/* 종합 판정 배너 */}
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-amber-500">
            <div className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                {verdictLabel(result.analysis.verdict)}
              </span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                  result.ai.source === "claude"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {result.ai.source === "claude"
                  ? t("analyticsPro.source.ai")
                  : t("analyticsPro.source.fallback")}
              </span>
            </div>
            <p className="mt-2 text-base font-semibold text-gray-900">
              {result.ai.verdict_sentence}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {result.analysis.verdict_reason}
            </p>
          </div>

          {/* 한눈에 보기 4지표 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: t("analyticsPro.kpi.understanding"),
                value: `${result.analysis.avg_score.toFixed(0)}%`,
              },
              {
                label: t("analyticsPro.kpi.completion"),
                value: `${result.analysis.completion_rate.toFixed(0)}%`,
              },
              {
                label: t("analyticsPro.kpi.watched"),
                value: `${(result.analysis.avg_watched * 100).toFixed(0)}%`,
              },
              {
                label: t("analyticsPro.kpi.questions"),
                value: result.analysis.avg_questions.toFixed(1),
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white rounded-xl shadow-sm p-4 text-center"
              >
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {kpi.value}
                </p>
                <p className="mt-1 text-xs text-gray-500">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* AI 대면 수업 브리핑 */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900">
              {t("analyticsPro.briefing.heading")}
            </h2>
            <p className="mt-2 text-base font-semibold text-amber-800">
              {result.ai.briefing.approach_title}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {result.ai.briefing.approach_detail}
            </p>
            <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              <span className="font-medium">
                {t("analyticsPro.briefing.openingMove")}:{" "}
              </span>
              {result.ai.briefing.opening_move}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>
                {t("analyticsPro.briefing.recommendedMinutes", {
                  minutes: result.ai.briefing.recommended_minutes,
                })}
              </span>
              {result.ai.briefing.focus_topics.map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>

          {/* 학생별 개인화 솔루션 */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <h2 className="text-sm font-semibold text-gray-900 px-5 pt-5">
              {t("analyticsPro.solutions.heading")}
            </h2>
            <table className="w-full text-sm mt-3">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium text-gray-600">
                    {t("analyticsPro.solutions.colName")}
                  </th>
                  <th className="px-5 py-2 font-medium text-gray-600">
                    {t("analyticsPro.solutions.colLevel")}
                  </th>
                  <th className="px-5 py-2 font-medium text-gray-600">
                    {t("analyticsPro.solutions.colWeakness")}
                  </th>
                  <th className="px-5 py-2 font-medium text-gray-600">
                    {t("analyticsPro.solutions.colAction")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.ai.student_solutions.map((s, i) => (
                  <tr key={`${s.name}-${i}`}>
                    <td className="px-5 py-2 font-medium">{s.name}</td>
                    <td className="px-5 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${levelClass(
                          s.level
                        )}`}
                      >
                        {s.level}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-gray-600">{s.weakness}</td>
                    <td className="px-5 py-2 text-gray-600">{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
