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
async def test_upload_new_photo_clears_stale_preview(client, professor, db):
    # 이미 만들어 둔 미리보기 캐시가 있는 상태에서 새 사진 업로드 →
    # 옛 얼굴 미리보기는 무효화되어야 한다(다음 조회 시 재생성 유도).
    professor.photo_avatar_preview_url = "https://b.s3/old.mp4"
    professor.photo_avatar_preview_video_id = None
    professor.photo_avatar_preview_voice_id = "old_voice"
    await db.flush()

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
    assert resp.json()["status"] == "ready"

    await db.refresh(professor)
    assert professor.photo_avatar_id == "tp_new"
    # 캐시 3종 모두 비워졌는지.
    assert professor.photo_avatar_preview_url is None
    assert professor.photo_avatar_preview_video_id is None
    assert professor.photo_avatar_preview_voice_id is None


@pytest.mark.asyncio
async def test_upload_profile_photo_rejects_non_image(client, professor):
    resp = await client.post(
        "/api/avatars/profile-photo",
        headers=make_auth_header(professor),
        files={"file": ("x.txt", b"this is not an image", "text/plain")},
    )
    assert resp.status_code == 400


# ── 본인 아바타 "움직이는 미리보기" (POST/GET /api/avatars/me/preview) ──────────


@pytest.mark.asyncio
async def test_preview_requires_custom_avatar(client, professor):
    # photo_avatar_id 없음 → 400.
    resp = await client.post(
        "/api/avatars/me/preview",
        headers=make_auth_header(professor),
        json={},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_preview_starts_render(client, professor, db):
    professor.photo_avatar_id = "tp_self"
    await db.flush()

    tts_result = MagicMock(audio_bytes=b"audio")
    with patch(
        "app.services.pipeline.tts.synthesize",
        new=AsyncMock(return_value=tts_result),
    ), patch(
        "app.services.pipeline.s3.upload_audio_bytes",
        return_value="https://b.s3/a.mp3",
    ), patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ), patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="vid123"),
    ) as create_video:
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={"voice_id": "el_voice_1"},
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"
    create_video.assert_awaited_once()
    await db.refresh(professor)
    assert professor.photo_avatar_preview_video_id == "vid123"
    assert professor.photo_avatar_preview_voice_id == "el_voice_1"


@pytest.mark.asyncio
async def test_preview_cache_hit_skips_render(client, professor, db):
    professor.photo_avatar_id = "tp_self"
    # 외부 URL → presign passthrough (boto3 호출 없음).
    professor.photo_avatar_preview_url = "https://cdn.example/v.mp4"
    professor.photo_avatar_preview_voice_id = None
    await db.flush()

    with patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="should_not_run"),
    ) as create_video:
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["video_url"] == "https://cdn.example/v.mp4"
    create_video.assert_not_awaited()


@pytest.mark.asyncio
async def test_preview_new_text_rerenders_despite_cache(client, professor, db):
    # 같은 음성이라도 대본(text)이 다르면 캐시를 건너뛰고 그 대본으로 다시 렌더한다
    # (아바타 페이지 "스크립트 테스트"). 렌더된 대본은 캐시 키로 저장된다.
    professor.photo_avatar_id = "tp_self"
    professor.photo_avatar_preview_url = "https://cdn.example/v.mp4"
    professor.photo_avatar_preview_voice_id = "el_voice_1"
    professor.photo_avatar_preview_text = "이전 대본"
    await db.flush()

    tts_result = MagicMock(audio_bytes=b"audio")
    with patch(
        "app.services.pipeline.tts.synthesize",
        new=AsyncMock(return_value=tts_result),
    ) as synth, patch(
        "app.services.pipeline.s3.upload_audio_bytes",
        return_value="https://b.s3/a.mp3",
    ), patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ), patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="vid_new"),
    ) as create_video:
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={"voice_id": "el_voice_1", "text": "오늘은 새로운 주제입니다."},
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"
    create_video.assert_awaited_once()
    synth.assert_awaited_once()
    assert synth.await_args.args[0] == "오늘은 새로운 주제입니다."
    await db.refresh(professor)
    assert professor.photo_avatar_preview_text == "오늘은 새로운 주제입니다."
    assert professor.photo_avatar_preview_video_id == "vid_new"


