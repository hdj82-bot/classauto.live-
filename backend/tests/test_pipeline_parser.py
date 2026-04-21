"""parser 서비스 단위 테스트."""
import base64
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.pipeline.parser import encode_image_base64, parse_pptx


class TestParsePptx:
    """parse_pptx() 테스트."""

    @patch("app.services.pipeline.parser.Presentation")
    def test_empty_presentation(self, mock_prs_cls, tmp_path):
        """슬라이드가 없는 경우 빈 리스트 반환."""
        mock_prs = MagicMock()
        mock_prs.slides = []
        mock_prs_cls.return_value = mock_prs

        result = parse_pptx(tmp_path / "empty.pptx", tmp_path / "output")

        assert result == []

    @patch("app.services.pipeline.parser.Presentation")
    def test_single_slide_with_text(self, mock_prs_cls, tmp_path):
        """텍스트가 있는 슬라이드 1개 파싱."""
        mock_para = MagicMock()
        mock_para.text = "Hello World"

        mock_text_frame = MagicMock()
        mock_text_frame.paragraphs = [mock_para]

        mock_shape = MagicMock()
        mock_shape.has_text_frame = True
        mock_shape.text_frame = mock_text_frame
        mock_shape.has_table = False
        mock_shape.shape_type = None  # 일반 도형

        mock_slide = MagicMock()
        mock_slide.shapes = [mock_shape]
        mock_slide.has_notes_slide = False

        mock_prs = MagicMock()
        mock_prs.slides = [mock_slide]
        mock_prs_cls.return_value = mock_prs

        result = parse_pptx(tmp_path / "test.pptx", tmp_path / "output")

        assert len(result) == 1
        assert result[0].slide_number == 1
        assert "Hello World" in result[0].texts[0]

    @patch("app.services.pipeline.parser.Presentation")
    def test_slide_with_speaker_notes(self, mock_prs_cls, tmp_path):
        """발표자 노트 추출."""
        mock_shape = MagicMock()
        mock_shape.has_text_frame = False
        mock_shape.has_table = False
        mock_shape.shape_type = None

        mock_notes_frame = MagicMock()
        mock_notes_frame.text = "이것은 발표자 노트입니다"

        mock_notes_slide = MagicMock()
        mock_notes_slide.notes_text_frame = mock_notes_frame

        mock_slide = MagicMock()
        mock_slide.shapes = [mock_shape]
        mock_slide.has_notes_slide = True
        mock_slide.notes_slide = mock_notes_slide

        mock_prs = MagicMock()
        mock_prs.slides = [mock_slide]
        mock_prs_cls.return_value = mock_prs

        result = parse_pptx(tmp_path / "test.pptx", tmp_path / "output")

        assert result[0].speaker_notes == "이것은 발표자 노트입니다"

    @patch("app.services.pipeline.parser.Presentation")
    def test_slide_with_table(self, mock_prs_cls, tmp_path):
        """테이블 셀 텍스트 추출."""
        mock_cell1 = MagicMock()
        mock_cell1.text = "셀1"
        mock_cell2 = MagicMock()
        mock_cell2.text = "셀2"

        mock_row = MagicMock()
        mock_row.cells = [mock_cell1, mock_cell2]

        mock_table = MagicMock()
        mock_table.rows = [mock_row]

        mock_shape = MagicMock()
        mock_shape.has_text_frame = False
        mock_shape.has_table = True
        mock_shape.table = mock_table
        mock_shape.shape_type = None

        mock_slide = MagicMock()
        mock_slide.shapes = [mock_shape]
        mock_slide.has_notes_slide = False

        mock_prs = MagicMock()
        mock_prs.slides = [mock_slide]
        mock_prs_cls.return_value = mock_prs

        result = parse_pptx(tmp_path / "test.pptx", tmp_path / "output")

        assert "셀1" in result[0].texts
        assert "셀2" in result[0].texts

    @patch("app.services.pipeline.parser.MSO_SHAPE_TYPE")
    @patch("app.services.pipeline.parser.Presentation")
    def test_slide_with_image(self, mock_prs_cls, mock_mso, tmp_path):
        """이미지 추출 및 저장."""
        mock_mso.PICTURE = "PICTURE"
        mock_mso.GROUP = "GROUP"

        mock_image = MagicMock()
        mock_image.content_type = "image/png"
        mock_image.blob = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

        mock_shape = MagicMock()
        mock_shape.has_text_frame = False
        mock_shape.has_table = False
        mock_shape.shape_type = "PICTURE"
        mock_shape.image = mock_image

        mock_slide = MagicMock()
        mock_slide.shapes = [mock_shape]
        mock_slide.has_notes_slide = False

        mock_prs = MagicMock()
        mock_prs.slides = [mock_slide]
        mock_prs_cls.return_value = mock_prs

        output_dir = tmp_path / "output"
        result = parse_pptx(tmp_path / "test.pptx", output_dir)

        assert len(result[0].image_paths) == 1
        img_path = Path(result[0].image_paths[0])
        assert img_path.exists()
        assert img_path.suffix == ".png"

    @patch("app.services.pipeline.parser.Presentation")
    def test_multiple_slides(self, mock_prs_cls, tmp_path):
        """여러 슬라이드 파싱."""
        slides = []
        for i in range(3):
            mock_para = MagicMock()
            mock_para.text = f"슬라이드 {i+1} 내용"
            mock_tf = MagicMock()
            mock_tf.paragraphs = [mock_para]
            mock_shape = MagicMock()
            mock_shape.has_text_frame = True
            mock_shape.text_frame = mock_tf
            mock_shape.has_table = False
            mock_shape.shape_type = None
            mock_slide = MagicMock()
            mock_slide.shapes = [mock_shape]
            mock_slide.has_notes_slide = False
            slides.append(mock_slide)

        mock_prs = MagicMock()
        mock_prs.slides = slides
        mock_prs_cls.return_value = mock_prs

        result = parse_pptx(tmp_path / "test.pptx", tmp_path / "output")

        assert len(result) == 3
        assert result[0].slide_number == 1
        assert result[2].slide_number == 3

    @patch("app.services.pipeline.parser.Presentation")
    def test_empty_text_paragraphs_filtered(self, mock_prs_cls, tmp_path):
        """빈 텍스트 단락은 무시."""
        mock_para_empty = MagicMock()
        mock_para_empty.text = "   "
        mock_para_valid = MagicMock()
        mock_para_valid.text = "유효한 텍스트"

        mock_tf = MagicMock()
        mock_tf.paragraphs = [mock_para_empty, mock_para_valid]

        mock_shape = MagicMock()
        mock_shape.has_text_frame = True
        mock_shape.text_frame = mock_tf
        mock_shape.has_table = False
        mock_shape.shape_type = None

        mock_slide = MagicMock()
        mock_slide.shapes = [mock_shape]
        mock_slide.has_notes_slide = False

        mock_prs = MagicMock()
        mock_prs.slides = [mock_slide]
        mock_prs_cls.return_value = mock_prs

        result = parse_pptx(tmp_path / "test.pptx", tmp_path / "output")

        assert len(result[0].texts) == 1
        assert "유효한 텍스트" in result[0].texts[0]


class TestEncodeImageBase64:
    """encode_image_base64() 테스트."""

    def test_encodes_file_correctly(self, tmp_path):
        test_file = tmp_path / "test.png"
        test_data = b"fake image data"
        test_file.write_bytes(test_data)

        result = encode_image_base64(str(test_file))

        expected = base64.standard_b64encode(test_data).decode("utf-8")
        assert result == expected

    def test_file_not_found_raises(self):
        with pytest.raises(FileNotFoundError):
            encode_image_base64("/nonexistent/path/image.png")
