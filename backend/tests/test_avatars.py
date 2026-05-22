"""아바타 API 테스트 — GET /api/avatars, POST /api/avatars/profile-photo."""
from contextlib import contextmanager
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


@contextmanager
def _patch_list(avatars=None, error=None):
    """list_avatars 를 모킹하고, 동시에 큐레이션 allowlist 를 비워(전체 통과)
    엔드포인트 합성 로직만 검증한다 — 실제 CURATED_AVATAR_NAMES 값과 무관하게
    안정적으로 동작. 큐레이션 자체는 별도 curate_avatars 단위 테스트가 다룬다."""
    import app.api.v1.avatars as avmod

    if error is not None:
        list_patch = patch(
            "app.services.pipeline.heygen.list_avatars",
            new=AsyncMock(side_effect=error),
        )
    else:
        list_patch = patch(
            "app.services.pipeline.heygen.list_avatars",
            new=AsyncMock(
                return_value=avatars if avatars is not None else _FAKE_AVATARS
            ),
        )
    with list_patch, patch.object(avmod, "CURATED_AVATAR_NAMES", []):
        yield


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


# ── 큐레이션 allowlist ────────────────────────────────────────────────────────


def _meta(avatar_id: str, name: str, gender: str = "male"):
    from app.schemas.avatar import AvatarMeta

    return AvatarMeta(
        avatar_id=avatar_id,
        avatar_name=name,
        gender=gender,
        preview_image_url=None,
        preview_video_url=None,
        is_custom=False,
    )


def test_curate_avatars_passthrough_when_empty():
    import app.api.v1.avatars as mod

    items = [_meta("a", "Edward"), _meta("b", "Anna", "female")]
    with patch.object(mod, "CURATED_AVATAR_NAMES", []):
        out = mod.curate_avatars(items)
    assert [a.avatar_id for a in out] == ["a", "b"]


def test_curate_avatars_filters_and_orders_by_allowlist():
    import app.api.v1.avatars as mod

    items = [
        _meta("m1", "Edward in Black suit"),
        _meta("m2", "Florin Maintain Sitting"),  # 제복 — 미지목
        _meta("f1", "Anna", "female"),
        _meta("m3", "Edward in Blue suit"),
    ]
    # "Anna" 를 먼저 지목 → 순서가 allowlist 순서를 따른다. "Edward" 는 두 변형 매칭.
    with patch.object(mod, "CURATED_AVATAR_NAMES", ["Anna", "Edward"]):
        out = mod.curate_avatars(items)
    assert [a.avatar_id for a in out] == ["f1", "m1", "m3"]


def test_curate_avatars_substring_match_handles_truncated_names():
    import app.api.v1.avatars as mod

    items = [_meta("x", "Esmond in Blue blazer"), _meta("y", "Diran iPad Sitting")]
    # UI 에서 잘린 접두만 줘도 부분일치로 잡힌다.
    with patch.object(mod, "CURATED_AVATAR_NAMES", ["esmond", "Diran iPad"]):
        out = mod.curate_avatars(items)
    assert [a.avatar_id for a in out] == ["x", "y"]


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
