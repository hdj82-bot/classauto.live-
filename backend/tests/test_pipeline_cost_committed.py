"""H: cost_log.record_once_committed — provider cost 가 후속 실패와 무관히 커밋되는지 검증."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch


# ── record_once_committed: 별도 트랜잭션으로 즉시 commit ──────────────────


def _sessionmaker_with(db: MagicMock):
    """SyncSessionLocal() 호출이 db 를 반환하도록 만드는 더블 팩토리."""
    def _factory():
        return db
    return _factory


def test_record_once_committed_commits_immediately():
    """존재하지 않으면 add + commit, idempotency 인덱스로 보호되는 새 행을 작성한다."""
    from app.services.pipeline import cost_log

    db = MagicMock()
    db.execute.return_value.first.return_value = None  # 기존 없음

    ok = cost_log.record_once_committed(
        _sessionmaker_with(db),
        video_render_id=uuid.uuid4(),
        service="elevenlabs",
        operation="tts_synthesize",
        cost_usd=0.0,
        duration_seconds=1.5,
    )

    assert ok is True
    db.add.assert_called_once()
    db.commit.assert_called_once()
    db.close.assert_called_once()


def test_record_once_committed_skips_when_existing():
    """동일 (render_id, operation) 이 있으면 add 호출 없이 idempotent 종료."""
    from app.services.pipeline import cost_log

    db = MagicMock()
    db.execute.return_value.first.return_value = (uuid.uuid4(),)  # 이미 존재

    ok = cost_log.record_once_committed(
        _sessionmaker_with(db),
        video_render_id=uuid.uuid4(),
        service="heygen",
        operation="heygen_submit",
    )

    assert ok is True
    db.add.assert_not_called()
    db.commit.assert_not_called()
    db.close.assert_called_once()


def test_record_once_committed_handles_integrity_error_as_idempotent():
    """동시 race 로 UNIQUE 충돌이 나도 호출자 입장에서는 success 로 보고."""
    from sqlalchemy.exc import IntegrityError
    from app.services.pipeline import cost_log

    db = MagicMock()
    db.execute.return_value.first.return_value = None
    db.commit.side_effect = IntegrityError("dup", {}, Exception("dup"))

    ok = cost_log.record_once_committed(
        _sessionmaker_with(db),
        video_render_id=uuid.uuid4(),
        service="elevenlabs",
        operation="tts_synthesize",
    )

    assert ok is True
    db.rollback.assert_called_once()
    db.close.assert_called_once()


# ── render_slide: TTS 후 S3 실패해도 비용 기록은 살아남음 ─────────────────


def _stub_render(instructor_id):
    from app.models.video_render import RenderStatus
    r = MagicMock()
    r.id = uuid.uuid4()
    r.instructor_id = instructor_id
    r.audio_url = None
    r.heygen_job_id = None
    r.avatar_id = "av-1"
    r.lecture_id = uuid.uuid4()
    r.status = RenderStatus.pending
    return r


def test_render_slide_records_tts_cost_before_s3_upload():
    """TTS 후 S3 가 실패하더라도 record_once_committed 는 한 번 호출되어야 한다 (= 비용 기록 존속)."""
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    owner = uuid.uuid4()
    render = _stub_render(owner)

    main_db = MagicMock()
    main_db.query.return_value.filter.return_value.one.return_value = render

    tts_result = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=2.0)

    # S3 업로드를 일부러 실패시킨다 — 메인 트랜잭션은 rollback / retry 경로로 빠짐.
    with patch.object(render_task, "SyncSessionLocal", return_value=main_db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock, return_value=tts_result), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch(
             "app.services.pipeline.s3.upload_audio_bytes",
             side_effect=RuntimeError("S3 down"),
         ), \
         patch("app.services.pipeline.heygen.create_video", new_callable=AsyncMock) as mock_heygen, \
         patch(
             "app.services.pipeline.cost_log.record_once_committed",
             return_value=True,
         ) as mock_record_committed:
        # apply() 내부에서 retry 가 걸리며 결국 예외 — get(propagate=True) 가 raise.
        outcome = render_task.render_slide.apply(
            args=[str(render.id), "스크립트", str(owner)],
        )

    # 핵심 검증: TTS 비용은 별도 commit 으로 적어도 1번 기록됐다.
    assert mock_record_committed.call_count >= 1
    tts_call = mock_record_committed.call_args_list[0]
    assert tts_call.kwargs.get("operation") == "tts_synthesize" or "tts_synthesize" in tts_call.args
    # HeyGen 은 S3 실패로 도달하지 못했어야 한다.
    mock_heygen.assert_not_called()
    # outcome 자체는 retry 로 실패했어야 한다 (= 메인 트랜잭션은 깨짐).
    assert outcome.failed() or outcome.state == "RETRY"


def test_render_slide_records_heygen_cost_after_create_video():
    """HeyGen 응답 직후 record_once_committed(heygen_submit) 가 호출되어야 한다."""
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    owner = uuid.uuid4()
    render = _stub_render(owner)

    main_db = MagicMock()
    main_db.query.return_value.filter.return_value.one.return_value = render

    tts_result = TTSResult(audio_bytes=b"a", provider="elevenlabs", duration_seconds=1.0)

    with patch.object(render_task, "SyncSessionLocal", return_value=main_db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock, return_value=tts_result), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.pipeline.s3.upload_audio_bytes", return_value="https://s3/x.mp3"), \
         patch(
             "app.services.pipeline.heygen.create_video",
             new_callable=AsyncMock,
             return_value="heygen-1",
         ), \
         patch(
             "app.services.pipeline.cost_log.record_once_committed",
             return_value=True,
         ) as mock_record_committed:
        outcome = render_task.render_slide.apply(
            args=[str(render.id), "스크립트", str(owner)],
        )
        result = outcome.get(propagate=True)

    assert result["heygen_job_id"] == "heygen-1"
    operations = [
        c.kwargs.get("operation") if c.kwargs.get("operation") is not None
        else (c.args[3] if len(c.args) >= 4 else None)
        for c in mock_record_committed.call_args_list
    ]
    assert "tts_synthesize" in operations
    assert "heygen_submit" in operations
