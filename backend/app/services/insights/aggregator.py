"""강의별 상호작용 데이터 집계 (보고서 합성의 grounding).

docs/planning/11-analytics-dashboard.md §B~G 의 컴포넌트 데이터를 한 번에 모아
"취약 개념·재시청·딴짓·완주" 신호를 만든다. 이 집계는 두 곳에 쓰인다.
1. Claude 합성(briefing)의 **근거 데이터** — 환각 방지를 위해 여기 없는 수치는
   브리핑이 인용하지 못한다(11 §5).
2. 보고서 응답에 raw evidence 로 함께 내려가 AI 권고 옆에 근거를 노출한다.

집계 산식은 기존 대시보드 서비스(get_scores/get_engagement/get_attendance/
watch heatmap)를 재사용하고, 여기서는 **합성·취약 개념 도출**만 더한다.
"""
from __future__ import annotations

import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment_result import AssessmentResult
from app.models.qa_answer_cache import QAAnswerCache
from app.models.qa_log import QALog
from app.models.session import LearningSession, SessionStatus
from app.services import dashboard as dashboard_svc

# ── 취약 개념 도출 임계값 (베타 — 문서화된 가정, 학기 중 보정) ────────────────
WEAK_ACCURACY_THRESHOLD = 70.0   # 카테고리 정답률이 이 미만이면 취약 후보
MIN_CATEGORY_RESPONSES = 3       # 표본이 이보다 적은 카테고리는 잡음으로 제외
HIGH_DROP_MIN = 2                # 이탈 횟수가 이 이상인 슬라이드는 취약 후보
TOP_WEAK_CONCEPTS = 6            # 보고서에 노출할 상위 취약 개념 수
TOP_REPEATED_QUESTIONS = 5       # 반복 질문 클러스터 상위 수
LOW_PROGRESS_PCT = 50.0          # 개별 신호: 진도 미달 기준
LOW_ACCURACY_PCT = 60.0          # 개별 신호: 저성취 기준
HIGH_WARNING_LEVEL = 2           # 개별 신호: 딴짓 경고 누적 기준
HIGH_NO_RESPONSE = 3             # 개별 신호: 역질문 무반응 기준