@pytest.mark.asyncio
async def test_preview_same_text_cache_hit(client, professor, db):
    # 같은 음성·같은 대본이면 캐시 적중 → 재렌더 없음.
    professor.photo_avatar_id = "tp_self"
    professor.photo_avatar_preview_url = "https://cdn.example/v.mp4"
    professor.photo_avatar_preview_voice_id = "el_voice_1"
    professor.photo_avatar_preview_text = "같은 대본"
    await db.flush()

    with patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ), patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="should_not_run"),
    ) as create_video:
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={"voice_id": "el_voice_1", "text": "같은 대본"},
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
    create_video.assert_not_awaited()


@pytest.mark.asyncio
async def test_preview_reuses_talking_photo_for_same_look(client, professor, db):
    # 같은 룩(photo_avatar_look_id == default_look_id)이면 talking photo 를 재등록하지
    # 않고 재사용한다 — 룩 전환·재렌더마다 새로 만들던 누적 등록 버그 방지.
    professor.photo_avatar_id = "tp_keep"
    professor.photo_avatar_look_id = "look-1"
    professor.photo_avatar_default_look_id = "look-1"
    await db.flush()

    tts_result = MagicMock(audio_bytes=b"audio")
    with patch(
        "app.services.pipeline.heygen.upload_talking_photo",
        new=AsyncMock(return_value="should_not_create"),
    ) as upload, patch(
        "app.services.pipeline.heygen.delete_talking_photo",
        new=AsyncMock(return_value=True),
    ) as delete, patch(
        "app.services.pipeline.tts.synthesize",
        new=AsyncMock(return_value=tts_result),
    ), patch(
        "app.services.pipeline.s3.upload_audio_bytes",
        return_value="https://b.s3/a.mp3",
    ), patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ), patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="vid1"),
    ):
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={"voice_id": "v1"},
        )

    assert resp.status_code == 200
    upload.assert_not_awaited()  # 재등록 안 함
    delete.assert_not_awaited()  # 회수 삭제도 안 함
    await db.refresh(professor)
    assert professor.photo_avatar_id == "tp_keep"


@pytest.mark.asyncio
async def test_preview_recycles_old_talking_photo_on_look_change(client, professor, db):
    # 룩이 바뀌면 이전 talking photo 를 먼저 삭제(슬롯 회수)한 뒤 새로 만든다.
    from app.models.photo_avatar import PhotoAvatarLook

    db.add(
        PhotoAvatarLook(
            user_id=professor.id,
            heygen_look_id="look-new",
            image_url="https://b.s3/look-new.png",
            preview_image_url="https://b.s3/look-new.png",
            status="ready",
        )
    )
    professor.photo_avatar_id = "tp_old"
    professor.photo_avatar_look_id = "look-old"
    professor.photo_avatar_default_look_id = "look-new"
    await db.flush()

    tts_result = MagicMock(audio_bytes=b"audio")
    with patch(
        "app.services.pipeline.s3.download_file", return_value=b"img-bytes"
    ), patch(
        "app.services.pipeline.heygen.delete_talking_photo",
        new=AsyncMock(return_value=True),
    ) as delete, patch(
        "app.services.pipeline.heygen.upload_talking_photo",
        new=AsyncMock(return_value="tp_new"),
    ) as upload, patch(
        "app.services.pipeline.tts.synthesize",
        new=AsyncMock(return_value=tts_result),
    ), patch(
        "app.services.pipeline.s3.upload_audio_bytes",
        return_value="https://b.s3/a.mp3",
    ), patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ), patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="vid2"),
    ):
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={"voice_id": "v1"},
        )

    assert resp.status_code == 200
    delete.assert_awaited_once_with("tp_old")  # 이전 것 먼저 삭제
    upload.assert_awaited_once()  # 새 룩으로 새로 등록
    await db.refresh(professor)
    assert professor.photo_avatar_id == "tp_new"
    assert professor.photo_avatar_look_id == "look-new"


