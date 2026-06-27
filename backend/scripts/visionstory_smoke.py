#!/usr/bin/env python
"""VisionStory 본인 아바타 스모크 테스트 — 사진 + 음성 → 말하는 영상.

프로덕션과 **동일한 클라이언트 코드**(app.services.pipeline.visionstory)를 그대로
호출해, 외부 VisionStory OpenAPI 계약(엔드포인트·필드·인증 헤더)이 실제로 맞는지
1회 실연동으로 확인한다. 로컬/CI 어디서든 키만 있으면 돌릴 수 있다.

흐름:
    1) create_avatar(photo)           → avatar_id (사진으로 아바타 1회 생성)
    2) submit_talking_video(avatar_id, audio) → video_id (ElevenLabs 음성 결합)
    3) get_generation_status(video_id) 폴링   → status=completed + video_url

음성 소스(둘 중 하나):
    - 인자로 오디오 파일(mp3/wav)을 주면 그걸 그대로 사용한다.
    - 안 주면 ELEVENLABS_API_KEY 가 있을 때 짧은 한국어 문장을 ElevenLabs 로 합성한다
      (실제 강의 Q&A 와 같은 '사진 + ElevenLabs 음성' 결합 경로를 그대로 재현).

사용법(backend/ 에서):
    # Railway 와 동일하게 키를 환경변수로 주고 실행
    VISIONSTORY_API_KEY=sk-vs-... ELEVENLABS_API_KEY=... \
        python scripts/visionstory_smoke.py /path/to/photo.jpg

    # 직접 준비한 음성 파일을 쓰려면
    VISIONSTORY_API_KEY=sk-vs-... \
        python scripts/visionstory_smoke.py /path/to/photo.jpg /path/to/voice.mp3

종료 코드: 성공 0, 실패 1. 완료 영상 URL 을 stdout 에 출력한다.
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

# 콘솔 코드페이지(예: Windows cp949)와 무관하게 출력하도록 UTF-8 로 재설정(가능하면).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 — 구버전/리다이렉트 환경이면 그냥 둔다.
        pass

# backend/ 를 import 경로에 추가(스크립트가 backend/scripts/ 에 있음).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_SAMPLE_TEXT = (
    "안녕하세요. 비전스토리 아바타 스모크 테스트입니다. "
    "이 음성과 사진이 자연스럽게 결합되는지 확인합니다."
)
_POLL_TIMEOUT_SEC = 300
_POLL_INTERVAL_SEC = 5


def _guess_image_ctype(path: Path) -> str:
    return "image/png" if path.suffix.lower() == ".png" else "image/jpeg"


def _guess_audio_ctype(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".wav":
        return "audio/wav"
    return "audio/mpeg"


async def _load_audio(audio_path: Path | None) -> tuple[bytes, str]:
    """음성 바이트와 content-type 을 준비한다(파일 우선, 없으면 ElevenLabs 합성)."""
    if audio_path is not None:
        data = audio_path.read_bytes()
        print(f"[smoke] 음성 파일 사용: {audio_path} ({len(data):,} bytes)")
        return data, _guess_audio_ctype(audio_path)

    from app.core.config import settings
    from app.services.pipeline import tts

    if not (settings.ELEVENLABS_API_KEY or "").strip():
        print(
            "[smoke] 오류: 음성 파일도 없고 ELEVENLABS_API_KEY 도 비어 있습니다. "
            "음성 파일을 두 번째 인자로 주거나 ELEVENLABS_API_KEY 를 설정하세요.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    print("[smoke] ElevenLabs 로 샘플 음성 합성 중 ...")
    result = await tts.synthesize(_SAMPLE_TEXT)
    print(f"[smoke] ElevenLabs 합성 완료: {len(result.audio_bytes):,} bytes")
    return result.audio_bytes, "audio/mpeg"


async def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        print("오류: 사진 경로를 첫 번째 인자로 주세요.", file=sys.stderr)
        return 1

    image_path = Path(sys.argv[1])
    audio_path = Path(sys.argv[2]) if len(sys.argv) >= 3 else None

    if not image_path.is_file():
        print(f"오류: 사진 파일을 찾을 수 없습니다 — {image_path}", file=sys.stderr)
        return 1
    if audio_path is not None and not audio_path.is_file():
        print(f"오류: 음성 파일을 찾을 수 없습니다 — {audio_path}", file=sys.stderr)
        return 1

    from app.core.config import settings
    from app.services.pipeline import visionstory

    if not (settings.VISIONSTORY_API_KEY or "").strip() and not settings.VISIONSTORY_MOCK:
        print(
            "오류: VISIONSTORY_API_KEY 가 비어 있습니다(그리고 MOCK 도 off). "
            "Railway 와 동일한 키를 환경변수로 주고 다시 실행하세요.",
            file=sys.stderr,
        )
        return 1

    print(f"[smoke] base_url={settings.VISIONSTORY_BASE_URL}")
    print(f"[smoke] model_id={settings.VISIONSTORY_MODEL_ID} "
          f"resolution={settings.VISIONSTORY_RESOLUTION} "
          f"aspect={settings.VISIONSTORY_ASPECT_RATIO} "
          f"emotion={settings.VISIONSTORY_EMOTION or '<생략>'} "
          f"mock={settings.VISIONSTORY_MOCK}")

    image_bytes = image_path.read_bytes()
    image_ctype = _guess_image_ctype(image_path)
    print(f"[smoke] 사진 사용: {image_path} ({len(image_bytes):,} bytes, {image_ctype})")

    try:
        audio_bytes, audio_ctype = await _load_audio(audio_path)

        # 1) 사진 → 아바타 1회 생성.
        print("[smoke] 1/3 create_avatar ...")
        avatar_id = await visionstory.create_avatar(image_bytes, image_ctype)
        print(f"[smoke]     → avatar_id={avatar_id}")

        # 2) 아바타 + 음성 → 영상 렌더 제출.
        print("[smoke] 2/3 submit_talking_video ...")
        video_id = await visionstory.submit_talking_video(
            avatar_id=avatar_id,
            audio_bytes=audio_bytes,
            audio_ctype=audio_ctype,
        )
        print(f"[smoke]     → video_id={video_id}")

        # 3) 상태 폴링.
        print(f"[smoke] 3/3 폴링(최대 {_POLL_TIMEOUT_SEC}s) ...")
        deadline = time.monotonic() + _POLL_TIMEOUT_SEC
        while True:
            st = await visionstory.get_generation_status(video_id)
            status = st.get("status")
            print(f"[smoke]     status={status} url={st.get('video_url') or '-'}")
            if status == "completed":
                url = st.get("video_url")
                print("\n[OK] 성공: 사진 + 음성 -> 영상 생성 완료")
                print(f"video_url: {url}")
                return 0
            if status == "failed":
                print(f"\n[FAIL] VisionStory 렌더 실패 — {st.get('error')}",
                      file=sys.stderr)
                return 1
            if time.monotonic() > deadline:
                print(f"\n[FAIL] 타임아웃: {_POLL_TIMEOUT_SEC}s 안에 완료되지 않음 "
                      f"(마지막 status={status})", file=sys.stderr)
                return 1
            await asyncio.sleep(_POLL_INTERVAL_SEC)
    except visionstory.VisionStoryError as e:
        print(f"\n[FAIL] VisionStoryError: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
