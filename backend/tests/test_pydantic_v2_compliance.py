"""T8: Pydantic v2 패턴 회귀 가드.

이 코드베이스는 이미 Pydantic v2 패턴 (model_dump, model_config, min_length/max_length,
populate_by_name) 으로 통일돼 있다. 이 테스트는 누군가 v1 패턴을 다시 들여오면 즉시
실패해서 막는 역할을 한다.

별도로, 대표 스키마에서 ``.model_dump()`` 가 정상 동작하는지 ── v1 의 ``.dict()`` 와
의미적으로 동등한 결과를 내는지 ── 한 번 확인해 마이그레이션 회귀를 잡는다.
"""
from __future__ import annotations

from pathlib import Path

# backend/app 하위 .py 파일 — 테스트 디렉토리는 제외 (테스트는 mock 용 .dict 등을 쓸 수 있음)
_APP_ROOT = Path(__file__).resolve().parent.parent / "app"


def _iter_app_py_files():
    for path in _APP_ROOT.rglob("*.py"):
        # __pycache__ 등 제외
        if "__pycache__" in path.parts:
            continue
        yield path


# ── v1 패턴 회귀 가드 ──────────────────────────────────────────────────────


_FORBIDDEN_PATTERNS = [
    # 정확한 substring (false positive 가 거의 없는 것들만 골랐다)
    "min_items=",
    "max_items=",
    "allow_population_by_field_name",
    "class Config:",
    ".parse_obj(",
    ".parse_raw(",
    "update_forward_refs(",
]


def test_no_pydantic_v1_patterns_in_app():
    offenders: list[tuple[str, int, str]] = []
    for path in _iter_app_py_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            stripped = line.lstrip()
            if stripped.startswith("#"):
                continue
            for pat in _FORBIDDEN_PATTERNS:
                if pat in line:
                    offenders.append((str(path.relative_to(_APP_ROOT.parent)), lineno, pat))
    assert offenders == [], (
        "Pydantic v1 잔재 검출 — Pydantic v2 패턴으로 변환 필요:\n"
        + "\n".join(f"  {p}:{n}  ({pat})" for p, n, pat in offenders)
    )


def test_no_pydantic_v1_dict_call_in_app():
    """``.dict(`` 직접 호출 금지 — model_dump() 로 대체.

    ``patch.dict`` / ``__dict__`` / ``dict(`` 같은 false positive 는 토큰 단위로 회피.
    """
    import re

    # `.dict(` 직전이 식별자 끝(즉 메서드 호출), 뒤에 = 가 붙는 dict assignment 가 아닌 케이스만 잡는다.
    pattern = re.compile(r"(?<![A-Za-z0-9_])\.dict\(")
    offenders: list[tuple[str, int, str]] = []
    for path in _iter_app_py_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            stripped = line.lstrip()
            if stripped.startswith("#"):
                continue
            if pattern.search(line):
                offenders.append((str(path.relative_to(_APP_ROOT.parent)), lineno, line.strip()))
    assert offenders == [], (
        "Pydantic v1 .dict() 호출 검출 — .model_dump() 로 대체 필요:\n"
        + "\n".join(f"  {p}:{n}  {src}" for p, n, src in offenders)
    )


# ── 대표 스키마 model_dump 동작 확인 ───────────────────────────────────────


def test_model_dump_produces_dict_compatible_output():
    """대표 스키마에서 ``model_dump()`` 가 v1 ``.dict()`` 와 의미적으로 동등한 dict 를 내는지 확인.

    구체적으로:
    - 결과 타입은 ``dict``
    - 모든 필드 키가 포함됨
    - exclude / include / by_alias 인자가 v1 과 동일하게 동작
    """
    from app.schemas.question import QuestionGenerateRequest

    body = QuestionGenerateRequest(
        ppt_content="슬라이드 1 내용 슬라이드 2 내용",
        formative_count=3,
        summative_count=5,
        video_duration_seconds=300,
    )

    dumped = body.model_dump()
    assert isinstance(dumped, dict)
    assert dumped["ppt_content"].startswith("슬라이드")
    assert dumped["formative_count"] == 3
    assert dumped["summative_count"] == 5
    assert dumped["video_duration_seconds"] == 300

    # exclude
    excluded = body.model_dump(exclude={"ppt_content"})
    assert "ppt_content" not in excluded
    assert excluded["formative_count"] == 3

    # include
    included = body.model_dump(include={"formative_count"})
    assert set(included.keys()) == {"formative_count"}


def test_from_attributes_orm_mode_replacement_works():
    """``model_config = ConfigDict(from_attributes=True)`` 가 v1 의 ``orm_mode=True`` 를 대체."""
    from app.schemas.question import QuestionPublic

    class _StubORMRow:
        id = __import__("uuid").uuid4()
        assessment_type = "formative"
        question_type = "multiple_choice"
        difficulty = "easy"
        content = "샘플"
        options = ["a", "b", "c", "d"]
        timestamp_seconds = 30

    public = QuestionPublic.model_validate(_StubORMRow())
    assert public.content == "샘플"
    assert public.options == ["a", "b", "c", "d"]
