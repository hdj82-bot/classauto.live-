"""슬라이드쇼 렌더 완료 → Video done 전환 통합 회귀 가드 (#343).

배경: 본문 렌더가 슬라이드쇼 모드(프로덕션 기본, ``LECTURE_BODY_PROVIDER=slideshow``)
로 끝날 때, ``render_slide`` 는 마지막에 ``finalize_video_if_all_ready`` 를 호출해
강의의 모든 VideoRender 가 ready 면 부모 Video 를 rendering→done 으로 전환해야 한다.
이 호출이 빠지면(과거 회귀, #343) Video 가 영구 ``rendering`` 에 갇혀 재-approve 시 409
가 나고 학생에게도 노출되지 않는다.

``test_pipeline_render_idempotency.py`` 의 slideshow 테스트는 HeyGen 미호출·status=ready
까지만 검증한다. 본 파일은 그 다음 단계 — **done 전환 wiring 자체가 살아 있는지** — 를
별도 가드로 고정한다.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

from app.models.video_render import RenderStatus
from app.services.pipeline.tts import TTSResult
from tests.test_pipeline_render_idempotency import (
    _apply_render_slide,
    _patch_db_to_return,
    _stub_render,
)


def test_slideshow_render_invokes_video_done_transition():
    """slideshow 모드 렌더 완료 시 finalize_video_if_all_ready 가 강의 id 로 호출된다.

    이 호출이 제거되면 Video 가 rendering 에 고착되는 #343 회귀가 재발하므로,
    "호출 자체"를 회귀 가드로 고정한다(전환 결과는 test_video_status.py 가 검증).
    """
    owner = uuid.uuid4()
    lecture_id = uuid.uuid4()
    render = _stub_render(instructor_id=owner, lecture_id=lecture_id)
    db = _patch_db_to_return(render)

    tts_result = TTSResult(
        audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0,
    )

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "slideshow"), \
         patch("app.tasks.render.SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock,
               return_value=tts_result), \
         patch("app.services.pipeline.heygen.create_video",
               new_callable=AsyncMock) as mock_heygen, \
         patch("app.services.pipeline.s3.upload_audio_bytes",
               return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed",
               return_value=True), \
         patch("app.services.video_status.finalize_video_if_all_ready",
               return_value=True) as mock_finalize:
        outcome = _apply_render_slide(str(render.id), "안녕", str(owner))
        result = outcome.get(propagate=True)

    assert result.get("mode") == "slideshow"
    mock_heygen.assert_not_called()
    assert render.status == RenderStatus.ready
    # 핵심 가드: done 전환 헬퍼가 이 강의에 대해 호출됐는지.
    mock_finalize.assert_called_once()
    called_lecture_id = mock_finalize.call_args[0][1]
    assert called_lecture_id == lecture_id


def test_slideshow_render_done_transition_failure_does_not_break_render():
    """finalize 가 예외를 던져도 렌더는 성공(slideshow)으로 끝난다.

    render.py 는 finalize 호출을 try/except 로 감싸 "전환 실패가 렌더 성공을
    막지 않게" 한다. 이 graceful 처리가 유지되는지 고정한다.
    """
    owner = uuid.uuid4()
    render = _stub_render(instructor_id=owner, lecture_id=uuid.uuid4())
    db = _patch_db_to_return(render)

    tts_result = TTSResult(
        audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0,
    )

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "slideshow"), \
         patch("app.tasks.render.SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock,
               return_value=tts_result), \
         patch("app.services.pipeline.heygen.create_video",
               new_callable=AsyncMock), \
         patch("app.services.pipeline.s3.upload_audio_bytes",
               return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed",
               return_value=True), \
         patch("app.services.video_status.finalize_video_if_all_ready",
               side_effect=RuntimeError("db down")):
        outcome = _apply_render_slide(str(render.id), "안녕", str(owner))
        result = outcome.get(propagate=True)

    # 전환 실패에도 렌더 자체는 slideshow 성공으로 종료.
    assert result.get("mode") == "slideshow"
    assert render.status == RenderStatus.ready
