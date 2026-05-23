"""음성·자막 기능 테스트.

- GET /api/voices (ElevenLabs 보이스 목록, 장애 시 빈 목록 degrade)
- POST /api/videos/{id}/subtitle/translate (발화 → 자막 번역)
- PATCH /api/videos/{id}/subtitle (슬라이드별 자막 편집)
- PATCH /api/lectures/{id} (voice_lang / subtitle_lang / voice_id 저장)
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.video import VideoStatus
from tests.conftest import make_auth_header

# ElevenLabs list_voices() raw dict (premade 1개).
_FAKE_VOICES = [
    {
        "voice_id": "v_yuna",
        "name": "Yuna",
        "category": "premade",
        "preview_url": "https://el.example/yuna.mp3",
        "labels": {"gender": "female", "accent": "korean"},
    },
    {
        # voice_id 없는 항목은 스킵돼야 한다.
        "name": "broken",
        "labels": {},
    },
]


def _fake_translate_batch(texts, target_lang, source_lang="ko"):
    return [SimpleNamespace(text=f"[{target_lang}] {t}") for t in texts]


@pytest.fixture(autouse=True)
def _isolate_curated_voices():
    """단위 테스트 격리: 큐레이션 보이스의 개별 조회(get_voice)를 비활성화하고
    프로세스 캐시를 초기화한다.

    /api/voices 는 기본으로 큐레이션 20종을 개별 조회(get_voice)해 목록 앞에
    붙인다. 단위 테스트는 list_voices 모킹 경로만 검증하므로(또한 개발자 셸에
    실제 ELEVENLABS_API_KEY 가 있어도 네트워크를 안 타도록) get_voice 를
    raise 로 막는다. 큐레이션 주입 자체는 test_list_voices_curated_first 에서
    get_voice 를 재패치해 검증한다.
    """
    from app.api.v1 import voices as voices_api

    voices_api._CURATED_RAW_CACHE.clear()
    with patch(
        "app.services.pipeline.elevenlabs_client.get_voice",
        new=AsyncMock(side_effect=RuntimeError("curated fetch disabled in unit test")),
    ):
        yield
    voices_api._CURATED_RAW_CACHE.clear()


# ── GET /api/voices ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_voices_maps_labels(client, professor):
    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(return_value=_FAKE_VOICES),
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    # voice_id 없는 항목은 제외 → 1개.
    assert data["total"] == 1
    v = data["voices"][0]
    assert v["voice_id"] == "v_yuna"
    assert v["name"] == "Yuna"
    assert v["gender"] == "female"
    assert v["accent"] == "korean"
    assert v["preview_url"] == "https://el.example/yuna.mp3"
    # 한국어 표기.
    assert v["display_name"] == "Yuna"
    assert v["gender_ko"] == "여성"
    assert v["accent_ko"] == "한국"


@pytest.mark.asyncio
async def test_list_voices_korean_split_and_translation(client, professor):
    """'고유명 - 설명' 분리 + 설명 한국어 번역 + 국적 한국어."""
    fake = [
        {
            "voice_id": "v_charlie",
            "name": "Charlie - Deep, Confident, Energetic",
            "category": "premade",
            "preview_url": "https://el.example/charlie.mp3",
            "labels": {"gender": "male", "accent": "australian"},
        }
    ]

    def fake_batch(texts, target_lang, source_lang="ko"):
        return [SimpleNamespace(text="깊고 자신감 있으며 활기찬") for _ in texts]

    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(return_value=fake),
    ), patch(
        "app.services.pipeline.translator.translate_batch",
        new=fake_batch,
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))
    assert resp.status_code == 200
    v = resp.json()["voices"][0]
    assert v["display_name"] == "Charlie"
    assert v["gender_ko"] == "남성"
    assert v["accent_ko"] == "호주"
    assert v["description_ko"] == "깊고 자신감 있으며 활기찬"


@pytest.mark.asyncio
async def test_list_voices_degrades_to_empty_on_error(client, professor):
    from app.services.pipeline.elevenlabs_client import ElevenLabsAuthError

    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(side_effect=ElevenLabsAuthError("키 없음")),
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))
    # 보이스 선택은 보조 기능 — 장애여도 패널이 깨지지 않게 빈 목록 200.
    assert resp.status_code == 200
    assert resp.json() == {"voices": [], "total": 0}


@pytest.mark.asyncio
async def test_list_voices_requires_professor(client, student):
    resp = await client.get("/api/voices", headers=make_auth_header(student))
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_voices_curated_first(client, professor):
    """큐레이션 ID 가 계정에 없으면 개별 조회로 보충되고, 목록 맨 앞에 온다.

    계정 커스텀 보이스(v_custom)는 큐레이션 뒤에 덧붙는다.
    """
    from app.api.v1 import voices as voices_api

    account = [
        {"voice_id": "v_custom", "name": "내 보이스", "category": "cloned", "labels": {}},
    ]
    curated_id = voices_api.DEFAULT_CURATED_VOICE_IDS[0]

    async def fake_get_voice(vid, *args, **kwargs):
        if vid == curated_id:
            return {
                "voice_id": vid,
                "name": "Aria",
                "category": "premade",
                "preview_url": "https://el.example/aria.mp3",
                "labels": {"gender": "female", "accent": "american"},
            }
        raise RuntimeError("미캐시 — 스킵 대상")

    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(return_value=account),
    ), patch(
        "app.services.pipeline.elevenlabs_client.get_voice",
        new=fake_get_voice,
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))

    assert resp.status_code == 200
    data = resp.json()
    ids = [v["voice_id"] for v in data["voices"]]
    # 큐레이션(aria)이 앞, 계정 커스텀(v_custom)이 뒤.
    assert ids[0] == curated_id
    assert "v_custom" in ids
    assert ids.index(curated_id) < ids.index("v_custom")
    aria = data["voices"][0]
    assert aria["display_name"] == "Aria"
    assert aria["gender_ko"] == "여성"
    assert aria["preview_url"] == "https://el.example/aria.mp3"


# ── POST /api/voices/preview ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_preview_voice_synthesizes_with_voice_and_speed(client, professor):
    """발화 내용을 선택 보이스·속도로 합성해 audio/mpeg 로 반환."""
    fake = SimpleNamespace(
        audio_bytes=b"ID3-fake-mp3-bytes", provider="elevenlabs", duration_seconds=0.5
    )
    with patch(
        "app.services.pipeline.tts.synthesize", new=AsyncMock(return_value=fake)
    ) as m:
        resp = await client.post(
            "/api/voices/preview",
            json={"text": "안녕하세요, 미리듣기 테스트입니다.", "voice_id": "v_aria", "speed": 0.9},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/mpeg")
    assert resp.content == b"ID3-fake-mp3-bytes"
    # 선택한 voice_id·speed 가 합성에 전달됐는지.
    _, kwargs = m.call_args
    assert kwargs.get("voice_id") == "v_aria"
    assert kwargs.get("speed") == 0.9


@pytest.mark.asyncio
async def test_preview_voice_caps_text_length(client, professor):
    """과도한 길이의 텍스트는 상한으로 잘라서 합성한다(비용 보호)."""
    from app.schemas.voice import VOICE_PREVIEW_MAX_CHARS

    fake = SimpleNamespace(audio_bytes=b"x", provider="elevenlabs", duration_seconds=0.1)
    long_text = "가" * (VOICE_PREVIEW_MAX_CHARS + 500)
    with patch(
        "app.services.pipeline.tts.synthesize", new=AsyncMock(return_value=fake)
    ) as m:
        resp = await client.post(
            "/api/voices/preview",
            json={"text": long_text},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    sent_text = m.call_args[0][0]
    assert len(sent_text) == VOICE_PREVIEW_MAX_CHARS


@pytest.mark.asyncio
async def test_preview_voice_tts_failure_returns_502(client, professor):
    from app.services.pipeline.tts import TTSError

    with patch(
        "app.services.pipeline.tts.synthesize",
        new=AsyncMock(side_effect=TTSError("양쪽 provider 실패")),
    ):
        resp = await client.post(
            "/api/voices/preview",
            json={"text": "안녕하세요"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_preview_voice_unexpected_error_returns_502(client, professor):
    """합성이 TTSError 가 아닌 예외를 던져도 502 로 변환(핸들링 안 된 500 누수 방지).

    누수된 500 은 CORS 헤더가 없어 브라우저가 '연결 불가'로 막으므로, 반드시
    HTTPException 으로 잡아 CORS 가 적용되게 한다.
    """
    with patch(
        "app.services.pipeline.tts.synthesize",
        new=AsyncMock(side_effect=RuntimeError("예기치 못한 연결오류")),
    ):
        resp = await client.post(
            "/api/voices/preview",
            json={"text": "안녕하세요"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 502
    assert "RuntimeError" in resp.json().get("detail", "")


@pytest.mark.asyncio
async def test_preview_voice_requires_professor(client, student):
    resp = await client.post(
        "/api/voices/preview",
        json={"text": "안녕하세요"},
        headers=make_auth_header(student),
    )
    assert resp.status_code in (401, 403)


# ── POST /api/videos/{id}/subtitle/translate ──────────────────────────────────


@pytest.mark.asyncio
async def test_translate_subtitle_populates_per_slide(client, professor, video_pending):
    with patch(
        "app.services.pipeline.translator.translate_batch",
        new=_fake_translate_batch,
    ):
        resp = await client.post(
            f"/api/videos/{video_pending.id}/subtitle/translate",
            headers=make_auth_header(professor),
            params={"target_lang": "en"},
        )
    assert resp.status_code == 200
    data = resp.json()
    subs = data["subtitle_segments"]
    assert subs is not None
    assert len(subs) == 2
    assert subs[0]["slide_index"] == 0
    assert subs[0]["text"] == "[en] 안녕하세요, 오늘은 파이썬을 배웁니다."
    assert subs[1]["slide_index"] == 1
    # GET 으로도 자막이 따라오는지 확인.
    get_resp = await client.get(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(professor),
    )
    assert get_resp.json()["subtitle_segments"][0]["text"].startswith("[en]")


@pytest.mark.asyncio
async def test_translate_subtitle_rendering_locked(client, professor, db, lecture):
    from app.models.video import Video, VideoScript

    v = Video(lecture_id=lecture.id, status=VideoStatus.rendering)
    db.add(v)
    await db.flush()
    db.add(VideoScript(video_id=v.id, segments=[], ai_segments=[]))
    await db.flush()

    with patch(
        "app.services.pipeline.translator.translate_batch",
        new=_fake_translate_batch,
    ):
        resp = await client.post(
            f"/api/videos/{v.id}/subtitle/translate",
            headers=make_auth_header(professor),
            params={"target_lang": "en"},
        )
    assert resp.status_code == 409


# ── PATCH /api/videos/{id}/subtitle ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_subtitle_saves_edits(client, professor, video_pending):
    resp = await client.patch(
        f"/api/videos/{video_pending.id}/subtitle",
        headers=make_auth_header(professor),
        json={
            "segments": [
                {"slide_index": 0, "text": "Hello, today we learn Python."},
                {"slide_index": 1, "text": "Let's look at variables."},
            ]
        },
    )
    assert resp.status_code == 200
    subs = resp.json()["subtitle_segments"]
    assert subs[0]["text"] == "Hello, today we learn Python."
    assert subs[1]["text"] == "Let's look at variables."


@pytest.mark.asyncio
async def test_patch_subtitle_student_forbidden(client, student, video_pending):
    resp = await client.patch(
        f"/api/videos/{video_pending.id}/subtitle",
        headers=make_auth_header(student),
        json={"segments": [{"slide_index": 0, "text": "x"}]},
    )
    assert resp.status_code == 403


# ── PATCH /api/lectures/{id} — 음성·자막 설정 저장 ────────────────────────────


@pytest.mark.asyncio
async def test_patch_lecture_voice_subtitle_fields(client, professor, lecture):
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_lang": "en", "subtitle_lang": "ko", "voice_id": "v_yuna"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["voice_lang"] == "en"
    assert data["subtitle_lang"] == "ko"
    assert data["voice_id"] == "v_yuna"


@pytest.mark.asyncio
async def test_patch_lecture_subtitle_same_as_voice_null(client, professor, lecture):
    """subtitle_lang=null = 음성과 동일."""
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_lang": "ko", "subtitle_lang": None},
    )
    assert resp.status_code == 200
    assert resp.json()["subtitle_lang"] is None


@pytest.mark.asyncio
async def test_patch_lecture_invalid_lang_422(client, professor, lecture):
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_lang": "es"},  # 지원 7종 밖
    )
    assert resp.status_code == 422


# ── 자막 언어 변경 시 기존 자막 무효화 ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_changing_subtitle_lang_clears_existing_subtitle(
    client, professor, lecture, video_pending
):
    """자막 언어를 바꾸면 이전 언어로 번역된 subtitle_segments 가 비워져야 한다.

    subtitle_segments 에는 언어 표시가 없어, 안 비우면 옛 언어 텍스트가 새 언어
    라벨로 표시되는 혼란이 생긴다(교수자: '영어로 바꿔도 중국어가 그대로').
    """
    # 1) en 으로 번역해 자막 생성
    await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"subtitle_lang": "en"},
    )
    with patch(
        "app.services.pipeline.translator.translate_batch", new=_fake_translate_batch
    ):
        await client.post(
            f"/api/videos/{video_pending.id}/subtitle/translate",
            headers=make_auth_header(professor),
            params={"target_lang": "en"},
        )
    got = await client.get(
        f"/api/videos/{video_pending.id}/script", headers=make_auth_header(professor)
    )
    assert got.json()["subtitle_segments"], "선행 조건: 자막이 생성돼 있어야 함"

    # 2) 자막 언어를 ja 로 변경 → 기존 en 자막은 무효화
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"subtitle_lang": "ja"},
    )
    assert resp.status_code == 200

    # 3) 자막이 비워졌는지 확인
    got2 = await client.get(
        f"/api/videos/{video_pending.id}/script", headers=make_auth_header(professor)
    )
    assert not got2.json()["subtitle_segments"]


@pytest.mark.asyncio
async def test_repatch_same_subtitle_lang_keeps_subtitle(
    client, professor, lecture, video_pending
):
    """같은 자막 언어로 다시 PATCH 하면 기존 자막은 유지돼야 한다(불필요한 삭제 방지)."""
    await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"subtitle_lang": "en"},
    )
    with patch(
        "app.services.pipeline.translator.translate_batch", new=_fake_translate_batch
    ):
        await client.post(
            f"/api/videos/{video_pending.id}/subtitle/translate",
            headers=make_auth_header(professor),
            params={"target_lang": "en"},
        )

    # 같은 언어(en)로 재 PATCH — 다른 필드만 바뀌어도 자막은 유지.
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"subtitle_lang": "en", "voice_id": "v_yuna"},
    )
    assert resp.status_code == 200

    got = await client.get(
        f"/api/videos/{video_pending.id}/script", headers=make_auth_header(professor)
    )
    assert got.json()["subtitle_segments"], "같은 언어 재PATCH 는 자막을 지우면 안 됨"
