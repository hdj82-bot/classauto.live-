"""번역 API 통합 테스트."""
import uuid
from unittest.mock import patch, MagicMock

import pytest

from app.models.translation import ScriptTranslation
from app.models.video import Video, VideoScript, VideoStatus
from tests.conftest import make_auth_header


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

async def _create_video_with_script(db, lecture, professor):
    """스크립트가 있는 영상 생성."""
    video = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.pending_review,
    )
    db.add(video)
    await db.flush()

    script = VideoScript(
        id=uuid.uuid4(),
        video_id=video.id,
        ai_segments=[{"slide_index": 0, "text": "안녕하세요"}],
        segments=[{"slide_index": 0, "text": "안녕하세요"}],
    )
    db.add(script)
    await db.flush()
    return video


# ── 번역 요청 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_translate_video_script(client, professor, lecture, db):
    video = await _create_video_with_script(db, lecture, professor)

    mock_translated = MagicMock()
    mock_translated.text = "Hello"

    with patch("app.api.v1.translate.translate_text", return_value=mock_translated):
        resp = await client.post(
            f"/api/v1/translate/{video.id}",
            params={"target_lang": "en"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "en"
    assert data["status"] == "completed"


@pytest.mark.asyncio
async def test_translate_duplicate_rejected(client, professor, lecture, db):
    video = await _create_video_with_script(db, lecture, professor)

    # 기존 번역 추가
    db.add(ScriptTranslation(
        id=uuid.uuid4(),
        video_id=video.id,
        language="en",
        content="Hello",
        provider="deepl",
    ))
    await db.flush()

    resp = await client.post(
        f"/api/v1/translate/{video.id}",
        params={"target_lang": "en"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_translate_video_not_found(client, professor):
    resp = await client.post(
        f"/api/v1/translate/{uuid.uuid4()}",
        params={"target_lang": "en"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_translate_student_forbidden(client, student, lecture, db):
    video = await _create_video_with_script(db, lecture, student)

    resp = await client.post(
        f"/api/v1/translate/{video.id}",
        params={"target_lang": "en"},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


# ── 번역 목록 조회 ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_translations_empty(client, professor, lecture, db):
    video = await _create_video_with_script(db, lecture, professor)

    resp = await client.get(
        f"/api/v1/translate/{video.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_translations_with_data(client, professor, lecture, db):
    video = await _create_video_with_script(db, lecture, professor)

    for lang in ["en", "ja", "zh"]:
        db.add(ScriptTranslation(
            id=uuid.uuid4(),
            video_id=video.id,
            language=lang,
            content=f"translated_{lang}",
            provider="deepl",
        ))
    await db.flush()

    resp = await client.get(
        f"/api/v1/translate/{video.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 3
