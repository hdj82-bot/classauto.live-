"""script_generator 단위 테스트.

마크다운 sanitizer 의 회귀 방지와 generate_scripts 의 병렬화/순서 보장,
prompt caching 페이로드 형식을 검증한다. Anthropic API 는 mock.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.pipeline.schemas import SlideContent, SlideScript
from app.services.pipeline.script_generator import (
    SYSTEM_PROMPT,
    _strip_markdown,
    _SYSTEM_BLOCKS,
    generate_scripts,
)


# ── _strip_markdown ──────────────────────────────────────────────────────────


class TestStripMarkdown:
    """LLM 출력의 마크다운 문법을 모두 벗기는지 확인."""

    def test_bold_double_star_removed(self):
        assert _strip_markdown("핵심은 **他喜欢猫** 입니다.") == "핵심은 他喜欢猫 입니다."

    def test_bold_double_underscore_removed(self):
        assert _strip_markdown("__중요__한 단어") == "중요한 단어"

    def test_italic_single_star_removed(self):
        assert _strip_markdown("이것은 *기울임* 입니다.") == "이것은 기울임 입니다."

    def test_italic_single_underscore_removed(self):
        assert _strip_markdown("이것은 _기울임_ 입니다.") == "이것은 기울임 입니다."

    def test_inline_code_removed(self):
        assert _strip_markdown("`喜欢` 의 위치") == "喜欢 의 위치"

    def test_heading_markers_removed(self):
        out = _strip_markdown("## 첫 번째\n본문")
        assert out == "첫 번째\n본문"

    def test_h1_to_h6_removed(self):
        for level in range(1, 7):
            prefix = "#" * level
            assert _strip_markdown(f"{prefix} 제목") == "제목"

    def test_blockquote_removed(self):
        assert _strip_markdown("> 인용된 문장") == "인용된 문장"

    def test_horizontal_rule_removed(self):
        assert _strip_markdown("앞\n---\n뒤") == "앞\n\n뒤"

    def test_bullet_list_removed(self):
        out = _strip_markdown("- 첫째\n- 둘째")
        assert out == "첫째\n둘째"

    def test_numbered_list_removed(self):
        out = _strip_markdown("1. 첫째\n2. 둘째")
        assert out == "첫째\n둘째"

    def test_link_keeps_text_only(self):
        assert _strip_markdown("[클릭](http://x)") == "클릭"

    def test_image_keeps_alt_only(self):
        assert _strip_markdown("![설명](http://x.png)") == "설명"

    def test_code_fence_removed(self):
        out = _strip_markdown("앞\n```python\nprint(1)\n```\n뒤")
        # 페어로 비워진 라인은 압축됨
        assert "```" not in out
        assert "앞" in out and "뒤" in out

    def test_mixed_markdown_fully_cleaned(self):
        noisy = (
            "## 슬라이드 요약\n"
            "오늘 배울 문장은 **他(tā)喜欢(xǐhuān)猫(māo)** 입니다.\n"
            "- 핵심 동사: `喜欢`\n"
            "- 자세한 설명은 [여기](http://x) 참고.\n"
            "> 정리: *어순*에 주의하세요.\n"
        )
        cleaned = _strip_markdown(noisy)
        for forbidden in ["**", "##", "`", "[여기]", "> ", "*어순*"]:
            assert forbidden not in cleaned, f"잔존 마크다운: {forbidden!r}"
        # 의미 콘텐츠는 보존
        assert "他(tā)喜欢(xǐhuān)猫(māo)" in cleaned
        assert "喜欢" in cleaned
        assert "어순" in cleaned

    def test_empty_input_passthrough(self):
        assert _strip_markdown("") == ""

    def test_plain_text_unchanged(self):
        plain = "이것은 평범한 문장입니다. 마크다운 없음."
        assert _strip_markdown(plain) == plain


# ── 시스템 프롬프트 정책 ─────────────────────────────────────────────────────


class TestSystemPrompt:
    def test_prompt_explicitly_forbids_markdown(self):
        """프롬프트가 마크다운 금지를 명시해야 한다 (회귀 방지)."""
        assert "마크다운" in SYSTEM_PROMPT
        assert "**" in SYSTEM_PROMPT  # 예시로 ** 가 등장(금지 대상 명시)
        assert "TTS" in SYSTEM_PROMPT

    def test_system_blocks_use_prompt_caching(self):
        """system 파라미터가 cache_control ephemeral 로 표시되어 있어야 한다."""
        assert isinstance(_SYSTEM_BLOCKS, list) and len(_SYSTEM_BLOCKS) == 1
        block = _SYSTEM_BLOCKS[0]
        assert block["type"] == "text"
        assert block["text"] == SYSTEM_PROMPT
        assert block["cache_control"] == {"type": "ephemeral"}


# ── generate_scripts ─────────────────────────────────────────────────────────


def _mock_response(text: str) -> SimpleNamespace:
    """anthropic 응답을 흉내내는 가벼운 mock."""
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(
            input_tokens=10,
            output_tokens=20,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=0,
        ),
    )


class TestGenerateScripts:
    def test_empty_slides_returns_empty(self):
        with patch("app.services.pipeline.script_generator.anthropic.Anthropic"):
            assert generate_scripts([]) == []

    def test_output_text_is_sanitized(self):
        """모델이 마크다운으로 응답해도 결과에는 ** / ## 가 없어야 한다."""
        dirty = "## 슬라이드 요약\n오늘 배울 문장은 **他喜欢猫** 입니다."
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_response(dirty)

        with patch(
            "app.services.pipeline.script_generator.anthropic.Anthropic",
            return_value=mock_client,
        ):
            result = generate_scripts([SlideContent(slide_number=1, texts=["a"])])

        assert len(result) == 1
        assert "**" not in result[0].script
        assert "##" not in result[0].script
        assert "他喜欢猫" in result[0].script

    def test_preserves_slide_order(self):
        """병렬 생성이어도 입력 슬라이드 순서대로 반환되어야 한다."""
        mock_client = MagicMock()

        def respond(*_, **kwargs):
            # 사용자 텍스트에서 슬라이드 번호 추출해 echo
            msgs = kwargs["messages"]
            user_text = msgs[0]["content"][-1]["text"]
            return _mock_response(f"echo: {user_text.splitlines()[0]}")

        mock_client.messages.create.side_effect = respond

        slides = [SlideContent(slide_number=n, texts=[f"s{n}"]) for n in range(1, 6)]

        with patch(
            "app.services.pipeline.script_generator.anthropic.Anthropic",
            return_value=mock_client,
        ):
            result = generate_scripts(slides)

        assert [s.slide_number for s in result] == [1, 2, 3, 4, 5]
        # 각 결과 스크립트는 해당 슬라이드 번호를 포함
        for s in result:
            assert f"슬라이드 {s.slide_number}" in s.script

    def test_uses_prompt_caching_in_api_call(self):
        """messages.create 호출 시 system 이 cache_control 블록 리스트여야 한다."""
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_response("ok")

        with patch(
            "app.services.pipeline.script_generator.anthropic.Anthropic",
            return_value=mock_client,
        ):
            generate_scripts([SlideContent(slide_number=1, texts=["a"])])

        kwargs = mock_client.messages.create.call_args.kwargs
        system = kwargs["system"]
        assert isinstance(system, list)
        assert system[0]["cache_control"] == {"type": "ephemeral"}

    def test_first_slide_primed_before_parallel_rest(self):
        """첫 슬라이드는 풀에 들어가기 전에 끝나야 한다 (priming 보장).

        풀 워커들이 첫 호출과 동시에 실행되면, 첫 호출이 끝나기 전에
        다른 슬라이드 호출이 시작될 수 있다. 첫 호출이 완료된 뒤에야
        나머지가 시작되는지 호출 타이밍으로 확인한다.
        """
        mock_client = MagicMock()
        call_log: list[str] = []

        def respond(*_, **kwargs):
            msgs = kwargs["messages"]
            user_text = msgs[0]["content"][-1]["text"]
            # "## 슬라이드 N" 첫 줄에서 번호 파싱
            first_line = user_text.splitlines()[0]
            call_log.append(first_line)
            return _mock_response("ok")

        mock_client.messages.create.side_effect = respond

        slides = [SlideContent(slide_number=n, texts=[f"s{n}"]) for n in range(1, 4)]

        with patch(
            "app.services.pipeline.script_generator.anthropic.Anthropic",
            return_value=mock_client,
        ):
            generate_scripts(slides)

        # 첫 호출은 반드시 슬라이드 1 (priming)
        assert call_log[0] == "## 슬라이드 1"
        # 나머지 슬라이드들도 모두 호출됨
        assert "## 슬라이드 2" in call_log
        assert "## 슬라이드 3" in call_log

    def test_returns_slidescript_instances(self):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_response("hello")

        with patch(
            "app.services.pipeline.script_generator.anthropic.Anthropic",
            return_value=mock_client,
        ):
            result = generate_scripts([SlideContent(slide_number=1, texts=["a"])])

        assert all(isinstance(s, SlideScript) for s in result)
        assert result[0].script == "hello"
