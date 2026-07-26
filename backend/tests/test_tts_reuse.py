"""TTS 음원 재사용 — 재제작 중복 과금 제거 (스펙 13 §C-5).

확인 항목(요청):
1. 해시 충돌 시 오작동이 없는가 — 같은 키인데 다른 음원을 재사용하지 않는가
2. voice_speed 가 float 이라 부동소수 비교가 아니라 정규화된 값으로 들어가는가
3. S3 객체가 삭제됐는데 DB 에는 남은 경우 재합성으로 폴백하는가
4. 기존 데이터(키 없음)는 첫 재제작 때 한 번 재합성되고 그 뒤 재사용되는가
"""
from __future__ import annotations

import uuid

import pytest

from app.models.video_render import RenderStatus, VideoRender
from app.services import tts_reuse

LECTURE = uuid.uuid4()
INSTRUCTOR = uuid.uuid4()
TEXT = "把자문은 목적어를 동사 앞으로 옮깁니다."


def _key(**overrides) -> str:
    base = dict(
        lecture_id=LECTURE,
        slide_number=3,
        script_text=TEXT,
        voice_id="voice-A",
        voice_speed=1.0,
    )
    base.update(overrides)
    return tts_reuse.build_cache_key(**base)


# ── 키 생성 ───────────────────────────────────────────────────────────────────


def test_same_inputs_produce_same_key():
    assert _key() == _key()


@pytest.mark.parametrize(
    "override",
    [
        {"script_text": TEXT + " 그리고 하나 더."},
        {"voice_id": "voice-B"},
        {"voice_speed": 1.2},
        {"slide_number": 4},
        {"lecture_id": uuid.uuid4()},
    ],
)
def test_any_input_change_produces_different_key(override):
    """텍스트·보이스·속도·슬라이드·강의 중 하나만 달라도 다른 음원이다."""
    assert _key(**override) != _key()


def test_voice_speed_is_normalized_not_float_compared():
    """부동소수 오차로 재사용이 조용히 깨지면 안 된다.

    1.0 과 1.0000001 은 같은 음원이다(둘째 자리에서 끊는다). 1.0 과 1.005 도 같다.
    """
    assert _key(voice_speed=1.0) == _key(voice_speed=1.0000001)
    assert _key(voice_speed=1.0) == _key(voice_speed=1.004)
    assert _key(voice_speed=None) == _key(voice_speed=1.0)  # None = 기본 1.0
    # 의미 있는 차이는 구분된다.
    assert _key(voice_speed=1.0) != _key(voice_speed=1.1)


# ── 재사용 조회 ───────────────────────────────────────────────────────────────


@pytest.fixture
def db_sync():
    """동기 Session — `find_reusable_render` 는 Celery 워커에서 도는 sync 코드다.

    비동기 테스트 DB 와 섞지 않으려고 인메모리 SQLite 를 따로 띄운다. 이 테스트가
    검증하는 건 조회 조건과 판정 로직이라 그걸로 충분하다.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.base import Base
    from tests.conftest import _patch_jsonb_columns

    # PG 전용 JSONB(subtitle_cues 등)를 SQLite 가 못 만든다 — conftest 와 같은 폴백.
    _patch_jsonb_columns()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[VideoRender.__table__])
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def make_render(db_sync):
    def _make(**overrides) -> VideoRender:
        params = dict(
            id=uuid.uuid4(),
            lecture_id=LECTURE,
            instructor_id=INSTRUCTOR,
            avatar_id="avatar-1",
            slide_number=3,
            script_text=TEXT,
            voice_id="voice-A",
            voice_speed=1.0,
            status=RenderStatus.ready,
            audio_url="https://s3.example.com/audio/prev.mp3",
            tts_cache_key=_key(),
        )
        params.update(overrides)
        render = VideoRender(**params)
        db_sync.add(render)
        db_sync.flush()
        return render

    return _make


def _find(db, *, exclude, exists=True, **overrides):
    params = dict(
        cache_key=_key(),
        exclude_render_id=exclude,
        script_text=TEXT,
        voice_id="voice-A",
        voice_speed=1.0,
        audio_exists=lambda _c: exists,
    )
    params.update(overrides)
    return tts_reuse.find_reusable_render(db, **params)


def test_reuses_previous_render_with_same_content(db_sync, make_render):
    """같은 내용이면 이전 음원을 그대로 쓴다 — 재제작 시 TTS 비용 0."""
    prev = make_render()
    found = _find(db_sync, exclude=uuid.uuid4())
    assert found is not None
    assert found.id == prev.id


def test_hash_collision_does_not_reuse_wrong_audio(db_sync, make_render):
    """**충돌 방어** — 키가 같아도 원본 텍스트가 다르면 재사용하지 않는다.

    SHA-256 충돌은 무시할 확률이지만, 충돌해도 엉뚱한 음원이 나가면 안 된다.
    같은 키를 강제로 심어 그 상황을 만든다.
    """
    make_render(script_text="완전히 다른 문장입니다.")  # 키는 같게 심음
    assert _find(db_sync, exclude=uuid.uuid4()) is None


def test_voice_change_does_not_reuse(db_sync, make_render):
    make_render(voice_id="voice-B")
    assert _find(db_sync, exclude=uuid.uuid4()) is None


def test_speed_change_does_not_reuse(db_sync, make_render):
    make_render(voice_speed=1.5)
    assert _find(db_sync, exclude=uuid.uuid4()) is None


def test_missing_s3_object_falls_back_to_resynthesis(db_sync, make_render):
    """**S3 유실 폴백** — DB 에는 남았는데 객체가 지워졌으면 재합성한다."""
    make_render()
    assert _find(db_sync, exclude=uuid.uuid4(), exists=False) is None


def test_legacy_render_without_key_is_not_a_candidate(db_sync, make_render):
    """**기존 데이터** — 키가 NULL 인 과거 행은 후보가 아니다.

    배포 직후 첫 재제작은 한 번 재합성되고(그때 키가 찍힌다) 그 뒤부터 재사용된다.
    """
    make_render(tts_cache_key=None)
    assert _find(db_sync, exclude=uuid.uuid4()) is None


def test_failed_render_audio_is_not_reused(db_sync, make_render):
    """실패한 렌더의 음원은 신뢰하지 않는다."""
    make_render(status=RenderStatus.failed)
    assert _find(db_sync, exclude=uuid.uuid4()) is None


def test_does_not_reuse_itself(db_sync, make_render):
    """자기 자신을 후보로 잡으면 무한 재사용이 된다."""
    prev = make_render()
    assert _find(db_sync, exclude=prev.id) is None


def test_render_without_audio_url_is_not_a_candidate(db_sync, make_render):
    make_render(audio_url=None)
    assert _find(db_sync, exclude=uuid.uuid4()) is None


# ── 재사용 적용 ───────────────────────────────────────────────────────────────


def test_apply_reuse_carries_subtitle_cues(db_sync, make_render):
    """음원만 옮기고 cue 를 빠뜨리면 자막이 음성과 어긋난다."""
    cues = [{"text": "把자문은", "start": 0.0, "end": 1.2}]
    source = make_render(subtitle_cues=cues, tts_provider="elevenlabs")
    target = make_render(
        id=uuid.uuid4(),
        audio_url=None,
        subtitle_cues=None,
        tts_provider="elevenlabs",
        tts_cache_key=None,
    )

    tts_reuse.apply_reuse(target, source)

    assert target.audio_url == source.audio_url
    assert target.subtitle_cues == cues
    assert target.tts_provider == source.tts_provider
    assert target.voice_id == source.voice_id
    assert target.voice_speed == source.voice_speed
