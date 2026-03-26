"""Celery 태스크 + API 통합 테스트."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.models.schemas import SlideContent, SlideScript
from app.models.video import Script, Slide, Video, VideoStatus


class TestStep1Parse:
    """step1_parse 태스크 테스트."""

    def test_parses_pptx_and_saves_slides_to_db(self, db, sample_pptx, tmp_dir):
        # Video 레코드 생성
        video = Video(
            task_id="test_parse_1",
            filename="test.pptx",
            file_path=str(sample_pptx),
            status=VideoStatus.UPLOADING,
        )
        db.add(video)
        db.commit()

        output_dir = tmp_dir / "output"
        output_dir.mkdir()

        # DB 세션을 주입하여 직접 호출
        from app.services.parser import parse_pptx

        parsed = parse_pptx(str(sample_pptx), str(output_dir))

        # Slide 저장
        video.total_slides = len(parsed)
        for sc in parsed:
            slide = Slide(
                video_id=video.id,
                slide_number=sc.slide_number,
                text_content="\n".join(sc.texts),
                speaker_notes=sc.speaker_notes,
                image_paths=json.dumps(sc.image_paths, ensure_ascii=False),
            )
            db.add(slide)
        db.commit()

        # 검증
        slides = db.query(Slide).filter(Slide.video_id == video.id).all()
        assert len(slides) == 3
        assert video.total_slides == 3
        for s in slides:
            assert s.speaker_notes != ""
            assert s.text_content != ""


class TestStep3GenerateScript:
    """스크립트 생성 및 DB 저장 테스트."""

    @patch("app.services.script_generator.anthropic.Anthropic")
    def test_generates_and_saves_scripts(self, mock_anthropic_cls, db, sample_pptx, tmp_dir):
        from tests.conftest import make_claude_response

        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("테스트 스크립트")

        # Setup: Video + Slides
        video = Video(
            task_id="test_script_1",
            filename="test.pptx",
            file_path=str(sample_pptx),
            status=VideoStatus.GENERATING_SCRIPT,
        )
        db.add(video)
        db.commit()

        for i in range(1, 4):
            db.add(Slide(
                video_id=video.id,
                slide_number=i,
                text_content=f"슬라이드 {i} 내용",
                speaker_notes=f"노트 {i}",
            ))
        db.commit()

        slides = db.query(Slide).filter(Slide.video_id == video.id).all()
        slide_contents = [
            SlideContent(slide_number=s.slide_number, texts=[s.text_content], speaker_notes=s.speaker_notes)
            for s in slides
        ]

        # 스크립트 생성
        from app.services.script_generator import generate_scripts

        scripts = generate_scripts(slide_contents)

        # DB 저장
        for slide, script in zip(slides, scripts):
            db.add(Script(slide_id=slide.id, content=script.script))
        db.commit()

        # 검증
        saved_scripts = db.query(Script).all()
        assert len(saved_scripts) == 3
        for s in saved_scripts:
            assert s.content == "테스트 스크립트"


class TestPipelineStatusTransitions:
    """파이프라인 상태 전이 테스트."""

    def test_video_status_transitions(self, db):
        video = Video(
            task_id="test_status",
            filename="test.pptx",
            file_path="/tmp/test.pptx",
            status=VideoStatus.UPLOADING,
        )
        db.add(video)
        db.commit()

        # 정상 흐름 상태 전이
        transitions = [
            VideoStatus.PARSING,
            VideoStatus.EMBEDDING,
            VideoStatus.GENERATING_SCRIPT,
            VideoStatus.PENDING_REVIEW,
            VideoStatus.APPROVED,
        ]
        for status in transitions:
            video.status = status
            db.commit()
            db.refresh(video)
            assert video.status == status

    def test_failure_status(self, db):
        video = Video(
            task_id="test_fail",
            filename="test.pptx",
            file_path="/tmp/test.pptx",
            status=VideoStatus.PARSING,
        )
        db.add(video)
        db.commit()

        video.status = VideoStatus.FAILED
        video.error_message = "파싱 오류 발생"
        db.commit()
        db.refresh(video)

        assert video.status == VideoStatus.FAILED
        assert video.error_message == "파싱 오류 발생"


class TestApiUpload:
    """API 업로드 엔드포인트 테스트."""

    @patch("app.api.routes.run_pipeline")
    def test_upload_rejects_non_pptx(self, mock_pipeline, client):
        response = client.post(
            "/api/v1/upload",
            files={"file": ("test.pdf", b"fake content", "application/pdf")},
        )
        assert response.status_code == 400
        assert "pptx" in response.json()["detail"]

    @patch("app.api.routes.run_pipeline")
    def test_upload_accepts_pptx(self, mock_pipeline, client, sample_pptx):
        with open(sample_pptx, "rb") as f:
            response = client.post(
                "/api/v1/upload",
                files={"file": ("test.pptx", f, "application/octet-stream")},
            )
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data["message"] == "파이프라인이 시작되었습니다."
        mock_pipeline.assert_called_once()

    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestApiVideoDetail:
    """비디오 상세 조회 API 테스트."""

    def test_returns_404_for_unknown_task(self, client):
        response = client.get("/api/v1/videos/nonexistent")
        assert response.status_code == 404

    @patch("app.api.routes.run_pipeline")
    def test_returns_video_with_slides(self, mock_pipeline, client, db, sample_pptx):
        # 업로드
        with open(sample_pptx, "rb") as f:
            resp = client.post(
                "/api/v1/upload",
                files={"file": ("test.pptx", f, "application/octet-stream")},
            )
        task_id = resp.json()["task_id"]

        # Slide 추가
        video = db.query(Video).filter(Video.task_id == task_id).first()
        db.add(Slide(video_id=video.id, slide_number=1, text_content="내용"))
        db.commit()

        # 조회
        resp = client.get(f"/api/v1/videos/{task_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["task_id"] == task_id
        assert len(data["slides"]) == 1


class TestApiScriptApproval:
    """스크립트 승인 API 테스트."""

    @patch("app.api.routes.run_pipeline")
    def test_approve_script_updates_status(self, mock_pipeline, client, db, sample_pptx):
        # 업로드
        with open(sample_pptx, "rb") as f:
            resp = client.post(
                "/api/v1/upload",
                files={"file": ("test.pptx", f, "application/octet-stream")},
            )
        task_id = resp.json()["task_id"]

        # Slide + Script 추가
        video = db.query(Video).filter(Video.task_id == task_id).first()
        slide = Slide(video_id=video.id, slide_number=1, text_content="내용")
        db.add(slide)
        db.flush()
        db.add(Script(slide_id=slide.id, content="스크립트 내용"))
        db.commit()

        # 승인
        resp = client.patch(f"/api/v1/videos/{task_id}/slides/1/approve")
        assert resp.status_code == 200
        assert resp.json()["all_approved"] is True
