"""아바타 API 테스트 — GET /api/avatars, POST /api/avatars/profile-photo."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import make_auth_header

# HeyGen list_avatars() 가 돌려주는 raw dict (남/여 1개씩).
_FAKE_AVATARS = [
    {
        "avatar_id": "av_m",
        "avatar_name": "James",
        "gender": "male",
        "preview_image_url": "https://hg.example/m.png",
        "preview_video_url": "https://hg.example/m.mp4",
    },
    {
        "avatar_id": "av_f",
        "avatar_name": "Anna",
        "gender": "female",
        "preview_image_url": "https://hg.example/f.png",
        "preview_video_url": "https://hg.example/f.mp4",
    },
]

# JPEG 매직바이트로 시작하는 더미 이미지.
_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _patch_list(avatars=None, error=None):
    if error is not None:
        return patch(
            "app.services.pipeline.heygen.list_avatars",
            new=AsyncMock(side_effect=error),
        )
    return patch(
        "app.services.pipeline.heygen.list_avatars",
        new=AsyncMock(return_value=avatars if avatars is not None else _FAKE_AVATARS),
    )


# ── GET /api/avatars ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_avatars_basic(client, professor):
    with _patch_list():
        resp = await client.get("/api/avatars", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert [a["avatar_id"] for a in data["avatars"]] == ["av_m", "av_f"]
    assert all(a["is_custom"] is False for a in data["avatars"])
    # 동적 샘플용 preview_video_url 이 그대로 흐르는지.
    assert data["avatars"][0]["preview_video_url"] == "https://hg.example/m.mp4"


@pytest.mark.asyncio
async def test_list_avatars_prepends_custom_photo_avatar(client, professor, db):
    professor.photo_avatar_id = "tp_self"
    # 외부(타 버킷) URL → presign passthrough 라 boto3 호출 없음.
    professor.profile_image_url = "https://cdn.example.com/p.png"
    await db.flush()

    with _patch_list():
        resp = await client.get("/api/avatars", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    first = data["avatars"][0]
    assert first["is_custom"] is True
    assert first["avatar_id"] == "tp_self"
    assert "본인" in first["avatar_name"]
    assert first["preview_image_url"] == "https://cdn.example.com/p.png"


@pytest.mark.asyncio
async def test_list_avatars_heygen_down_but_custom_survives(client, professor, db):
    from app.services.pipeline.heygen import HeyGenError

    professor.photo_avatar_id = "tp_self"
    await db.flush()
    with _patch_list(error=HeyGenError("down")):
        resp = await client.get("/api/avatars", headers=make_auth_header(professor))
    # HeyGen 장애여도 본인 아바타는 노출.
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_avatars_heygen_down_no_custom_returns_502(client, professor):
    from app.services.pipeline.heygen import HeyGenError

    with _patch_list(error=HeyGenError("down")):
        resp = await client.get("/api/avatars", headers=make_auth_header(professor))
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_list_avatars_requires_professor(client, student):
    with _patch_list():
        resp = await client.get("/api/avatars", headers=make_auth_header(student))
    assert resp.status_code in (401, 403)


# ── POST /api/avatars/profile-photo ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_profile_photo_ready(client, professor, db):
    with patch(
        "app.services.pipeline.s3.get_s3_client", return_value=MagicMock()
    ), patch(
        "app.services.pipeline.s3.generate_presigned_url",
        return_value="https://signed.example/p.jpg",
    ), patch(
        "app.services.pipeline.heygen.upload_talking_photo",
        new=AsyncMock(return_value="tp_new"),
    ):
        resp = await client.post(
            "/api/avatars/profile-photo",
            headers=make_auth_header(professor),
            files={"file": ("me.jpg", _JPEG, "image/jpeg")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["photo_avatar_id"] == "tp_new"
    assert data["profile_image_url"] == "https://signed.example/p.jpg"

    await db.refresh(professor)
    assert professor.photo_avatar_id == "tp_new"
    assert professor.profile_image_url is not None


@pytest.mark.asyncio
async def test_upload_profile_photo_heygen_fail_keeps_photo(client, professor, db):
    from app.services.pipeline.heygen import HeyGenError

    with patch(
        "app.services.pipeline.s3.get_s3_client", return_value=MagicMock()
    ), patch(
        "app.services.pipeline.s3.generate_presigned_url",
        return_value="https://signed.example/p.jpg",
    ), patch(
        "app.services.pipeline.heygen.upload_talking_photo",
        new=AsyncMock(side_effect=HeyGenError("nope")),
    ):
        resp = await client.post(
            "/api/avatars/profile-photo",
            headers=make_auth_header(professor),
            files={"file": ("me.jpg", _JPEG, "image/jpeg")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "failed"
    assert data["photo_avatar_id"] is None

    await db.refresh(professor)
    # 사진은 저장되고, talking photo 만 미등록.
    assert professor.profile_image_url is not None
    assert professor.photo_avatar_id is None


@pytest.mark.asyncio
async def test_upload_profile_photo_rejects_non_image(client, professor):
    resp = await client.post(
        "/api/avatars/profile-photo",
        headers=make_auth_header(professor),
        files={"file": ("x.txt", b"this is not an image", "text/plain")},
    )
    assert resp.status_code == 400
