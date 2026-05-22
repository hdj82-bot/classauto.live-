"""Wav2Lip 어댑터 — 입모양만 정밀하게 맞춤(머리 움직임 없음, 매우 빠름/가벼움).

공식 레포: https://github.com/Rudrabha/Wav2Lip
(가중치 다운로드가 막혀 있으면 유지보수 포크 https://github.com/justinjohn0306/Wav2Lip 사용)
단일 이미지를 --face 로 받아 정지 얼굴에 립싱크만 입힌다. 가장 저렴/고속이지만
머리·표정 움직임이 없어 "정적"으로 보인다 — LivePortrait 와 결합 동기가 여기서 나온다.
"""
from __future__ import annotations

from pathlib import Path

from .base import TalkingHeadProvider, register


class Wav2LipProvider(TalkingHeadProvider):
    name = "wav2lip"

    def is_available(self) -> bool:
        ckpt = self.repo_dir / "checkpoints" / "wav2lip_gan.pth"
        return (self.repo_dir / "inference.py").exists() and ckpt.exists()

    def build_command(self, image: Path, audio: Path, out: Path) -> list[str]:
        return [
            self.python_bin, "inference.py",
            "--checkpoint_path", "checkpoints/wav2lip_gan.pth",
            "--face", str(image),
            "--audio", str(audio),
            "--outfile", str(out),
        ]


@register("wav2lip")
def _factory(repo_dir: Path, python_bin: str = "python") -> Wav2LipProvider:
    return Wav2LipProvider(repo_dir, python_bin)