@pytest.mark.asyncio
async def test_preview_surfaces_heygen_limit_message(client, professor, db):
    # HeyGen Photo Avatar 한도(401028) 초과면 사용자에게 정확히 안내한다.
    from app.models.photo_avatar import PhotoAvatarLook
    from app.services.pipeline.heygen import HeyGenError

    db.add(
        PhotoAvatarLook(
            user_id=professor.id,
            heygen_look_id="look-x",
            image_url="https://b.s3/look-x.png",
            preview_image_url="https://b.s3/look-x.png",
            status="ready",
        )
    )
    professor.photo_avatar_default_look_id = "look-x"
    await db.flush()

    err = HeyGenError(
        'HeyGen Talking Photo 업로드 오류 [400]: {"code":401028,'
        '"message":"You have exceeded your limit of 3 photo avatars."}'
    )
    with patch(
        "app.services.pipeline.s3.download_file", return_value=b"img-bytes"
    ), patch(
        "app.services.pipeline.heygen.delete_talking_photo",
        new=AsyncMock(return_value=True),
    ), patch(
        "app.services.pipeline.heygen.upload_talking_photo",
        new=AsyncMock(side_effect=err),
    ):
        resp = await client.post(
            "/api/avatars/me/preview",
            headers=make_auth_header(professor),
            json={"voice_id": "v1"},
        )

    assert resp.status_code == 502
    assert "한도" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_get_preview_not_started(client, professor, db):
    professor.photo_avatar_id = "tp_self"
    await db.flush()
    resp = await client.get(
        "/api/avatars/me/preview", headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_started"


@pytest.mark.asyncio
async def test_get_preview_completes_and_caches(client, professor, db):
    professor.photo_avatar_id = "tp_self"
    professor.photo_avatar_preview_video_id = "vid123"
    await db.flush()

    with patch(
        "app.services.pipeline.heygen.get_video_status",
        new=AsyncMock(
            return_value={"status": "completed", "video_url": "https://hg/v.mp4"}
        ),
    ), patch(
        "app.services.pipeline.s3.upload_from_url",
        new=AsyncMock(return_value=("https://b.s3/cached.mp4", 0.1)),
    ), patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ):
        resp = await client.get(
            "/api/avatars/me/preview", headers=make_auth_header(professor)
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["video_url"] == "https://b.s3/cached.mp4"
    await db.refresh(professor)
    assert professor.photo_avatar_preview_url == "https://b.s3/cached.mp4"
    assert professor.photo_avatar_preview_video_id is None


# ── 본인 음성 클로닝 (POST/GET/DELETE /api/avatars/me/voice) ───────────────────

# ID3 매직으로 시작하는 더미 mp3.
_MP3 = b"ID3\x04\x00" + b"\x00" * 64


@contextmanager
def _patch_voice_clone(voice_id="el_clone_1", clone_error=None):
    """clone_voice / delete_voice 와 S3 를 모킹. clone_error 면 ElevenLabsError raise."""
    s3_client = patch(
        "app.services.pipeline.s3.get_s3_client", return_value=MagicMock()
    )
    s3_presign = patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    )
    if clone_error is not None:
        clone = patch(
            "app.services.pipeline.elevenlabs_client.clone_voice",
            new=AsyncMock(side_effect=clone_error),
        )
    else:
        clone = patch(
            "app.services.pipeline.elevenlabs_client.clone_voice",
            new=AsyncMock(return_value={"voice_id": voice_id}),
        )
    delete = patch(
        "app.services.pipeline.elevenlabs_client.delete_voice",
        new=AsyncMock(return_value=None),
    )
    with s3_client, s3_presign, clone, delete as delete_mock:
        yield delete_mock