async def _qa_aggregate(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """RAG 거부율 + 반복 질문 클러스터 (11 §G, 09 §3 질문 이벤트)."""
    qa_result = await db.execute(select(QALog).where(QALog.lecture_id == lecture_id))
    logs = list(qa_result.scalars().all())
    total = len(logs)
    rejected = [q for q in logs if not q.in_scope]
    rejected_samples = [q.question for q in rejected[:5] if q.question]

    # 반복 질문 클러스터: 우선 qa_answer_cache.cluster_key(임베딩 클러스터, 08 §5)를
    # 사용하고, 없으면 질문 텍스트 정규화 빈도로 폴백.
    clusters: list[dict] = []
    cache_result = await db.execute(
        select(QAAnswerCache).where(QAAnswerCache.lecture_id == lecture_id)
    )
    cache_rows = list(cache_result.scalars().all())
    by_cluster: dict[str, dict] = {}
    for row in cache_rows:
        key = row.cluster_key or str(row.id)
        c = by_cluster.setdefault(
            key, {"representative": row.question_text, "count": 0, "best_hits": -1}
        )
        c["count"] += 1
        # 대표 질문 = 적중 횟수가 가장 많은 질문(투명성 — 가장 많이 겹친 질문).
        if (row.hit_count or 0) > c["best_hits"]:
            c["best_hits"] = row.hit_count or 0
            c["representative"] = row.question_text
    if by_cluster:
        clusters = sorted(
            ({"representative": c["representative"], "count": c["count"]} for c in by_cluster.values()),
            key=lambda x: x["count"],
            reverse=True,
        )[:TOP_REPEATED_QUESTIONS]
    else:
        # 폴백: qa_logs 질문 텍스트 정규화 빈도 (2회 이상만 "반복").
        text_freq: dict[str, dict] = {}
        for q in logs:
            if not q.question:
                continue
            norm = " ".join(q.question.lower().split())
            entry = text_freq.setdefault(norm, {"representative": q.question, "count": 0})
            entry["count"] += 1
        clusters = sorted(
            (v for v in text_freq.values() if v["count"] >= 2),
            key=lambda x: x["count"],
            reverse=True,
        )[:TOP_REPEATED_QUESTIONS]

    return {
        "total": total,
        "rejections": len(rejected),
        "rejection_rate": round(len(rejected) / total * 100, 2) if total else 0.0,
        "rejected_samples": rejected_samples,
        "repeated_clusters": clusters,
    }


async def _attention_aggregate(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """딴짓 경고·무반응·완주율 (11 §B·§D, 09 §3 시청)."""
    result = await db.execute(
        select(LearningSession).where(LearningSession.lecture_id == lecture_id)
    )
    sessions = list(result.scalars().all())
    n = len(sessions)
    if n == 0:
        return {
            "total_students": 0, "completed": 0, "completion_rate": 0.0,
            "avg_progress_pct": 0.0, "total_warnings": 0, "high_warning_students": 0,
            "total_no_response": 0, "avg_warning_level": 0.0,
        }
    completed = sum(1 for s in sessions if s.status == SessionStatus.completed)
    return {
        "total_students": n,
        "completed": completed,
        "completion_rate": round(completed / n * 100, 2),
        "avg_progress_pct": round(sum(s.progress_pct for s in sessions) / n, 2),
        "total_warnings": sum(s.warning_level for s in sessions),
        "high_warning_students": sum(1 for s in sessions if s.warning_level >= HIGH_WARNING_LEVEL),
        "total_no_response": sum(s.no_response_cnt for s in sessions),
        "avg_warning_level": round(sum(s.warning_level for s in sessions) / n, 2),
    }


async def _per_student_signals(
    db: AsyncSession, lecture_id: uuid.UUID, engagement: dict, attendance: dict
) -> list[dict]:
    """학생별 신호(개별 vs 학급 — 11 §E·§H-4). 진도·정답률·딴짓·무반응 종합."""
    # 학생별 정답률 (AssessmentResult).
    acc_rows = await db.execute(
        select(
            AssessmentResult.user_id,
            func.count().label("total"),
            func.sum(cast(AssessmentResult.is_correct, Integer)).label("correct"),
        )
        .where(AssessmentResult.lecture_id == lecture_id)
        .group_by(AssessmentResult.user_id)
    )
    accuracy_by_user: dict[str, float] = {}
    for uid, total, correct in acc_rows:
        if total:
            accuracy_by_user[str(uid)] = round((correct or 0) / total * 100, 2)

    eng_by_user = {s["userId"]: s for s in engagement.get("students", [])}
    out: list[dict] = []
    for st in attendance.get("students", []):
        uid = st["user_id"]
        eng = eng_by_user.get(uid, {})
        accuracy = accuracy_by_user.get(uid)
        signals: list[str] = []
        if st.get("progress_pct", 0) < LOW_PROGRESS_PCT and st.get("status") != "completed":
            signals.append("low_progress")
        if accuracy is not None and accuracy < LOW_ACCURACY_PCT:
            signals.append("low_accuracy")
        if eng.get("noResponseCnt", 0) >= HIGH_NO_RESPONSE:
            signals.append("high_no_response")
        out.append({
            "user_id": uid,
            "name": st.get("name"),
            "student_number": st.get("student_number"),
            "progress_pct": st.get("progress_pct", 0),
            "status": st.get("status"),
            "accuracy": accuracy,
            "qa_count": eng.get("qaCount", 0),
            "no_response_cnt": eng.get("noResponseCnt", 0),
            "signals": signals,
        })
    # 신호가 많은 학생을 앞에(취약 우선 정렬 — 11 §E).
    out.sort(key=lambda s: (len(s["signals"]), -(s["accuracy"] or 100)), reverse=True)
    return out


def _derive_weak_concepts(scores: dict, watch: dict, qa: dict) -> list[dict]:
    """집계 신호 → 상위 취약 개념(근거 데이터 링크 포함, 11 §H-2).

    세 출처를 통합한다:
    - 저정답률 카테고리(quiz)  → kind=quiz_category
    - 고이탈 슬라이드(watch)    → kind=watch_slide
    - 고거부 토픽(qa)          → kind=qa_rejection (거부율이 높으면 자료 갭 신호)
    각 항목은 severity(0~1)와 evidence(원수치)를 갖는다.
    """
    concepts: list[dict] = []

    for cat in scores.get("byCategory", []):
        if cat["total"] >= MIN_CATEGORY_RESPONSES and cat["accuracy"] < WEAK_ACCURACY_THRESHOLD:
            concepts.append({
                "concept": cat["category"],
                "kind": "quiz_category",
                "severity": round(1 - cat["accuracy"] / 100, 3),
                "evidence": {
                    "accuracy": cat["accuracy"],
                    "responses": cat["total"],
                    "correct": cat["correct"],
                },
            })

    for slide in watch.get("slides", []):
        if slide["drops"] >= HIGH_DROP_MIN:
            # 이탈+재시청이 많을수록 심각. 정규화는 단순 비례(베타).
            sev = min(1.0, round((slide["drops"] + slide["replays"]) / 10, 3))
            concepts.append({
                "concept": f"슬라이드 {slide['index'] + 1}",
                "kind": "watch_slide",
                "severity": sev,
                "slide_index": slide["index"],
                "evidence": {
                    "drops": slide["drops"],
                    "replays": slide["replays"],
                    "completionPct": slide["completionPct"],
                },
            })

    if qa.get("rejection_rate", 0) >= 20 and qa.get("rejections", 0) >= MIN_CATEGORY_RESPONSES:
        concepts.append({
            "concept": "강의 자료 범위 밖 반복 질문",
            "kind": "qa_rejection",
            "severity": round(min(1.0, qa["rejection_rate"] / 100), 3),
            "evidence": {
                "rejection_rate": qa["rejection_rate"],
                "rejections": qa["rejections"],
                "samples": qa.get("rejected_samples", [])[:3],
            },
        })

    concepts.sort(key=lambda c: c["severity"], reverse=True)
    return concepts[:TOP_WEAK_CONCEPTS]


async def build_aggregate(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """강의의 모든 상호작용 신호를 한 dict 로 집계한다.

    반환 구조는 보고서 응답(`evidence`)과 Claude grounding 의 단일 진실.
    """
    scores = await dashboard_svc.get_scores(db, lecture_id)
    engagement = await dashboard_svc.get_engagement(db, lecture_id)
    attendance = await dashboard_svc.get_attendance(db, lecture_id)
    watch = await dashboard_svc.get_watch_heatmap(db, lecture_id)
    qa = await _qa_aggregate(db, lecture_id)
    attention = await _attention_aggregate(db, lecture_id)
    students = await _per_student_signals(db, lecture_id, engagement, attendance)
    weak_concepts = _derive_weak_concepts(scores, watch, qa)

    # 재시청/이탈이 큰 상위 슬라이드(브리핑 권고의 대상 슬라이드 후보).
    weakest_slides = sorted(
        watch.get("slides", []),
        key=lambda s: (s["drops"] + s["replays"]),
        reverse=True,
    )[:5]

    return {
        "lecture_id": str(lecture_id),
        "completion": {
            "completion_rate": attention["completion_rate"],
            "total_students": attention["total_students"],
            "completed": attention["completed"],
            "avg_progress_pct": attention["avg_progress_pct"],
        },
        "attention": {
            "total_warnings": attention["total_warnings"],
            "high_warning_students": attention["high_warning_students"],
            "total_no_response": attention["total_no_response"],
            "avg_warning_level": attention["avg_warning_level"],
        },
        "quiz": {
            "overall_accuracy": scores.get("overallAccuracy", 0),
            "total_questions": scores.get("totalQuestions", 0),
            "by_category": scores.get("byCategory", []),
            "wrong_top": scores.get("wrongAnswerTop", [])[:5],
        },
        "qa": qa,
        "watch": {"slides": watch.get("slides", []), "weakest_slides": weakest_slides},
        "weak_concepts": weak_concepts,
        "students": students,
    }
