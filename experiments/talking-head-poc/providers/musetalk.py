"""MuseTalk 어댑터 — 고품질 실시간 립싱크(머리 움직임은 입력 영상에 의존).

공식 레포: https://github.com/TMElyralab/MuseTalk
MuseTalk 은 '얼굴 영상'의 입 영역을 오디오에 맞춰 다시 그린다. 단일 사진만 있을
때는 _media.still_video_from_image 로 정지 영상을 만들어 입력한다(머리 고정).
머리·표정 움직임까지 원하면 musetalk_liveportrait 조합을 쓴다.

주의: MuseTalk 은 config(yaml) 기반 추론이라, 어댑터가 임시 yaml 을 생성한다.
레포 버전(1.0/1.5)에 따라 스크립트 경로·yaml 스키마가 다를 수 있어 VERIFY 표시.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from . import _media
from .base import SynthesisResult, TalkingHeadProvider, register


class MuseTalkProvider(TalkingHeadProvider):
    name = "musetalk"

    def is_available(self) -> bool:
        models = self.repo_dir / "models"
        return (self.repo_dir / "scripts").is_dir() and models.is_dir() and any(models.iterdir())

    def synthesize(self, image: Path, audio: Path, out: Path) -> SynthesisResult:
        if not self.is_available():
            return SynthesisResult(self.name, False, None, 0.0,
                                   error="MuseTalk repo/models 미준비")
        # 1) 사진 → 정지 구동영상
        try:
            drive = _media.still_video_from_image(
                image, audio, out.parent / f"{self.name}_drive.mp4"
            )
        except Exception as e:  # noqa: BLE001
            return SynthesisResult(self.name, False, None, 0.0, error=f"still-video 실패: {e}")
        # 2) 임시 inference yaml 생성 (VERIFY: 레포 버전별 키 차이)
        self._drive = drive
        self._cfg = self._write_cfg(drive, audio, out.parent)
        return super().synthesize(image, audio, out)

    def _write_cfg(self, drive: Path, audio: Path, out_dir: Path) -> Path:
        cfg = (
            "task_0:\n"
            f"  video_path: \"{drive.as_posix()}\"\n"
            f"  audio_path: \"{audio.as_posix()}\"\n"
            "  bbox_shift: 0\n"
        )
        f = Path(tempfile.NamedTemporaryFile(suffix=".yaml", delete=False, dir=out_dir).name)
        f.write_text(cfg, encoding="utf-8")
        return f

    def build_command(self, image: Path, audio: Path, out: Path) -> list[str]:
        # VERIFY: MuseTalk 1.5 기준. 1.0 은 `-m scripts.inference --inference_config ...`.
        return [
            self.python_bin, "-m", "scripts.inference",
            "--inference_config", str(self._cfg),
            "--result_dir", str(out.parent),
        ]


@register("musetalk")
def _factory(repo_dir: Path, python_bin: str = "python") -> MuseTalkProvider:
    return MuseTalkProvider(repo_dir, python_bin)
