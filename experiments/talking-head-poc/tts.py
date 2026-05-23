"""테스트용 음성 생성 — 강의 스크립트 텍스트 → wav.

토킹헤드 비교에는 '얼굴 사진'과 '음성'이 필요하다. 음성은 어느 TTS 든 무방하나,
PoC 자체 비용을 0 으로 두기 위해 오픈소스 우선:

  1) edge-tts (마이크로소프트 Edge 읽기, 무료·고품질 한국어, 네트워크 필요)
       pip install edge-tts ; 한국어 보이스 예: ko-KR-SunHiNeural
  2) piper (완전 오프라인, 모델 1개 다운로드)

여기서는 edge-tts 를 기본으로 한다(설치·한국어 품질이 가장 쉬움). 실패하면
사용자가 직접 만든 audio.wav 를 samples/ 에 두면 된다.

사용:  python tts.py --text "안녕하세요. 오늘 강의를 시작하겠습니다." --out samples/audio.wav
       python tts.py --text-file samples/script.txt --out samples/audio.wav --voice ko-KR-SunHiNeural
"""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path


async def _edge(text: str, out: Path, voice: str) -> None:
    import edge_tts  # type: ignore

    # mp3 로 받아 wav 로 변환(토킹헤드 모델은 wav 를 선호).
    mp3 = out.with_suffix(".mp3")
    await edge_tts.Communicate(text, voice).save(str(mp3))
    import subprocess

    subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp3), "-ar", "16000", "-ac", "1", str(out)],
        check=True, capture_output=True, text=True,
    )
    mp3.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--text-file")
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default="ko-KR-SunHiNeural")
    args = ap.parse_args()

    text = args.text
    if args.text_file:
        text = Path(args.text_file).read_text(encoding="utf-8")
    if not text:
        raise SystemExit("--text 또는 --text-file 필요")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    asyncio.run(_edge(text, out, args.voice))
    print(f"wrote {out}  ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
