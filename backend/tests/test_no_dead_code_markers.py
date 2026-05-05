"""T10: dead-code 마커 회귀 가드.

현재 ``app/`` 트리에는 ``# TODO`` / ``# FIXME`` / ``# XXX`` / ``# HACK`` 마커가 없다.
새로 들어오는 마커는 GitHub issue 링크 (``# TODO(#123): ...``) 와 함께만 허용된다.
이 테스트는 위 정책을 강제한다.
"""
from __future__ import annotations

import re
from pathlib import Path

_APP_ROOT = Path(__file__).resolve().parent.parent / "app"

# `# TODO` / `# FIXME` / `# XXX` / `# HACK` — 단어 경계 기준.
# 허용 형식: `# TODO(#123): ...` 또는 `# TODO(http(s)://github.com/...): ...`
_MARKER = re.compile(r"#\s*(TODO|FIXME|XXX|HACK)\b(.*)$", re.IGNORECASE)
_ISSUE_LINK = re.compile(r"\(\s*(#\d+|https?://github\.com/[^)\s]+)\s*\)")


def _iter_app_py_files():
    for path in _APP_ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def test_no_unmarked_todo_fixme_xxx_hack_in_app():
    """이슈 링크 없는 TODO/FIXME/XXX/HACK 는 차단."""
    offenders: list[tuple[str, int, str]] = []
    for path in _iter_app_py_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            m = _MARKER.search(line)
            if not m:
                continue
            tail = m.group(2)
            if _ISSUE_LINK.search(tail):
                continue  # 이슈 링크가 붙어 있으면 통과
            offenders.append((str(path.relative_to(_APP_ROOT.parent)), lineno, line.strip()))
    assert offenders == [], (
        "이슈 링크 없는 TODO/FIXME/XXX/HACK 마커 검출 — 처리하거나 GH 이슈 번호를 붙이세요:\n"
        + "\n".join(f"  {p}:{n}  {src}" for p, n, src in offenders)
    )


def test_no_commented_out_import_or_def_in_app():
    """주석으로 죽여둔 import / def / class 라인은 dead code — 제거 필요."""
    pattern = re.compile(r"^\s*#\s*(import |from |def |class |async )")
    offenders: list[tuple[str, int, str]] = []
    for path in _iter_app_py_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if pattern.match(line):
                offenders.append((str(path.relative_to(_APP_ROOT.parent)), lineno, line.strip()))
    assert offenders == [], (
        "commented-out 코드 검출 — 삭제하거나 살리세요:\n"
        + "\n".join(f"  {p}:{n}  {src}" for p, n, src in offenders)
    )
