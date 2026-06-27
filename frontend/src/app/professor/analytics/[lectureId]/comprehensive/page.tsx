"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";

// 학기 전체 분석(B블록 §3) 기능 화면 — docs/planning/analytics-spec.md.
// 강의 분석 페이지의 "종합보고서"에서 진입. /api/v1/analytics-pro/semester/* (#536)
// 3종(trend·survey·review)을 호출해 추이·설문·총평을 렌더한다. 6월 범위(§5)는
// 백엔드가 합성 데이터로 응답하며, 접근은 require_analytics_pro(베타 토글) 게이트.
// 권한 없으면 403 → 안내 패널(에러 토스트 아님).

interface Timeline {
  semester_weeks: number;
  current_week: number;
  trigger_week: number;
  deadline_week: number;
  is_open: boolean;
  is_past_deadline: boolean;
}
interface WeeklyMetric {
  week: number;
  completion_rate: number;
  avg_understanding: number;
  engagement: number;
}
interface Trend {
  weeks: WeeklyMetric[];
  completion_delta: number;
  understanding_delta: number;
  engagement_delta: number;
  timeline: Timeline;
}
interface SurveyQ {
  no: number;
  text: string;
  scale: string;
  rationale: string;
  reference: { citation: string; doi: string };
}
interface SurveyResults {
  survey: { warning: string; questions: SurveyQ[]; source: string };
  responses: { no: number; text: string; dist: number[]; average: number }[];
}
interface Paper {
  title: string;
  direction: string;
  method: string;
}
interface Review {
  overview: string;
  theory_lens: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  paper_suggestions: Paper[];
  source: string;
}
interface Report {
  trend: Trend;
  survey: SurveyResults;
  review: Review;
}

const W = 320;
const H = 120;
const SCALE_COLORS = ["#DC2626", "#F59E0B", "#FACC15", "#84CC16", "#16A34A"];

