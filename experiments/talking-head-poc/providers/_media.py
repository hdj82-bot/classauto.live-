"""ffmpeg 보조 — MuseTalk/LivePortrait 는 '구동 영상'이 필요해서, 정지 사진을
오디오 길이만큼 looping 한 still-video 로 만들어 입력으로 쓴다."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path


def audio_seconds(audio: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(audio)],
        capture_output=True, text=True,
    )
    try:
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:
        return 8.0  # 알 수 없으면 기본 8초


def still_video_from_image(image: Path, audio: Path, out: Path, fps: int = 25) -> Path:
    """이미지를 오디오 길이만큼 정지 영상으로 만든다(소리 없음). MuseTalk 가
    이 영상의 입 영역을 오디오에 맞춰 다시 그린다."""
    dur = audio_seconds(audio)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-loop", "1", "-i", str(image),
            "-t", f"{dur:.2f}", "-r", str(fps),
            "-vf", "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
            "-pix_fmt", "yuv420p", str(out),
        ],
        check=True, capture_output=True, text=True,
    )
    return out
