"""교수자 Q&A 사전 질문(instructor_seed) 서비스 단위 테스트.

검증 핵심(qa_avatar.upsert_seed_questions / list_seed_questions):
- 새 질문 추가 → instructor_seed · pending 행 생성.
- 텍스트가 같은 기존 행은 보존(이미 렌더된 status/클립 재렌더 없이 유지).
- 목록에서 빠진 질문은 삭제.
- 정규화: 공백 trim · 빈값 제외 · 중복 제거 · 최대 SEED_QUESTIONS_MAX(3) 상한.
- 학생 적립 행(origin=student)은 절대 건드리지 않음.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_answer_cache import QAAnswerCache
from app.models.user import User, UserRole
from app.services.pipeline import qa_avatar
from tests.conftest import _patch_jsonb_columns


@pytest.fixture
def sync_db():
    _patch_jsonb_columns()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def _seed_lecture(db) -> tuple[User, Course, Lecture]:
    prof = User(
        id=uuid.uuid4(), google_sub=f"g-{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:6]}@t.ac.kr", name="교수", role=UserRole.professor,
        is_active=True,
    )
    db.add(prof)
    db.flush()
    course = Course(id=uuid.uuid4(), instructor_id=prof.id, title="강좌")
    db.add(course)
    db.flush()
    lec = Lecture(
        id=uuid.uuid4(), course_id=course.id, title="강의",
        slug=f"slug-{uuid.uuid4().hex}", order=1, pipeline_task_id="task-1",
    )
    db.add(lec)
    db.flush()
    return prof, course, lec


def _seed_rows(db, lec):
    return qa_avatar.list_seed_questions(db, lec.id)


# ── 추가 ──────────────────────────────────────────────────────────────────────


def test_upsert_creates_pending_seed_rows(sync_db):
    prof, _, lec = _seed_lecture(sync_db)
    rows = qa_avatar.upsert_seed_questions(
        sync_db, lec.id, prof.id, ["문법 차이가 뭔가요?", "어순은 어떻게 다른가요?"]
    )
    assert len(rows) == 2
    for r in rows:
        assert r.origin == qa_avatar.ORIGIN_SEED
        assert r.status == qa_avatar.STATUS_PENDING
        assert r.answer_text is None
        assert r.question_embedding is None
        assert r.instructor_id == prof.id


def test_list_excludes_student_rows(sync_db):
    prof, _, lec = _seed_lecture(sync_db)
    # 학생 적립 행은 list_seed_questions 에 잡히면 안 된다.
    sync_db.add(QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id, question_text="학생질문",
        status=qa_avatar.STATUS_PENDING, origin=qa_avatar.ORIGIN_STUDENT,
    ))
    sync_db.flush()
    qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, ["A", "B"])
    rows = _seed_rows(sync_db, lec)
    # 정렬 보조키가 uuid 라 순서는 비결정적 — 내용(집합)으로 검증.
    assert {r.question_text for r in rows} == {"A", "B"}


# ── 보존 ──────────────────────────────────────────────────────────────────────


def test_upsert_preserves_matching_rows(sync_db):
    prof, _, lec = _seed_lecture(sync_db)
    first = qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, ["A", "B"])
    keep = next(r for r in first if r.question_text == "A")
    # "A" 가 이미 렌더 완료됐다고 가정.
    keep.status = qa_avatar.STATUS_READY
    keep.s3_video_url = "s3://clip/a.mp4"
    sync_db.flush()
    kept_id = keep.id

    # "A" 유지 + "C" 추가, "B" 제거.
    after = qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, ["A", "C"])
    by_text = {r.question_text: r for r in after}
    assert set(by_text) == {"A", "C"}
    # 보존된 "A" 는 동일 행(재렌더 없음) — id·status·클립 유지.
    assert by_text["A"].id == kept_id
    assert by_text["A"].status == qa_avatar.STATUS_READY
    assert by_text["A"].s3_video_url == "s3://clip/a.mp4"
    # 새 "C" 는 pending.
    assert by_text["C"].status == qa_avatar.STATUS_PENDING


# ── 삭제 ──────────────────────────────────────────────────────────────────────


def test_upsert_deletes_removed_and_empty_clears_all(sync_db):
    prof, _, lec = _seed_lecture(sync_db)
    qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, ["A", "B", "C"])
    qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, ["B"])
    assert [r.question_text for r in _seed_rows(sync_db, lec)] == ["B"]
    # 빈 목록 → 전부 삭제.
    qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, [])
    assert _seed_rows(sync_db, lec) == []


# ── 정규화 ────────────────────────────────────────────────────────────────────


def test_upsert_trims_dedups_and_caps(sync_db):
    prof, _, lec = _seed_lecture(sync_db)
    rows = qa_avatar.upsert_seed_questions(
        sync_db, lec.id, prof.id,
        ["  공백  ", "공백", "", "   ", "Q1", "Q2", "Q3", "Q4"],
    )
    texts = {r.question_text for r in rows}
    # "  공백  " → "공백" 으로 trim 되어 두 번째 "공백" 과 중복 제거. 빈/공백 제외.
    # 정규화 후 앞에서부터 상한 SEED_QUESTIONS_MAX(3) 만 채택 → {공백, Q1, Q2}.
    assert len(rows) == qa_avatar.SEED_QUESTIONS_MAX == 3
    assert texts == {"공백", "Q1", "Q2"}


def test_student_rows_untouched_by_upsert(sync_db):
    prof, _, lec = _seed_lecture(sync_db)
    student = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id, question_text="학생질문",
        status=qa_avatar.STATUS_PENDING, origin=qa_avatar.ORIGIN_STUDENT,
    )
    sync_db.add(student)
    sync_db.flush()
    sid = student.id
    qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, ["A"])
    qa_avatar.upsert_seed_questions(sync_db, lec.id, prof.id, [])  # seed 전부 삭제
    # 학생 행은 그대로 존재.
    survivor = sync_db.get(QAAnswerCache, sid)
    assert survivor is not None
    assert survivor.origin == qa_avatar.ORIGIN_STUDENT
