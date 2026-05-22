"""SadTalker 어댑터 — 사진 1장 + 음성 → 말하는 얼굴 영상(머리 움직임 포함).

공식 레포: https://github.com/OpenTalker/SadTalker
단일 이미지 + 오디오를 네이티브로 지원해 본 PoC 에서 가장 바로 테스트하기 쉽다.
"""
from __future__ import annotations

from pathlib import Path

from .base import TalkingHeadProvider, register


class SadTalkerProvider(TalkingHeadProvider):
    name = "sadtalker"

    def is_available(self) -> bool:
        # 레포 + 체크포인트 디렉토리(가중치)까지 있어야 실행 가능.
        ckpt = self.repo_dir / "checkpoints"
        return (self.repo_dir / "inference.py").exists() and ckpt.is_dir() and any(ckpt.iterdir())

    def build_command(self, image: Path, audio: Path, out: Path) -> list[str]:
        # result_dir 에 임의 이름의 mp4 를 떨군다 → base._resolve_output 가 집어낸다.
        # --still: 정면 고정(머리 흔들림 최소), --preprocess full: 얼굴 전체,
        # --enhancer gfpgan: 화질 보정(있으면). VERIFY: 레포 버전별 플래그 차이.
        return [
            self.python_bin, "inference.py",
            "--source_image", str(image),
            "--driven_audio", str(audio),
            "--result_dir", str(out.parent),
            "--still",
            "--preprocess", "full",
            "--enhancer", "gfpgan",
        ]


@register("sadtalker")
def _factory(repo_dir: Path, python_bin: str = "python") -> SadTalkerProvider:
    return SadTalkerProvider(repo_dir, python_bin)