function poly(vals: number[]): string {
  const n = vals.length;
  if (n === 0) return "";
  return vals
    .map((v, i) => {
      const x = n === 1 ? 0 : (i / (n - 1)) * W;
      const y = H - (v / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const COPY = {
  ko: {
    eyebrow: "종합보고서 · 학기 전체 분석",
    title: "학기 종합보고서",
    subtitle:
      "한 학기 학습 데이터를 모아 주차별 추이·학기말 설문·학기 총평을 자동으로 정리합니다. (베타: 예시 데이터로 검증)",
    back: "← 강의 분석으로",
    form: {
      subject: "과목",
      field: "분야",
      axes: "취약 개념 축 (쉼표로 구분)",
      axesHint: "예: 오개념, 공식 적용 오류",
      weeks: "학기 총 주차",
      week: "현재 주차",
      generate: "종합보고서 생성",
      generating: "생성 중...",
      incomplete: "과목·분야·취약 개념 축을 모두 입력하세요.",
      failed: "보고서 생성에 실패했습니다. 잠시 후 다시 시도하세요.",
    },
    gated: {
      title: "학습 분석 PRO 베타 권한이 필요합니다",
      body: "이 기능은 베타테스터 전용입니다. 운영자에게 활성화를 요청하세요.",
    },
    timeline: {
      open: "종합분석 열림 (10주차 이후)",
      notYet: "10주차부터 열립니다",
      deadline: "분석 마감",
      week: "주차",
    },
    trend: { title: "주차별 학습효율 추이", delta: "1주 대비", completion: "완주율", understanding: "평균 이해도", engagement: "대면 참여도" },
    survey: { title: "학기말 설문 자동생성", scale: "척도", rationale: "설계 근거", ref: "참고문헌", doiMissing: "(DOI 미확인 — 교수자 확인)" },
    dist: { title: "응답 결과 시각화", avg: "평균" },
    review: { title: "학기 총평", pro: "PRO", lens: "이론 렌즈", strengths: "강점", weaknesses: "보완점", improvements: "개선 제안", papers: "논문 제목·방향 제안", direction: "주장 방향", method: "권장 방법" },
    source: { ai: "AI 생성", fallback: "규칙 기반" },
  },
  en: {
    eyebrow: "Comprehensive report · Whole-semester analysis",
    title: "Semester comprehensive report",
    subtitle:
      "Gathers a semester of learning data into weekly trends, an end-of-term survey, and a review. (Beta: validated on example data)",
    back: "← Back to analytics",
    form: {
      subject: "Subject",
      field: "Field",
      axes: "Weakness axes (comma-separated)",
      axesHint: "e.g. misconceptions, formula errors",
      weeks: "Total weeks",
      week: "Current week",
      generate: "Generate report",
      generating: "Generating...",
      incomplete: "Enter subject, field, and weakness axes.",
      failed: "Failed to generate. Please try again shortly.",
    },
    gated: {
      title: "Analytics PRO beta access required",
      body: "This feature is for beta testers only. Ask an operator to enable it.",
    },
    timeline: {
      open: "Comprehensive analysis open (after week 10)",
      notYet: "Opens from week 10",
      deadline: "Deadline",
      week: "wk",
    },
    trend: { title: "Weekly learning-efficiency trend", delta: "vs. wk 1", completion: "Completion", understanding: "Understanding", engagement: "Engagement" },
    survey: { title: "Auto-generated end-of-term survey", scale: "Scale", rationale: "Rationale", ref: "Reference", doiMissing: "(DOI unverified — confirm)" },
    dist: { title: "Response visualization", avg: "Avg" },
    review: { title: "Semester review", pro: "PRO", lens: "Lens", strengths: "Strengths", weaknesses: "To improve", improvements: "Suggestions", papers: "Suggested paper titles & directions", direction: "Direction", method: "Method" },
    source: { ai: "AI", fallback: "Rule-based" },
  },
};

export default function ComprehensiveReportPage() {
  const { locale } = useI18n();
  const { toast } = useToast();
  const params = useParams();
  const lectureId = String(params?.lectureId ?? "");
  const c = COPY[locale] ?? COPY.ko;

  const [subject, setSubject] = useState("");
  const [field, setField] = useState("");
  const [axesText, setAxesText] = useState("");
  const [weeks, setWeeks] = useState(16);
  const [week, setWeek] = useState(14);

  const [loading, setLoading] = useState(false);
  const [gated, setGated] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const handleGenerate = async () => {
    const axes = axesText.split(",").map((s) => s.trim()).filter(Boolean);
    if (!subject.trim() || !field.trim() || axes.length === 0) {
      toast(c.form.incomplete, "error");
      return;
    }
    const course = { subject, field, weakness_axes: axes };
    const profile = { course, semester_weeks: weeks, current_week: week, enrolled: 40 };
    setLoading(true);
    setGated(false);
    try {
      const [trendRes, surveyRes, reviewRes] = await Promise.all([
        api.post<Trend>("/api/v1/analytics-pro/semester/trend", { profile, seed: 1 }),
        api.post<SurveyResults>("/api/v1/analytics-pro/semester/survey", { course_profile: course }),
        api.post<Review>("/api/v1/analytics-pro/semester/review", { profile, seed: 1 }),
      ]);
      setReport({ trend: trendRes.data, survey: surveyRes.data, review: reviewRes.data });
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 403) {
        setGated(true);
        setReport(null);
      } else {
        toast(c.form.failed, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const sourceBadge = (src: string) => (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
        src === "claude" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {src === "claude" ? c.source.ai : c.source.fallback}
    </span>
  );

  return (
    <div className="max-w-5xl">
      <Link
        href={`/professor/analytics/${lectureId}`}
        className="text-xs text-[var(--gold-on-light,#B88308)] hover:underline"
      >
        {c.back}
      </Link>
      <div className="mt-2 mb-6">
        <p className="text-xs font-semibold tracking-widest text-amber-700">{c.eyebrow}</p>
        <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{c.subtitle}</p>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cr-subject" className="block text-xs font-medium text-gray-600 mb-1">{c.form.subject}</label>
            <input id="cr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="cr-field" className="block text-xs font-medium text-gray-600 mb-1">{c.form.field}</label>
            <input id="cr-field" value={field} onChange={(e) => setField(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="cr-axes" className="block text-xs font-medium text-gray-600 mb-1">{c.form.axes}</label>
          <input id="cr-axes" value={axesText} onChange={(e) => setAxesText(e.target.value)} placeholder={c.form.axesHint} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cr-weeks" className="block text-xs font-medium text-gray-600 mb-1">{c.form.weeks}</label>
            <input id="cr-weeks" type="number" min={2} max={24} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="cr-week" className="block text-xs font-medium text-gray-600 mb-1">{c.form.week}</label>
            <input id="cr-week" type="number" min={1} max={24} value={week} onChange={(e) => setWeek(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-5">
          <button onClick={handleGenerate} disabled={loading} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
            {loading ? c.form.generating : c.form.generate}
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner fullScreen={false} label={c.form.generating} />}

      {gated && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800" role="alert">
          <p className="font-medium">{c.gated.title}</p>
          <p className="mt-1">{c.gated.body}</p>
        </div>
      )}

      {report && !loading && (
        <div className="space-y-6">
          {/* 타임라인 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded font-medium ${report.trend.timeline.is_open ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {report.trend.timeline.is_open ? c.timeline.open : c.timeline.notYet}
            </span>
            <span className="text-gray-400">
              {c.timeline.deadline}: {report.trend.timeline.deadline_week}{c.timeline.week}
            </span>
          </div>

          {/* (a) 주차별 추이 */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{c.trend.title}</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: c.trend.completion, delta: report.trend.completion_delta, color: "#16A34A", key: "completion_rate" as const },
                { label: c.trend.understanding, delta: report.trend.understanding_delta, color: "#B88308", key: "avg_understanding" as const },
                { label: c.trend.engagement, delta: report.trend.engagement_delta, color: "#2563EB", key: "engagement" as const },
              ].map((m) => (
                <div key={m.key} className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                    <span className="text-xs text-gray-500">{m.label}</span>
                  </div>
                  <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">
                    {m.delta >= 0 ? "+" : ""}{m.delta.toFixed(1)}<span className="text-xs font-medium text-gray-400">%p</span>
                  </p>
                  <p className="text-[11px] text-gray-400">{c.trend.delta}</p>
                </div>
              ))}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img" aria-label={c.trend.title}>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={0} y1={H * g} x2={W} y2={H * g} stroke="#eee" strokeWidth={1} />
              ))}
              {[
                { key: "completion_rate" as const, color: "#16A34A" },
                { key: "avg_understanding" as const, color: "#B88308" },
                { key: "engagement" as const, color: "#2563EB" },
              ].map((s) => (
                <polyline key={s.key} points={poly(report.trend.weeks.map((w) => w[s.key]))} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </svg>
          </div>

          {/* (b) 설문 */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-gray-900">{c.survey.title}</h2>
              {sourceBadge(report.survey.survey.source)}
            </div>
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" role="note">
              {report.survey.survey.warning}
            </div>
            <div className="space-y-3">
              {report.survey.survey.questions.map((q) => (
                <div key={q.no} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-bold text-amber-700">Q{q.no}</span>
                    <p className="text-sm font-medium text-gray-900">{q.text}</p>
                  </div>
                  <p className="mt-1 ml-6 text-[10px] inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.survey.scale}: {q.scale}</p>
                  <p className="mt-2 ml-6 text-xs text-gray-600"><span className="font-semibold text-gray-500">{c.survey.rationale}: </span>{q.rationale}</p>
                  <p className="mt-1 ml-6 text-[11px] text-gray-400">
                    <span className="font-semibold">{c.survey.ref}: </span>
                    {q.reference.citation}
                    {q.reference.doi ? ` · DOI: ${q.reference.doi}` : ` · ${c.survey.doiMissing}`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* (c) 응답 분포 */}
          {report.survey.responses.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{c.dist.title}</h2>
              <div className="space-y-4">
                {report.survey.responses.map((d) => {
                  const total = d.dist.reduce((a, b) => a + b, 0) || 1;
                  return (
                    <div key={d.no}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-500">Q{d.no}</span>
                        <span className="text-xs text-gray-400">{c.dist.avg} {d.average.toFixed(1)}</span>
                      </div>
                      <div className="flex gap-1 h-6 rounded overflow-hidden">
                        {d.dist.map((count, i) => (
                          <div key={i} className="flex items-center justify-center text-[10px] text-white" style={{ width: `${(count / total) * 100}%`, background: SCALE_COLORS[i], minWidth: count ? 18 : 0 }} title={`${i + 1}: ${count}`}>
                            {count || ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* (d) 학기 총평 [PRO] */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-gray-900">{c.review.title}</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white">{c.review.pro}</span>
              {sourceBadge(report.review.source)}
            </div>
            <p className="text-sm text-gray-700 mt-2">{report.review.overview}</p>
            <p className="text-xs text-amber-700 mt-1">{c.review.lens}: {report.review.theory_lens}</p>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              {[
                { label: c.review.strengths, items: report.review.strengths, color: "text-green-700" },
                { label: c.review.weaknesses, items: report.review.weaknesses, color: "text-red-700" },
                { label: c.review.improvements, items: report.review.improvements, color: "text-amber-700" },
              ].map((col) => (
                <div key={col.label} className="rounded-xl bg-gray-50 p-3">
                  <p className={`text-xs font-bold mb-2 ${col.color}`}>{col.label}</p>
                  <ul className="space-y-1">
                    {col.items.map((it, i) => (
                      <li key={i} className="text-xs text-gray-600 leading-snug">· {it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-gray-900 mt-5 mb-2">{c.review.papers}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {report.review.paper_suggestions.map((p, i) => (
                <div key={i} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-900">{p.title}</p>
                  <p className="mt-1 text-xs text-gray-600"><span className="font-semibold text-gray-500">{c.review.direction}: </span>{p.direction}</p>
                  <p className="mt-0.5 text-xs text-gray-600"><span className="font-semibold text-gray-500">{c.review.method}: </span>{p.method}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
