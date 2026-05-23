"""토킹헤드 provider 공통 인터페이스 + 레지스트리.

목표: "사진 1장 + 음성 → 말하는 얼굴 영상" 을 만드는 여러 오픈소스 모델을
동일한 인터페이스로 감싸, run_comparison.py 가 같은 입력으로 일괄 실행하고
품질·속도·비용을 한 자리에서 비교할 수 있게 한다.

각 어댑터는 해당 공식 레포의 inference 진입점을 subprocess 로 호출한다(모델
코드를 이 레포에 복제하지 않는다 — setup/ 스크립트가 공식 레포를 clone 한다).
실제 CLI 인자는 레포 버전에 따라 달라질 수 있어, 불확실한 부분은 주석에
`VERIFY:` 로 표시했다. PoC 단계에서 한 번 맞춰 고정하는 것을 전제로 한다.
"""
from __future__ import annotations

import dataclasses
import shutil
import subprocess
import time
from pathlib import Path
from typing import Callable


@dataclasses.dataclass
class SynthesisResult:
    provider: str
    ok: bool
    output_path: Path | None
    seconds: float
    log: str = ""
    error: str = ""


class TalkingHeadProvider:
    """모든 토킹헤드 어댑터가 구현하는 인터페이스.

    name:        결과 표/디렉토리에 쓰는 식별자.
    repo_dir:    공식 레포를 clone 한 경로(setup 스크립트가 만든다).
    is_available: 레포·가중치가 준비됐는지(없으면 비교에서 자동 skip).
    synthesize:  (이미지, 오디오, 출력경로) → 영상 1개 생성.
    """

    name: str = "base"

    def __init__(self, repo_dir: Path, python_bin: str = "python"):
        self.repo_dir = Path(repo_dir)
        self.python_bin = python_bin

    # ── 하위 클래스가 구현 ────────────────────────────────────────────────
    def is_available(self) -> bool:
        raise NotImplementedError

    def build_command(self, image: Path, audio: Path, out: Path) -> list[str]:
        raise NotImplementedError

    # ── 공통 실행 로직 ────────────────────────────────────────────────────
    def synthesize(self, image: Path, audio: Path, out: Path) -> SynthesisResult:
        if not self.is_available():
            return SynthesisResult(
                self.name, False, None, 0.0,
                error=f"{self.name}: repo/weights 미준비 — setup/setup_{self.name}.sh 먼저 실행",
            )
        out.parent.mkdir(parents=True, exist_ok=True)
        cmd = self.build_command(image, audio, out)
        started = time.time()
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(self.repo_dir),
                capture_output=True,
                text=True,
                timeout=60 * 30,  # 30분 안전장치
            )
        except subprocess.TimeoutExpired:
            return SynthesisResult(
                self.name, False, None, time.time() - started,
                error="timeout (30m)",
            )
        elapsed = time.time() - started
        produced = self._resolve_output(out)
        ok = proc.returncode == 0 and produced is not None
        return SynthesisResult(
            self.name,
            ok,
            produced,
            elapsed,
            log=(proc.stdout or "")[-2000:] + (proc.stderr or "")[-2000:],
            error="" if ok else f"exit={proc.returncode}, output 없음" ,
        )

    def _resolve_output(self, out: Path) -> Path | None:
        """일부 레포는 out 경로를 그대로 안 쓰고 result_dir 안에 임의 이름으로
        저장한다. 정확히 out 이 있으면 그걸, 없으면 out.parent 에서 가장 최근
        mp4 를 찾아 반환한다(어댑터가 result_dir 를 out.parent 로 넘기는 전제)."""
        if out.exists():
            return out
        cands = sorted(
            out.parent.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True
        )
        return cands[0] if cands else None


# ── 레지스트리 ────────────────────────────────────────────────────────────────
_REGISTRY: dict[str, Callable[..., TalkingHeadProvider]] = {}


def register(name: str):
    def deco(factory: Callable[..., TalkingHeadProvider]):
        _REGISTRY[name] = factory
        return factory
    return deco


def build_all(repos_root: Path, python_bin: str = "python") -> list[TalkingHeadProvider]:
    """등록된 모든 provider 를 인스턴스화. repos_root/<name> 을 repo_dir 로 가정."""
    out: list[TalkingHeadProvider] = []
    for name, factory in _REGISTRY.items():
        out.append(factory(repo_dir=repos_root / name, python_bin=python_bin))
    return out


def have(binary: str) -> bool:
    return shutil.which(binary) is not None
