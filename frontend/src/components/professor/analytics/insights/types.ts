/**
 * 백엔드 `GET /api/v1/insights/{lecture_id}/report` 응답 모양.
 * `backend/app/api/v1/insights.py` + `services/insights/*` 의 dict 반환을 거울링.
 */

export interface WeakConcept {
  concept: string;
  why?: string;
  severity?: number;
  evidence?: Record<string, unknown>;
}

export interface Recommendation {
  type: string;
  focus: string;
  activity: string;
  rationale: string;
  target_slides: number[];
  target_students: string[];
}

export interface IndividualSignal {
  student: string;
  signal: string;
  suggestion: string;
}

export interface BriefingPayload {
  summary: string[];
  weak_concepts: WeakConcept[];
  recommendations: Recommendation[];
  class_vs_individual: {
    class_signals: string[];
    individual_signals: IndividualSignal[];
  };
}

export interface Briefing {
  id: string;
  week_no: number | null;
  model: string;
  is_ai_generated: boolean;
  generated_at: string | null;
  payload: BriefingPayload;
  source_window: Record<string, unknown> | null;
}

/** 집계 근거(evidence) — aggregator.build_aggregate 와 동일 구조(필요 필드만). */
export interface ReportEvidence {
  completion: {
    completion_rate: number;
    total_students: number;
    completed: number;
    avg_progress_pct: number;
  };
  attention: {
    total_warnings: number;
    high_warning_students: number;
    total_no_response: number;
    avg_warning_level: number;
  };
  quiz: {
    overall_accuracy: number;
    total_questions: number;
  };
  qa: { total: number; rejections: number; rejection_rate: number };
  weak_concepts: (WeakConcept & { kind?: string })[];
}

export interface InsightsReport {
  lecture_id: string;
  briefing: Briefing;
  evidence: ReportEvidence;
}
