"""quiz_socratic 순수 함수 단위 테스트 (DB·Claude 비의존).

- _shuffle_mc_options: 객관식 보기를 섞어도 정답 텍스트가 보존되고, 여러 번 돌리면
  정답 위치가 A·B·C·D 에 고르게 분포한다(항상 B/C 편향 방지).
- _parse_quick_draft: 퀵 생성 응답(코드펜스/순수 JSON/draft 래퍼)을 정규화한다.
"""
from __future__ import annotations

from collections import Counter

from app.services.quiz_socratic import (
    _parse_quick_draft,
    _shuffle_mc_options,
)


def test_shuffle_preserves_correct_answer_text():
    options = ["가", "나", "다", "라"]
    for ci in range(4):
        new_opts, new_ci = _shuffle_mc_options(options, str(ci))
        # 보기 집합은 동일(순서만 바뀜).
        assert sorted(new_opts) == sorted(options)
        # 새 인덱스가 가리키는 보기는 원래 정답 보기와 같은 텍스트.
        assert new_opts[int(new_ci)] == options[ci]


def test_shuffle_distributes_across_positions():
    options = ["A", "B", "C", "D"]
    # 정답을 항상 1번(B)으로 입력해도, 셔플 후 위치가 0~3 에 고르게 퍼져야 한다.
    counts = Counter()
    for _ in range(400):
        _opts, new_ci = _shuffle_mc_options(options, "1")
        counts[new_ci] += 1
    assert set(counts) == {"0", "1", "2", "3"}
    # 균등(각 100회 기대)에서 크게 벗어나지 않음 — 각 위치 최소 1회 이상, 한 위치 독식 아님.
    assert all(40 < counts[k] < 200 for k in ("0", "1", "2", "3"))


def test_shuffle_noop_for_invalid_input():
    # 4지선다·유효 인덱스가 아니면 그대로 둔다.
    assert _shuffle_mc_options(["A", "B"], "0") == (["A", "B"], "0")
    assert _shuffle_mc_options(["A", "B", "C", "D"], "9") == (
        ["A", "B", "C", "D"],
        "9",
    )


def test_parse_quick_draft_plain_json():
    raw = (
        '{"question_type":"multiple_choice","difficulty":"medium",'
        '"content":"문제?","options":["1","2","3","4"],'
        '"correct_answer":"2","explanation":"해설"}'
    )
    draft = _parse_quick_draft(raw, "multiple_choice", "medium")
    assert draft is not None
    assert draft["content"] == "문제?"
    assert draft["options"] == ["1", "2", "3", "4"]
    assert draft["correct_answer"] == "2"


def test_parse_quick_draft_code_fence_and_chatter():
    raw = (
        "여기 문제입니다.\n```json\n"
        '{"content":"Q","options":["a","b","c","d"],"correct_answer":"0"}\n'
        "```\n참고하세요."
    )
    draft = _parse_quick_draft(raw, "multiple_choice", "easy")
    assert draft is not None
    assert draft["content"] == "Q"
    # 누락된 필드는 요청값으로 보완.
    assert draft["question_type"] == "multiple_choice"
    assert draft["difficulty"] == "easy"


def test_parse_quick_draft_draft_wrapper():
    raw = '{"draft": {"content":"W","options":["1","2","3","4"],"correct_answer":"3"}, "done": true}'
    draft = _parse_quick_draft(raw, "multiple_choice", "hard")
    assert draft is not None
    assert draft["content"] == "W"
    assert draft["correct_answer"] == "3"


def test_parse_quick_draft_garbage_returns_none():
    assert _parse_quick_draft("죄송합니다 만들 수 없습니다", "multiple_choice", "medium") is None
    assert _parse_quick_draft("", "short_answer", "easy") is None