@pytest.mark.asyncio
async def test_create_my_voice_ready(client, professor, db):
    with _patch_voice_clone(voice_id="el_clone_1"):
        resp = await client.post(
            "/api/avatars/me/voice",
            headers=make_auth_header(professor),
            files={"file": ("me.mp3", _MP3, "audio/mpeg")},
            data={"gender": "male"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["voice_id"] == "el_clone_1"
    assert "본인" in (data["name"] or "")

    await db.refresh(professor)
    assert professor.cloned_voice_id == "el_clone_1"
    assert professor.cloned_voice_sample_url is not None


@pytest.mark.asyncio
async def test_create_my_voice_replaces_and_deletes_old(client, professor, db):
    professor.cloned_voice_id = "old_voice"
    await db.flush()

    with _patch_voice_clone(voice_id="new_voice") as delete_mock:
        resp = await client.post(
            "/api/avatars/me/voice",
            headers=make_auth_header(professor),
            files={"file": ("me.mp3", _MP3, "audio/mpeg")},
        )
    assert resp.status_code == 200
    assert resp.json()["voice_id"] == "new_voice"
    # 이전 voice 는 best-effort 삭제.
    delete_mock.assert_awaited_once_with("old_voice")
    await db.refresh(professor)
    assert professor.cloned_voice_id == "new_voice"


@pytest.mark.asyncio
async def test_create_my_voice_rejects_non_audio(client, professor):
    resp = await client.post(
        "/api/avatars/me/voice",
        headers=make_auth_header(professor),
        files={"file": ("x.txt", b"this is plainly not audio at all", "text/plain")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_my_voice_elevenlabs_fail_keeps_none(client, professor, db):
    from app.services.pipeline.elevenlabs_client import ElevenLabsError

    with _patch_voice_clone(clone_error=ElevenLabsError("ivc down")):
        resp = await client.post(
            "/api/avatars/me/voice",
            headers=make_auth_header(professor),
            files={"file": ("me.mp3", _MP3, "audio/mpeg")},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"
    await db.refresh(professor)
    assert professor.cloned_voice_id is None


@pytest.mark.asyncio
async def test_create_my_voice_requires_professor(client, student):
    resp = await client.post(
        "/api/avatars/me/voice",
        headers=make_auth_header(student),
        files={"file": ("me.mp3", _MP3, "audio/mpeg")},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_my_voice_none_then_ready(client, professor, db):
    resp = await client.get(
        "/api/avatars/me/voice", headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "none"

    professor.cloned_voice_id = "el_clone_1"
    professor.cloned_voice_name = "하두진 (본인 목소리)"
    professor.cloned_voice_sample_url = "https://cdn.example/s.mp3"
    await db.flush()
    with patch(
        "app.services.pipeline.s3.presign_stored_s3_url",
        side_effect=lambda u, *a, **k: u,
    ):
        resp = await client.get(
            "/api/avatars/me/voice", headers=make_auth_header(professor)
        )
    data = resp.json()
    assert data["status"] == "ready"
    assert data["voice_id"] == "el_clone_1"


@pytest.mark.asyncio
async def test_delete_my_voice_clears_fields(client, professor, db):
    professor.cloned_voice_id = "el_clone_1"
    professor.cloned_voice_name = "본인"
    professor.cloned_voice_sample_url = "https://cdn.example/s.mp3"
    await db.flush()

    with patch(
        "app.services.pipeline.elevenlabs_client.delete_voice",
        new=AsyncMock(return_value=None),
    ) as delete_mock:
        resp = await client.request(
            "DELETE", "/api/avatars/me/voice", headers=make_auth_header(professor)
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "none"
    delete_mock.assert_awaited_once_with("el_clone_1")
    await db.refresh(professor)
    assert professor.cloned_voice_id is None
    assert professor.cloned_voice_sample_url is None
