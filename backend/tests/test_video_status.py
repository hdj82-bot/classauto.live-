"""finalize_video_if_all_ready 단위 테스트 (Video rendering→done 전환)."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.video import Video, VideoStatus
from app.models.video_render import RenderStatus, VideoRender
from app.services.video_status import finalize_video_if_all_ready
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


def _render(db, lecture_id, status, slide_number=0) -> VideoRender:
    r = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture_id,
        instructor_id=uuid.uuid4(),
        avatar_id="",
        tts_provider="elevenlabs",
        status=status,
        slide_number=slide_number,
    )
    db.add(r)
    db.flush()
    return r


def _video(db, lecture_id, status=VideoStatus.rendering) -> Video:
    v = Video(id=uuid.uuid4(), lecture_id=lecture_id, status=status)
    db.add(v)
    db.flush()
    return v


def test_finalize_flips_when_all_renders_ready(sync_db):
    lec = uuid.uuid4()
    v = _video(sync_db, lec)
    _render(sync_db, lec, RenderStatus.ready, 0)
    _render(sync_db, lec, RenderStatus.ready, 1)
    sync_db.commit()

    assert finalize_video_if_all_ready(sync_db, lec) is True
    sync_db.refresh(v)
    assert v.status == VideoStatus.done


def test_finalize_keeps_rendering_when_one_pending(sync_db):
    lec = uuid.uuid4()
    v = _video(sync_db, lec)
    _render(sync_db, lec, RenderStatus.ready, 0)
    _render(sync_db, lec, RenderStatus.tts_processing, 1)  # 아직 진행 중
    sync_db.commit()

    assert finalize_video_if_all_ready(sync_db, lec) is False
    sync_db.refresh(v)
    assert v.status == VideoStatus.rendering


def test_finalize_noop_when_no_renders(sync_db):
    lec = uuid.uuid4()
    v = _video(sync_db, lec)
    sync_db.commit()

    assert finalize_video_if_all_ready(sync_db, lec) is False
    sync_db.refresh(v)
    assert v.status == VideoStatus.rendering


def test_finalize_idempotent_when_already_done(sync_db):
    lec = uuid.uuid4()
    v = _video(sync_db, lec, status=VideoStatus.done)
    _render(sync_db, lec, RenderStatus.ready, 0)
    sync_db.commit()

    # 이미 done 이면 전환 대상(rendering)이 없으므로 False, 상태 유지.
    assert finalize_video_if_all_ready(sync_db, lec) is False
    sync_db.refresh(v)
    assert v.status == VideoStatus.done
