"""slide_renderer 단위 테스트.

실제 LibreOffice / pdftoppm 이 설치돼 있지 않아도 통과하도록 ``shutil.which``
와 ``subprocess.run`` 을 monkeypatch 한다. 통합 검증은 CI 의 Docker 빌드
이후 e2e 테스트가 맡는다.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.pipeline import slide_renderer
from app.services.pipeline.slide_renderer import (
    SlideRenderError,
    _sorted_pngs_for_prefix,
    render_pptx_to_images,
)


# ── _sorted_pngs_for_prefix ──────────────────────────────────────────────────


def test_sorted_pngs_handles_zero_padding(tmp_path: Path):
    """pdftoppm 이 zero-pad 한 파일명도 페이지 번호 기준으로 정렬."""
    prefix = tmp_path / "slide_abc"
    # 12 페이지 시뮬레이션 — pdftoppm 은 2자리 패딩
    for n in (1, 2, 3, 10, 11, 12):
        (tmp_path / f"slide_abc-{n:02d}.png").write_bytes(b"\x89PNG")

    result = _sorted_pngs_for_prefix(prefix)
    names = [p.name for p in result]

    assert names == [
        "slide_abc-01.png",
        "slide_abc-02.png",
        "slide_abc-03.png",
        "slide_abc-10.png",
        "slide_abc-11.png",
        "slide_abc-12.png",
    ]


def test_sorted_pngs_ignores_unrelated_files(tmp_path: Path):
    prefix = tmp_path / "slide_xyz"
    (tmp_path / "slide_xyz-1.png").write_bytes(b"\x89PNG")
    (tmp_path / "slide_xyz-2.png").write_bytes(b"\x89PNG")
    (tmp_path / "other-1.png").write_bytes(b"\x89PNG")
    (tmp_path / "slide_xyz.pdf").write_bytes(b"%PDF")

    result = _sorted_pngs_for_prefix(prefix)
    assert [p.name for p in result] == ["slide_xyz-1.png", "slide_xyz-2.png"]


# ── render_pptx_to_images: 정상 경로 ─────────────────────────────────────────


def _fake_subprocess_run_factory(tmp_path: Path, png_count: int = 3):
    """soffice/pdftoppm 흐름을 시뮬레이션하는 fake subprocess.run.

    soffice 호출 시: outdir 에 PDF 파일을 만든다.
    pdftoppm 호출 시: prefix-N.png 파일들을 만든다.
    """

    def _fake_run(cmd, *args, **kwargs):
        result = MagicMock(spec=subprocess.CompletedProcess)
        result.returncode = 0
        result.stdout = b""
        result.stderr = b""

        if cmd[0] == "soffice":
            outdir_idx = cmd.index("--outdir") + 1
            outdir = Path(cmd[outdir_idx])
            pptx_path = Path(cmd[-1])
            (outdir / (pptx_path.stem + ".pdf")).write_bytes(b"%PDF-1.4\n%%EOF\n")
        elif cmd[0] == "pdftoppm":
            prefix = Path(cmd[-1])
            for n in range(1, png_count + 1):
                (prefix.parent / f"{prefix.name}-{n}.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        return result

    return _fake_run


def test_render_pptx_to_images_happy_path(tmp_path: Path):
    pptx = tmp_path / "lecture.pptx"
    pptx.write_bytes(b"PK\x03\x04 fake pptx")
    out_dir = tmp_path / "out"

    fake_run = _fake_subprocess_run_factory(tmp_path, png_count=3)

    with patch.object(slide_renderer.shutil, "which", return_value="/usr/bin/x"), \
         patch.object(slide_renderer.subprocess, "run", side_effect=fake_run):
        pngs = render_pptx_to_images(pptx, out_dir, dpi=110)

    assert len(pngs) == 3
    # 1-based 순서
    for i, p in enumerate(pngs, start=1):
        assert p.name.endswith(f"-{i}.png")
        assert p.is_file()
    # 중간 PDF 는 정리됨
    assert not list(out_dir.glob("*.pdf"))


# ── 실패 케이스 ──────────────────────────────────────────────────────────────


def test_missing_pptx_raises(tmp_path: Path):
    with pytest.raises(SlideRenderError, match="존재하지 않습니다"):
        render_pptx_to_images(tmp_path / "nope.pptx", tmp_path / "out")


def test_soffice_not_installed(tmp_path: Path):
    pptx = tmp_path / "x.pptx"
    pptx.write_bytes(b"PK\x03\x04")

    def _which(name: str):
        return None if name == "soffice" else "/usr/bin/x"

    with patch.object(slide_renderer.shutil, "which", side_effect=_which):
        with pytest.raises(SlideRenderError, match="soffice"):
            render_pptx_to_images(pptx, tmp_path / "out")


def test_pdftoppm_not_installed(tmp_path: Path):
    pptx = tmp_path / "x.pptx"
    pptx.write_bytes(b"PK\x03\x04")

    def _which(name: str):
        return None if name == "pdftoppm" else "/usr/bin/x"

    fake_run = _fake_subprocess_run_factory(tmp_path)

    with patch.object(slide_renderer.shutil, "which", side_effect=_which), \
         patch.object(slide_renderer.subprocess, "run", side_effect=fake_run):
        with pytest.raises(SlideRenderError, match="pdftoppm"):
            render_pptx_to_images(pptx, tmp_path / "out")


def test_soffice_nonzero_returncode(tmp_path: Path):
    pptx = tmp_path / "x.pptx"
    pptx.write_bytes(b"PK\x03\x04")

    def _fake_run(cmd, *args, **kwargs):
        result = MagicMock()
        result.returncode = 1
        result.stderr = b"convert error: corrupt file"
        result.stdout = b""
        return result

    with patch.object(slide_renderer.shutil, "which", return_value="/usr/bin/x"), \
         patch.object(slide_renderer.subprocess, "run", side_effect=_fake_run):
        with pytest.raises(SlideRenderError, match="soffice 변환 실패"):
            render_pptx_to_images(pptx, tmp_path / "out")


def test_soffice_timeout(tmp_path: Path):
    pptx = tmp_path / "x.pptx"
    pptx.write_bytes(b"PK\x03\x04")

    def _fake_run(cmd, *args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=cmd, timeout=120)

    with patch.object(slide_renderer.shutil, "which", return_value="/usr/bin/x"), \
         patch.object(slide_renderer.subprocess, "run", side_effect=_fake_run):
        with pytest.raises(SlideRenderError, match="타임아웃"):
            render_pptx_to_images(pptx, tmp_path / "out")


def test_no_png_generated(tmp_path: Path):
    """pdftoppm 이 0 출력을 낸 비정상 케이스."""
    pptx = tmp_path / "x.pptx"
    pptx.write_bytes(b"PK\x03\x04")

    def _fake_run(cmd, *args, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stderr = b""
        result.stdout = b""
        if cmd[0] == "soffice":
            outdir = Path(cmd[cmd.index("--outdir") + 1])
            (outdir / (Path(cmd[-1]).stem + ".pdf")).write_bytes(b"%PDF")
        # pdftoppm: PNG 를 안 만든다
        return result

    with patch.object(slide_renderer.shutil, "which", return_value="/usr/bin/x"), \
         patch.object(slide_renderer.subprocess, "run", side_effect=_fake_run):
        with pytest.raises(SlideRenderError, match="PNG 가 한 장도"):
            render_pptx_to_images(pptx, tmp_path / "out")
