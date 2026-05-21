"""PPTX 슬라이드를 페이지별 PNG 이미지로 렌더링하는 서비스.

studio 편집기 중앙 미리보기 영역에서 실제 슬라이드 외형을 즉시 보여주기 위한
용도. python-pptx 는 슬라이드 자체를 이미지로 만들지 못하므로 LibreOffice
headless 로 PDF 변환 후 ``pdftoppm`` 으로 PNG 한 장씩 추출한다.

Docker 이미지에는 ``libreoffice-impress`` (soffice) 와 ``poppler-utils``
(pdftoppm) 가 설치되어 있어야 한다 — Dockerfile / Dockerfile.prod 참고.

이 모듈은 외부 호출자(파이프라인 step1)와의 contract 만 유지하면 충분하며,
세부 구현 (soffice 호출 옵션, pdftoppm zero-padding 처리 등) 은 자유롭게
바꿔도 된다.
"""
from __future__ import annotations

import logging
import re
import shutil
import subprocess
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

SOFFICE_TIMEOUT_SEC = 120
PDFTOPPM_TIMEOUT_SEC = 120


class SlideRenderError(RuntimeError):
    """슬라이드 렌더 단계가 회복 불가능하게 실패했을 때 발생."""


def render_pptx_to_images(
    pptx_path: Path,
    output_dir: Path,
    dpi: int = 110,
) -> list[Path]:
    """PPTX 파일을 슬라이드 단위 PNG 로 렌더링한다.

    Args:
        pptx_path: 변환 대상 PPTX 파일 경로.
        output_dir: PNG 출력 디렉토리. 자동 생성된다. 중간 PDF 파일도 같은
            디렉토리에 떨어지지만 함수 종료 전에 정리된다.
        dpi: pdftoppm 의 ``-r`` 값. 110 정도면 1920×1080 슬라이드가 약
            1500px 폭으로 떨어져 미리보기에 충분하면서 파일 크기도 50~150KB.

    Returns:
        슬라이드 1-based 순서대로 정렬된 PNG 경로 리스트.

    Raises:
        SlideRenderError: soffice 또는 pdftoppm 실행 자체가 실패하거나
            PNG 가 한 장도 만들어지지 않은 경우. 호출자(파이프라인)는 이를
            잡아서 graceful 하게 처리(슬라이드 이미지 없이 진행)할 수 있다.
    """
    pptx_path = Path(pptx_path)
    output_dir = Path(output_dir)
    if not pptx_path.is_file():
        raise SlideRenderError(f"PPTX 파일이 존재하지 않습니다: {pptx_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = _convert_pptx_to_pdf(pptx_path, output_dir)
    try:
        png_paths = _convert_pdf_to_pngs(pdf_path, output_dir, dpi=dpi)
    finally:
        try:
            pdf_path.unlink()
        except OSError:
            pass

    if not png_paths:
        raise SlideRenderError(
            f"PNG 가 한 장도 생성되지 않았습니다: pptx={pptx_path.name}"
        )

    logger.info(
        "슬라이드 렌더 완료: pptx=%s, %d 장 (dpi=%d)",
        pptx_path.name, len(png_paths), dpi,
    )
    return png_paths


def _convert_pptx_to_pdf(pptx_path: Path, output_dir: Path) -> Path:
    """LibreOffice headless 로 PPTX → PDF 변환. PDF 경로 반환."""
    if shutil.which("soffice") is None:
        raise SlideRenderError(
            "soffice (LibreOffice) 가 설치되어 있지 않습니다. "
            "Dockerfile 에 libreoffice-impress 가 설치돼 있는지 확인하세요."
        )

    # 동시 호출 시 LibreOffice 사용자 프로필 락 충돌을 피하기 위해 호출마다
    # 격리된 UserInstallation 디렉토리를 강제로 지정한다.
    profile_dir = output_dir / f"_lo_profile_{uuid.uuid4().hex[:8]}"
    profile_dir.mkdir(parents=True, exist_ok=True)
    user_install = profile_dir.absolute().as_uri()

    cmd = [
        "soffice",
        "--headless",
        f"-env:UserInstallation={user_install}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(output_dir),
        str(pptx_path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=SOFFICE_TIMEOUT_SEC,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SlideRenderError(f"soffice 실행 파일을 찾지 못했습니다: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise SlideRenderError(
            f"PPTX→PDF 변환 타임아웃 ({SOFFICE_TIMEOUT_SEC}초): {pptx_path.name}"
        ) from exc
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)

    if proc.returncode != 0:
        raise SlideRenderError(
            "soffice 변환 실패: returncode=%d stderr=%s"
            % (proc.returncode, proc.stderr.decode("utf-8", errors="replace")[:500])
        )

    pdf_path = output_dir / (pptx_path.stem + ".pdf")
    if not pdf_path.is_file():
        # soffice 가 파일명을 살짝 바꾸는 경우가 있어 fallback 탐색
        candidates = sorted(output_dir.glob("*.pdf"))
        if not candidates:
            raise SlideRenderError(
                f"PDF 출력 파일을 찾을 수 없습니다: outdir={output_dir}"
            )
        pdf_path = candidates[0]
    return pdf_path


def _convert_pdf_to_pngs(pdf_path: Path, output_dir: Path, dpi: int) -> list[Path]:
    """pdftoppm 로 PDF → PNG 변환. 1-based 정렬된 PNG 경로 리스트 반환."""
    if shutil.which("pdftoppm") is None:
        raise SlideRenderError(
            "pdftoppm (poppler-utils) 가 설치되어 있지 않습니다. "
            "Dockerfile 에 poppler-utils 가 설치돼 있는지 확인하세요."
        )

    prefix = output_dir / f"slide_{uuid.uuid4().hex[:8]}"
    cmd = [
        "pdftoppm",
        "-png",
        "-r",
        str(int(dpi)),
        str(pdf_path),
        str(prefix),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=PDFTOPPM_TIMEOUT_SEC,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SlideRenderError(f"pdftoppm 실행 파일을 찾지 못했습니다: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise SlideRenderError(
            f"PDF→PNG 변환 타임아웃 ({PDFTOPPM_TIMEOUT_SEC}초): {pdf_path.name}"
        ) from exc

    if proc.returncode != 0:
        raise SlideRenderError(
            "pdftoppm 실패: returncode=%d stderr=%s"
            % (proc.returncode, proc.stderr.decode("utf-8", errors="replace")[:500])
        )

    return _sorted_pngs_for_prefix(prefix)


# pdftoppm 은 페이지 번호를 zero-pad 한다 — 9 페이지 이하면 "-1.png", 10 페이지
# 이상이면 "-01.png" / "-001.png" 식으로. 정렬 시 숫자 추출이 안전하다.
_PAGE_NUMBER_RE = re.compile(r"-(\d+)\.png$")


def _sorted_pngs_for_prefix(prefix: Path) -> list[Path]:
    parent = prefix.parent
    prefix_name = prefix.name
    matches: list[tuple[int, Path]] = []
    for png in parent.glob(f"{prefix_name}-*.png"):
        m = _PAGE_NUMBER_RE.search(png.name)
        if not m:
            continue
        matches.append((int(m.group(1)), png))
    matches.sort(key=lambda t: t[0])
    return [p for _, p in matches]
