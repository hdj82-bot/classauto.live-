"""Photo Avatar(Design with AI) — 클라이언트 mock·태스크·API 엔드포인트 검증."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import settings
from tests.conftest import make_auth_header


# ── HeyGen 클라이언트 HEYGEN_MOCK 분기 ────────────────────────────────────────


class TestHeyGenPhotoAvatarMock:
    @pytest.mark.asyncio
    async def test_create_group_and_train_no_api(self):
        from app.services.pipeline import heygen

        with patch.object(settings, "HEYGEN_MOCK", True), patch(
            "app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock
        ) as req:
            gid = await heygen.create_photo_avatar_group("n", b"img-bytes", "image/jpeg")
            await heygen.train_photo_avatar_group(gid)

        assert gid.startswith("mockgrp_")
        req.assert_not_called()

    @pytest.mark.asyncio
    async def test_group_status_ready(self):
        from app.services.pipeline import heygen

        with patch.object(settings, "HEYGEN_MOCK", True):
            st = await heygen.get_photo_avatar_group_status("grp")
        assert st["status"] == "ready"

    @pytest.mark.asyncio
    async def test_generate_and_status_returns_n_looks(self):
        from app.services.pipeline import heygen

        with patch.object(settings, "HEYGEN_MOCK", True), patch(
            "app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock
        ) as req:
            gen = await heygen.generate_photo_avatar_looks("grp", "정장·흰 배경", 3)
            res = await heygen.get_photo_avatar_generation_status(gen, 3)

        assert gen.startswith("mockgen_")
        assert res["status"] == "ready"
        assert len(res["looks"]) == 3
        assert all(lk["look_id"].startswith("mocklook_") for lk in res["looks"])
        req.assert_not_called()


# ── Celery 태스크: 룩 행 생성 ─────────────────────────────────────────────────


def test_poll_photo_avatar_looks_creates_rows():
    from app.tasks import photo_avatar as t

    user = MagicMock()
    user.id = uuid.uuid4()

    db = MagicMock()
    db.query.return_value.filter.return_value.one.return_value = user
    db.query.return_value.filter.return_value.first.return_value = None  # dedup: 없음
    added: list = []
    db.add = lambda obj: added.append(obj)

    with patch.object(settings, "HEYGEN_MOCK", True), patch.object(
        t, "SyncSessionLocal", return_value=db
    ):
        out = t.poll_photo_avatar_looks.apply(
            args=[str(user.id), "mockgen_abc", "정장", 3]
        ).get(propagate=True)

    assert out["status"] == "ready"
    assert out["created"] == 3
    assert len(added) == 3
    assert all(o.heygen_look_id.startswith("mocklook_") for o in added)
    assert all(o.status == "ready" for o in added)


def test_reap_stuck_looks_fails_old_generating_rows():
    """reaper 가 오래 generating 인 룩을 failed 로 일괄 전이하고 건수를 돌려준다."""
    from app.tasks import photo_avatar as t

    db = MagicMock()
    db.execute.return_value.rowcount = 2

    with patch.object(t, "SyncSessionLocal", return_value=db):
        out = t.reap_stuck_looks.apply().get(propagate=True)

    assert out == {"reaped": 2}
    db.execute.assert_called_once()
    db.commit.assert_called_once()
    db.close.assert_called_once()
    # generating → failed UPDATE 인지 확인(컬럼/상태 매핑 회귀 방지).
    compiled = str(db.execute.call_args.args[0]).upper()
    assert "UPDATE" in compiled


def test_generate_gpt_looks_marks_failed_on_unexpected_error():
    """OpenAI 외 예외(S3 다운로드 실패 등)도 대상 룩을 failed 로 정리하고 재전파한다."""
    from app.tasks import photo_avatar as t
    from app.models.photo_avatar import LookStatus

    uid = uuid.uuid4()
    lid = uuid.uuid4()

    user = MagicMock()
    user.id = uid
    user.profile_image_url = "https://example/photo.jpg"

    row = MagicMock()
    row.id = lid
    row.status = LookStatus.generating.value

    db = MagicMock()
    db.query.return_value.filter.return_value.one.return_value = user
    db.query.return_value.filter.return_value.all.return_value = [row]

    with patch.object(t, "SyncSessionLocal", return_value=db), patch(
        "app.services.pipeline.s3.download_file", side_effect=RuntimeError("s3 down")
    ):
        with pytest.raises(RuntimeError):
            t.generate_gpt_looks.apply(
                args=[str(uid), [str(lid)], "educator", None, None, None, None]
            ).get(propagate=True)

    # except 경로가 rollback 후 generating→failed 정리 UPDATE 를 실행했는지.
    db.rollback.assert_called()
    assert db.execute.called
    assert "UPDATE" in str(db.execute.call_args.args[0]).upper()


# ── API 엔드포인트 ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_photo_avatar_endpoint(client, professor):
    # 엔드포인트는 그룹 생성만 동기로 하고, 학습은 prepare 태스크에 위임한다
    # (즉시 train 시 사진 pending → "No valid image" 실패하므로).
    with patch.object(settings, "HEYGEN_MOCK", True), patch.object(
        settings, "PHOTO_AVATAR_PROVIDER", "heygen"
    ), patch(
        "app.tasks.photo_avatar.prepare_photo_avatar_training.delay"
    ) as delay:
        resp = await client.post(
            "/api/avatars/me/photo-avatar",
            files={"file": ("a.jpg", b"\xff\xd8\xff" + b"x" * 200, "image/jpeg")},
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "training"
    assert body["group_id"].startswith("mockgrp_")
    delay.assert_called_once()


def test_look_not_ready_detection():
    from app.tasks.photo_avatar import _look_not_ready

    assert _look_not_ready(
        Exception("학습 시작 오류 [400]: ...No valid image for training found in group abc...")
    ) is True
    assert _look_not_ready(Exception("그룹 생성 오류 [404]: not found")) is False


def test_prepare_photo_avatar_trains_then_polls():
    """train 성공 시 학습 폴링(poll) 을 enqueue 하고 status=training 반환."""
    from app.tasks import photo_avatar as t

    user = MagicMock()
    user.id = uuid.uuid4()
    user.photo_avatar_group_id = "grp-1"
    db = MagicMock()
    db.query.return_value.filter.return_value.one.return_value = user

    with patch.object(settings, "HEYGEN_MOCK", True), patch.object(
        t, "SyncSessionLocal", return_value=db
    ), patch("app.tasks.photo_avatar.poll_photo_avatar_training.delay") as poll_delay:
        out = t.prepare_photo_avatar_training.apply(args=[str(user.id)]).get(
            propagate=True
        )

    assert out["status"] == "training"
    poll_delay.assert_called_once()


def test_prepare_photo_avatar_real_failure_sets_failed():
    """train 이 '사진 미준비'가 아닌 진짜 오류면 status=failed, poll 미enqueue."""
    from app.tasks import photo_avatar as t
    from app.services.pipeline.heygen import HeyGenError

    user = MagicMock()
    user.id = uuid.uuid4()
    user.photo_avatar_group_id = "grp-1"
    db = MagicMock()
    db.query.return_value.filter.return_value.one.return_value = user

    with patch.object(settings, "HEYGEN_MOCK", False), patch.object(
        t, "SyncSessionLocal", return_value=db
    ), patch(
        "app.services.pipeline.heygen.train_photo_avatar_group",
        new_callable=AsyncMock,
        side_effect=HeyGenError("Photo Avatar 학습 시작 오류 [404]: group not found"),
    ), patch(
        "app.tasks.photo_avatar.poll_photo_avatar_training.delay"
    ) as poll_delay:
        out = t.prepare_photo_avatar_training.apply(args=[str(user.id)]).get(
            propagate=True
        )

    assert out["status"] == "failed"
    assert user.photo_avatar_group_status == "failed"
    poll_delay.assert_not_called()


@pytest.mark.asyncio
async def test_create_photo_avatar_rejects_non_image(client, professor):
    with patch.object(settings, "HEYGEN_MOCK", True):
        resp = await client.post(
            "/api/avatars/me/photo-avatar",
            files={"file": ("a.txt", b"not-an-image-payload", "text/plain")},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_generate_looks_requires_ready_group(client, professor):
    # 그룹이 아직 없음 → 400
    with patch.object(settings, "HEYGEN_MOCK", True):
        resp = await client.post(
            "/api/avatars/me/looks",
            json={"prompt": "정장", "count": 4},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_generate_looks_clamps_to_batch_max(client, professor, db):
    professor.photo_avatar_group_id = "grp"
    professor.photo_avatar_group_status = "ready"
    await db.flush()

    with patch.object(settings, "HEYGEN_MOCK", True), patch.object(
        settings, "PHOTO_AVATAR_PROVIDER", "heygen"
    ), patch.object(
        settings, "PHOTO_AVATAR_LOOK_BATCH_MAX", 4
    ), patch("app.tasks.photo_avatar.poll_photo_avatar_looks.delay") as delay:
        resp = await client.post(
            "/api/avatars/me/looks",
            json={"prompt": "정장", "count": 10},
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "generating"
    delay.assert_called_once()
    # count 가 BATCH_MAX(4)로 클램프되어 task 에 전달됐는지
    assert delay.call_args.args[3] == 4


@pytest.mark.asyncio
async def test_list_and_select_look(client, professor, db):
    """레거시 heygen 경로: heygen_look_id 룩 목록·선택(Talking Photo 등록 없음)."""
    from app.models.photo_avatar import PhotoAvatarLook

    db.add(
        PhotoAvatarLook(
            user_id=professor.id,
            heygen_look_id="look-1",
            preview_image_url="https://h/look1.png",
            prompt="정장",
            status="ready",
        )
    )
    await db.flush()

    with patch.object(settings, "PHOTO_AVATAR_PROVIDER", "heygen"):
        resp = await client.get(
            "/api/avatars/me/looks", headers=make_auth_header(professor)
        )
        assert resp.status_code == 200
        body = resp.json()
        # 맨 배열(프론트 listLooks 가 직접 map). 래핑 객체 아님.
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["look_id"] == "look-1"
        assert body[0]["is_default"] is False
        assert body[0]["saved"] is False  # 생성 직후엔 후보(미저장)

        sel = await client.post(
            "/api/avatars/me/looks/look-1/select", headers=make_auth_header(professor)
        )
        assert sel.status_code == 200
        assert sel.json()["default_look_id"] == "look-1"
        assert professor.photo_avatar_default_look_id == "look-1"

        # 기본 룩 지정(확정) = 라이브러리 자동 저장 → saved=True 로 노출
        after = await client.get(
            "/api/avatars/me/looks", headers=make_auth_header(professor)
        )
    assert after.json()[0]["saved"] is True


@pytest.mark.asyncio
async def test_save_look_to_library_and_cap(client, professor, db):
    """⋮ '라이브러리에 저장' — saved 전이 + 라이브러리 상한 초과 시 400."""
    from app.models.photo_avatar import PhotoAvatarLook

    look = PhotoAvatarLook(
        user_id=professor.id,
        heygen_look_id="save-1",
        image_url="https://h/save1.png",
        preview_image_url="https://h/save1.png",
        prompt="정장",
        status="ready",
    )
    db.add(look)
    await db.flush()

    with patch.object(settings, "PHOTO_AVATAR_PROVIDER", "heygen"):
        ok = await client.post(
            "/api/avatars/me/looks/save-1/save", headers=make_auth_header(professor)
        )
        assert ok.status_code == 200
        assert ok.json()["saved"] is True

        # 상한(LIBRARY_MAX) 도달 시 추가 저장 차단
        with patch.object(settings, "PHOTO_AVATAR_LIBRARY_MAX", 1):
            another = PhotoAvatarLook(
                user_id=professor.id,
                heygen_look_id="save-2",
                image_url="https://h/save2.png",
                preview_image_url="https://h/save2.png",
                prompt="니트",
                status="ready",
            )
            db.add(another)
            await db.flush()
            blocked = await client.post(
                "/api/avatars/me/looks/save-2/save",
                headers=make_auth_header(professor),
            )
    assert blocked.status_code == 400


# ── 최근 선택한 아바타 (라이브러리 즉시 선택·적용) ────────────────────────────


@pytest.mark.asyncio
async def test_recent_avatar_get_default_null(client, professor):
    """아무것도 고르지 않았으면 최근 선택은 null."""
    resp = await client.get(
        "/api/avatars/me/recent", headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    assert resp.json()["avatar_id"] is None


@pytest.mark.asyncio
async def test_recent_avatar_set_and_get_standard(client, professor, db):
    """표준 HeyGen avatar_id 는 그대로 수용·영속화되고 다시 조회된다."""
    resp = await client.post(
        "/api/avatars/me/recent",
        json={"avatar_id": "heygen-male-01"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json()["avatar_id"] == "heygen-male-01"
    assert professor.recent_avatar_id == "heygen-male-01"

    got = await client.get(
        "/api/avatars/me/recent", headers=make_auth_header(professor)
    )
    assert got.json()["avatar_id"] == "heygen-male-01"


@pytest.mark.asyncio
async def test_recent_avatar_accepts_ready_look(client, professor, db):
    """ready 인 본인 룩 id 는 최근 선택으로 수용된다."""
    from app.models.photo_avatar import PhotoAvatarLook

    db.add(
        PhotoAvatarLook(
            user_id=professor.id,
            heygen_look_id="look-ready",
            preview_image_url="https://h/r.png",
            prompt="정장",
            status="ready",
        )
    )
    await db.flush()

    resp = await client.post(
        "/api/avatars/me/recent",
        json={"avatar_id": "look-ready"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert professor.recent_avatar_id == "look-ready"


@pytest.mark.asyncio
async def test_recent_avatar_rejects_unready_look(client, professor, db):
    """아직 생성 중인 본인 룩은 최근 선택 대상이 아니다(400)."""
    from app.models.photo_avatar import PhotoAvatarLook

    db.add(
        PhotoAvatarLook(
            user_id=professor.id,
            heygen_look_id="look-pending",
            preview_image_url=None,
            prompt="정장",
            status="generating",
        )
    )
    await db.flush()

    resp = await client.post(
        "/api/avatars/me/recent",
        json={"avatar_id": "look-pending"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400
    assert professor.recent_avatar_id is None


# ── v0.2 gpt 경로 (PHOTO_AVATAR_PROVIDER="gpt") ───────────────────────────────

_GPT_S3_SRC = "https://b.s3.r.amazonaws.com/thumbnails/photo-avatar/x/source-ab.jpg"


@pytest.mark.asyncio
async def test_create_photo_avatar_gpt_stores_reference_no_train(client, professor):
    """gpt: train 없이 사진만 S3 저장 → status=ready, train 태스크 미enqueue."""
    with patch.object(settings, "PHOTO_AVATAR_PROVIDER", "gpt"), patch(
        "app.services.pipeline.s3.upload_file", return_value="ok"
    ) as up, patch(
        "app.tasks.photo_avatar.prepare_photo_avatar_training.delay"
    ) as train:
        resp = await client.post(
            "/api/avatars/me/photo-avatar",
            files={"file": ("a.jpg", b"\xff\xd8\xff" + b"x" * 200, "image/jpeg")},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
    up.assert_called_once()
    train.assert_not_called()
    assert professor.profile_image_url is not None
    assert professor.photo_avatar_group_status == "ready"


@pytest.mark.asyncio
async def test_generate_looks_gpt_creates_placeholders(client, professor, db):
    """gpt: placeholder 룩 N개 선생성 + generate_gpt_looks.delay(클램프)."""
    from sqlalchemy import select as sa_select

    from app.models.photo_avatar import PhotoAvatarLook

    professor.photo_avatar_group_status = "ready"
    professor.profile_image_url = _GPT_S3_SRC
    await db.flush()

    with patch.object(settings, "PHOTO_AVATAR_PROVIDER", "gpt"), patch.object(
        settings, "PHOTO_AVATAR_LOOK_BATCH_MAX", 4
    ), patch("app.tasks.photo_avatar.generate_gpt_looks.delay") as delay:
        resp = await client.post(
            "/api/avatars/me/looks",
            json={"persona": "educator", "outfit": "blazer", "count": 3},
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "generating"
    delay.assert_called_once()
    # look_ids(2번째 인자) 길이 = 생성 수 = 3.
    assert len(delay.call_args.args[1]) == 3

    rows = (
        await db.execute(
            sa_select(PhotoAvatarLook).where(PhotoAvatarLook.user_id == professor.id)
        )
    ).scalars().all()
    assert len(rows) == 3
    assert all(r.status == "generating" and r.image_url is None for r in rows)


@pytest.mark.asyncio
async def test_generate_looks_gpt_soft_cap(client, professor, db):
    """gpt: 누적 한도 도달 시 예외가 아니라 200 + status=failed 안내(소프트)."""
    from app.models.photo_avatar import PhotoAvatarLook

    professor.photo_avatar_group_status = "ready"
    professor.profile_image_url = _GPT_S3_SRC
    for i in range(2):
        db.add(
            PhotoAvatarLook(
                user_id=professor.id,
                image_url=f"https://b.s3.r.amazonaws.com/x/{i}.png",
                prompt="p",
                status="ready",
            )
        )
    await db.flush()

    with patch.object(settings, "PHOTO_AVATAR_PROVIDER", "gpt"), patch.object(
        settings, "PHOTO_AVATAR_LOOK_TOTAL_MAX", 2
    ), patch("app.tasks.photo_avatar.generate_gpt_looks.delay") as delay:
        resp = await client.post(
            "/api/avatars/me/looks",
            json={"persona": "educator", "count": 2},
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "failed"
    assert "최대" in (body["message"] or "")
    delay.assert_not_called()


@pytest.mark.asyncio
async def test_select_gpt_look_does_not_call_heygen(client, professor, db):
    """v0.4 (2026-06-01): select 시점에 HeyGen 호출 없음 — '최후에만 헤이젠'.

    기존엔 select 가 upload_talking_photo 까지 호출해 photo_avatar_id 를 채웠지만,
    이제 default_look_id 만 저장하고 HeyGen 등록은 preview / 강의 렌더에서 lazy
    수행한다. select 시 photo_avatar_id 는 명시적으로 비워 다음 사용 시점에
    default 로부터 새로 등록되도록 한다.
    """
    from app.models.photo_avatar import PhotoAvatarLook

    look = PhotoAvatarLook(
        user_id=professor.id,
        image_url="https://b.s3.r.amazonaws.com/thumbnails/photo-avatar/x/look-ab.png",
        prompt="p",
        status="ready",
    )
    db.add(look)
    await db.flush()
    # 이전 미리보기 캐시·talking_photo_id 가 채워져 있다고 가정.
    professor.photo_avatar_id = "tp_old"
    professor.photo_avatar_preview_url = "https://old/preview.mp4"
    professor.photo_avatar_preview_video_id = "vid-old"
    await db.flush()
    look_id = str(look.id)

    # S3/HeyGen 둘 다 호출되면 안 된다.
    with (
        patch.object(settings, "PHOTO_AVATAR_PROVIDER", "gpt"),
        patch("app.services.pipeline.s3.download_file") as s3_dl,
        patch(
            "app.services.pipeline.heygen.upload_talking_photo",
            new_callable=AsyncMock,
        ) as up,
    ):
        resp = await client.post(
            f"/api/avatars/me/looks/{look_id}/select",
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    assert resp.json()["default_look_id"] == look_id
    # 핵심 회귀 가드 — select 가 HeyGen / S3 를 더 이상 건드리지 않는다.
    up.assert_not_awaited()
    s3_dl.assert_not_called()
    # default 만 저장되고, 이전 talking_photo_id 와 미리보기 캐시는 무효 처리.
    assert professor.photo_avatar_default_look_id == look_id
    assert professor.photo_avatar_id is None
    assert professor.photo_avatar_preview_url is None
    assert professor.photo_avatar_preview_video_id is None


@pytest.mark.asyncio
async def test_ensure_photo_avatar_id_lazy_uploads_from_default_look(professor, db):
    """preview/render 진입 시점의 lazy 등록 — _ensure_photo_avatar_id 단위 검증.

    photo_avatar_id 가 비고 default_look_id 가 ready 룩을 가리키면, S3 다운로드 →
    talking_photo 정규화 → HeyGen 업로드 → photo_avatar_id 저장이 idempotent 로
    수행된다.
    """
    from app.api.v1.avatars import _ensure_photo_avatar_id
    from app.models.photo_avatar import PhotoAvatarLook

    look = PhotoAvatarLook(
        user_id=professor.id,
        image_url="https://b.s3.r.amazonaws.com/thumbnails/photo-avatar/x/look-en.jpg",
        prompt="p",
        status="ready",
    )
    db.add(look)
    await db.flush()
    professor.photo_avatar_id = None
    professor.photo_avatar_default_look_id = str(look.id)
    await db.flush()

    with (
        patch("app.services.pipeline.s3.download_file", return_value=b"img-bytes"),
        patch(
            "app.services.pipeline.heygen.upload_talking_photo",
            new_callable=AsyncMock,
            return_value="tp_lazy_42",
        ) as up,
    ):
        out = await _ensure_photo_avatar_id(professor, db)

    assert out == "tp_lazy_42"
    up.assert_awaited_once()
    assert professor.photo_avatar_id == "tp_lazy_42"


@pytest.mark.asyncio
async def test_ensure_photo_avatar_id_is_idempotent(professor, db):
    """photo_avatar_id 가 이미 있으면 S3/HeyGen 모두 호출하지 않고 그대로 반환."""
    from app.api.v1.avatars import _ensure_photo_avatar_id

    professor.photo_avatar_id = "tp_cached"
    professor.photo_avatar_default_look_id = "irrelevant"
    await db.flush()

    with (
        patch("app.services.pipeline.s3.download_file") as s3_dl,
        patch(
            "app.services.pipeline.heygen.upload_talking_photo",
            new_callable=AsyncMock,
        ) as up,
    ):
        out = await _ensure_photo_avatar_id(professor, db)

    assert out == "tp_cached"
    s3_dl.assert_not_called()
    up.assert_not_awaited()


@pytest.mark.asyncio
async def test_ensure_photo_avatar_id_returns_none_without_default(professor, db):
    """default_look_id 가 없으면 None — 상위에서 400 안내."""
    from app.api.v1.avatars import _ensure_photo_avatar_id

    professor.photo_avatar_id = None
    professor.photo_avatar_default_look_id = None
    await db.flush()

    out = await _ensure_photo_avatar_id(professor, db)
    assert out is None


# ── _ensure_talking_photo_payload (HeyGen 업로드 안전망) ───────────────────


def test_ensure_talking_photo_payload_resizes_large_png():
    """큰 PNG 룩 이미지가 HeyGen 거부 위험 사이즈일 때 다운스케일 + JPEG 재인코딩.

    2026-06-01 회귀 가드 — 룩 이미지(1536x1024 PNG)는 4MB 를 넘을 수 있어
    HeyGen Talking Photo 업로드 단계에서 거부됐다는 사용자 보고.
    """
    from io import BytesIO

    from PIL import Image

    from app.api.v1.avatars import (
        _TALKING_PHOTO_MAX_SIDE,
        _ensure_talking_photo_payload,
    )

    # 1536x1024 RGB 더미 — JPEG 보다 큰 PNG 출력을 위해 노이즈 패턴.
    img = Image.new("RGB", (1536, 1024), color=(120, 130, 140))
    # 약간의 패턴을 깔아 PNG 압축 효율을 떨어뜨려 사이즈를 키운다.
    pixels = img.load()
    for x in range(0, 1536, 2):
        for y in range(0, 1024, 2):
            pixels[x, y] = ((x * 7) % 255, (y * 11) % 255, ((x + y) * 13) % 255)
    buf = BytesIO()
    img.save(buf, format="PNG")
    src = buf.getvalue()

    out_bytes, out_ctype = _ensure_talking_photo_payload(src, "image/png")
    # PNG 입력은 항상 JPEG 로 정규화된다(크기 무관).
    assert out_ctype == "image/jpeg"
    # 긴 변이 가이드 이내로 축소된다.
    out_img = Image.open(BytesIO(out_bytes))
    assert max(out_img.size) <= _TALKING_PHOTO_MAX_SIDE
    # 결과 사이즈는 원본 PNG 보다 작아야 한다(다운스케일 + JPEG 압축).
    assert len(out_bytes) < len(src)


def test_ensure_talking_photo_payload_keeps_small_jpeg_untouched():
    """이미 작은 JPEG 는 추가 압축 손실을 피하기 위해 그대로 통과."""
    from io import BytesIO

    from PIL import Image

    from app.api.v1.avatars import _ensure_talking_photo_payload

    img = Image.new("RGB", (640, 480), color=(200, 100, 50))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    src = buf.getvalue()

    out_bytes, out_ctype = _ensure_talking_photo_payload(src, "image/jpeg")
    assert out_ctype == "image/jpeg"
    assert out_bytes == src  # 손대지 않음


# ── DELETE /api/avatars/me/looks/{id} (라이브러리 정리) ─────────────────────


@pytest.mark.asyncio
async def test_delete_gpt_look_removes_row_and_clears_default(client, professor, db):
    """삭제 후 row 가 사라지고 default_look_id 도 해제된다 — cap 회복용 핵심 경로."""
    from app.models.photo_avatar import PhotoAvatarLook
    from sqlalchemy import select

    look = PhotoAvatarLook(
        user_id=professor.id,
        image_url="https://b.s3.r.amazonaws.com/thumbnails/photo-avatar/x/look-del.png",
        prompt="p",
        status="ready",
    )
    db.add(look)
    await db.flush()
    look_id = str(look.id)
    # 이 룩이 기본 룩으로 선택돼 있다고 가정 — 삭제 시 함께 해제돼야 한다.
    professor.photo_avatar_default_look_id = look_id
    await db.flush()

    resp = await client.delete(
        f"/api/avatars/me/looks/{look_id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # row 가 실제로 사라졌다.
    remaining = (
        await db.execute(select(PhotoAvatarLook).where(PhotoAvatarLook.id == look.id))
    ).scalar_one_or_none()
    assert remaining is None

    # 기본 룩 포인터도 해제됐다.
    await db.refresh(professor)
    assert professor.photo_avatar_default_look_id is None


@pytest.mark.asyncio
async def test_delete_unknown_look_returns_404(client, professor):
    """존재하지 않는 룩은 404. (유효 UUID 형식이지만 DB 에 없음.)"""
    bogus = str(uuid.uuid4())
    resp = await client.delete(
        f"/api/avatars/me/looks/{bogus}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


# ── generate_gpt_looks 태스크 ─────────────────────────────────────────────────


def _gpt_task_db(user, rows):
    """generate_gpt_looks 가 쓰는 sync 세션을 MagicMock 으로 구성."""
    db = MagicMock()
    db.query.return_value.filter.return_value.one.return_value = user
    db.query.return_value.filter.return_value.all.return_value = rows
    return db


def test_generate_gpt_looks_fills_rows():
    """MOCK 생성 → 각 placeholder 행에 image_url 채우고 ready."""
    from app.tasks import photo_avatar as t

    user = MagicMock()
    user.id = uuid.uuid4()
    user.profile_image_url = _GPT_S3_SRC
    r1, r2 = MagicMock(status="generating"), MagicMock(status="generating")
    db = _gpt_task_db(user, [r1, r2])
    look_ids = [str(uuid.uuid4()), str(uuid.uuid4())]

    with patch.object(settings, "OPENAI_IMAGE_MOCK", True), patch.object(
        t, "SyncSessionLocal", return_value=db
    ), patch("app.services.pipeline.s3.download_file", return_value=b"img"), patch(
        "app.services.pipeline.s3.upload_file", return_value="ok"
    ):
        out = t.generate_gpt_looks.apply(
            args=[str(user.id), look_ids, "educator", "blazer", "lecture", "warm", None]
        ).get(propagate=True)

    assert out["status"] == "ready"
    assert out["created"] == 2
    assert r1.status == "ready" and r2.status == "ready"
    assert r1.image_url and r2.image_url


def test_generate_gpt_looks_idempotent_skip():
    """대상 행이 이미 generating 을 벗어났으면 재실행은 skip(중복 비용 방지)."""
    from app.tasks import photo_avatar as t

    user = MagicMock()
    user.id = uuid.uuid4()
    user.profile_image_url = _GPT_S3_SRC
    r1 = MagicMock(status="ready")
    db = _gpt_task_db(user, [r1])

    with patch.object(settings, "OPENAI_IMAGE_MOCK", True), patch.object(
        t, "SyncSessionLocal", return_value=db
    ):
        out = t.generate_gpt_looks.apply(
            args=[str(user.id), [str(uuid.uuid4())], "educator", None, None, None, None]
        ).get(propagate=True)

    assert out["status"] == "skipped"


def test_generate_gpt_looks_moderation_fallback():
    """모더레이션 거부 → 첫 행은 원본 사진으로 ready, 나머지 failed."""
    from app.tasks import photo_avatar as t
    from app.services.pipeline.openai_image import OpenAIModerationRefused

    user = MagicMock()
    user.id = uuid.uuid4()
    user.profile_image_url = _GPT_S3_SRC
    r1, r2 = MagicMock(status="generating"), MagicMock(status="generating")
    db = _gpt_task_db(user, [r1, r2])

    with patch.object(settings, "OPENAI_IMAGE_MOCK", False), patch.object(
        t, "SyncSessionLocal", return_value=db
    ), patch("app.services.pipeline.s3.download_file", return_value=b"img"), patch(
        "app.services.pipeline.openai_image.generate_instructor_looks",
        side_effect=OpenAIModerationRefused("rejected"),
    ):
        out = t.generate_gpt_looks.apply(
            args=[str(user.id), [str(uuid.uuid4()), str(uuid.uuid4())], "educator", None, None, None, None]
        ).get(propagate=True)

    assert out["status"] == "ready"
    assert out["created"] == 1
    assert out.get("fallback") is True
    assert r1.image_url == user.profile_image_url and r1.status == "ready"
    assert r2.status == "failed"


def test_generate_gpt_looks_hard_failure_marks_failed():
    """그 외 OpenAI 오류 → 모든 행 failed, 재시도 없음."""
    from app.tasks import photo_avatar as t
    from app.services.pipeline.openai_image import OpenAIImageError

    user = MagicMock()
    user.id = uuid.uuid4()
    user.profile_image_url = _GPT_S3_SRC
    r1 = MagicMock(status="generating")
    db = _gpt_task_db(user, [r1])

    with patch.object(settings, "OPENAI_IMAGE_MOCK", False), patch.object(
        t, "SyncSessionLocal", return_value=db
    ), patch("app.services.pipeline.s3.download_file", return_value=b"img"), patch(
        "app.services.pipeline.openai_image.generate_instructor_looks",
        side_effect=OpenAIImageError("boom"),
    ):
        out = t.generate_gpt_looks.apply(
            args=[str(user.id), [str(uuid.uuid4())], "educator", None, None, None, None]
        ).get(propagate=True)

    assert out["status"] == "failed"
    assert r1.status == "failed"
