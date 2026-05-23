"""LivePortrait(표정·머리 움직임) + MuseTalk(립싱크) 2단 조합 — 가장 자연스럽지만
가장 무겁고 셋업이 까다롭다.

파이프라인:
  1) LivePortrait: 소스 사진 + '구동 영상'(중립 토킹 모션) → 머리·표정이 움직이는
     영상(입모양은 우리 오디오와 무관).
  2) MuseTalk: 그 영상 + 우리 오디오 → 입 영역만 오디오에 맞게 다시 그림.
  결과 = 자연스러운 머리/표정 + 정확한 립싱크.

레포: https://github.com/KwaiVGI/LivePortrait , https://github.com/TMElyralab/MuseTalk
구동 영상은 LivePortrait 예제(assets/examples/driving/*)나 TH_DRIVING_VIDEO 로 지정.
VERIFY: 양 레포의 inference CLI·출력 경로는 버전에 따라 다르니 PoC 에서 1회 고정.
"""
from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

from . import musetalk as _mt
from .base import SynthesisResult, TalkingHeadProvider, register


class MuseTalkLivePortraitProvider(TalkingHeadProvider):
    name = "musetalk_liveportrait"

    def __init__(self, repo_dir: Path, python_bin: str = "python"):
        super().__init__(repo_dir, python_bin)
        repos_root = self.repo_dir.parent
        self.lp_dir = repos_root / "liveportrait"
        self.mt_dir = repos_root / "musetalk"

    def is_available(self) -> bool:
        lp_ok = (self.lp_dir / "inference.py").exists()
        mt_ok = (self.mt_dir / "scripts").is_dir()
        return lp_ok and mt_ok

    def _driving_video(self) -> Path | None:
        env = os.environ.get("TH_DRIVING_VIDEO")
        if env and Path(env).exists():
            return Path(env)
        # LivePortrait 기본 예제(VERIFY: 파일명은 레포 버전에 따라 다를 수 있음).
        cands = sorted((self.lp_dir / "assets" / "examples" / "driving").glob("*.mp4"))
        return cands[0] if cands else None

    def synthesize(self, image: Path, audio: Path, out: Path) -> SynthesisResult:
        if not self.is_available():
            return SynthesisResult(self.name, False, None, 0.0,
                                   error="liveportrait/musetalk repo 둘 다 필요")
        drive = self._driving_video()
        if drive is None:
            return SynthesisResult(self.name, False, None, 0.0,
                                   error="구동 영상 없음 — TH_DRIVING_VIDEO 지정 필요")
        out.parent.mkdir(parents=True, exist_ok=True)
        started = time.time()

        # 1) LivePortrait: 사진 + 구동영상 → 모션 영상
        motion = out.parent / f"{self.name}_motion.mp4"
        lp_cmd = [
            self.python_bin, "inference.py",
            "-s", str(image), "-d", str(drive),
            "-o", str(out.parent),
        ]
        lp = subprocess.run(lp_cmd, cwd=str(self.lp_dir), capture_output=True, text=True)
        lp_out = self._latest_mp4(out.parent, exclude=motion)
        if lp.returncode != 0 or lp_out is None:
            return SynthesisResult(self.name, False, None, time.time() - started,
                                   log=(lp.stdout + lp.stderr)[-2000:],
                                   error="LivePortrait 단계 실패")
        lp_out.rename(motion)

        # 2) MuseTalk: 모션 영상 + 오디오 → 립싱크 (musetalk 어댑터 재사용)
        mt_provider = _mt.MuseTalkProvider(self.mt_dir, self.python_bin)
        mt_provider._cfg = mt_provider._write_cfg(motion, audio, out.parent)  # noqa: SLF001
        mt_cmd = mt_provider.build_command(image, audio, out)
        mt = subprocess.run(mt_cmd, cwd=str(self.mt_dir), capture_output=True, text=True)
        final = self._latest_mp4(out.parent, exclude=motion)
        ok = mt.returncode == 0 and final is not None
        return SynthesisResult(
            self.name, ok, final, time.time() - started,
            log=(mt.stdout + mt.stderr)[-2000:],
            error="" if ok else "MuseTalk 단계 실패",
        )

    @staticmethod
    def _latest_mp4(d: Path, exclude: Path | None = None) -> Path | None:
        cands = [p for p in d.glob("*.mp4") if p != exclude]
        cands.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return cands[0] if cands else None

    def build_command(self, image: Path, audio: Path, out: Path) -> list[str]:  # unused
        raise NotImplementedError("2단 파이프라인은 synthesize 를 직접 구현한다")


@register("musetalk_liveportrait")
def _factory(repo_dir: Path, python_bin: str = "python") -> MuseTalkLivePortraitProvider:
    return MuseTalkLivePortraitProvider(repo_dir, python_bin)
