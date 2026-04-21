"""
Interactive Flipped Learning - 성능/부하 테스트 (Locust)

시나리오 1: 학생 플로우 (로그인 → 강의 목록 → 세션 시작 → 영상 시청 heartbeat → 평가 응답)
시나리오 2: 교수 대시보드 (대시보드 조회 → CSV 내보내기)
시나리오 3: Q&A 질문 (RAG 검색)
"""

from __future__ import annotations

import os
import random
import uuid

from locust import HttpUser, between, tag, task


# ---------------------------------------------------------------------------
# 환경 변수
# ---------------------------------------------------------------------------
BASE_URL = os.getenv("TARGET_HOST", "http://localhost:8000")

# 사전에 발급해 둔 테스트 토큰 (환경변수로 주입)
STUDENT_TOKEN = os.getenv("STUDENT_TOKEN", "test-student-token")
PROFESSOR_TOKEN = os.getenv("PROFESSOR_TOKEN", "test-professor-token")

# 테스트용 고정 ID (환경변수 또는 시드 데이터에서 가져옴)
TEST_LECTURE_ID = os.getenv("TEST_LECTURE_ID", str(uuid.uuid4()))
TEST_COURSE_ID = os.getenv("TEST_COURSE_ID", str(uuid.uuid4()))
TEST_VIDEO_ID = os.getenv("TEST_VIDEO_ID", str(uuid.uuid4()))

# heartbeat 반복 횟수 (영상 길이 시뮬레이션)
HEARTBEAT_COUNT = int(os.getenv("HEARTBEAT_COUNT", "5"))


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------
def student_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {STUDENT_TOKEN}"}


def professor_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {PROFESSOR_TOKEN}"}


# ===========================================================================
# 시나리오 1: 학생 플로우
# ===========================================================================
class StudentFlowUser(HttpUser):
    """학생 로그인 → 강의 목록 → 세션 시작 → heartbeat → 평가 응답"""

    wait_time = between(1, 3)
    weight = 6  # 전체 트래픽의 60 %

    def on_start(self):
        self.session_id: str | None = None
        self.question_ids: list[str] = []
        self.user_id = str(uuid.uuid4())

    # --- 1) 강좌 목록 조회 ---------------------------------------------------
    @tag("student", "browse")
    @task(3)
    def list_courses(self):
        with self.client.get(
            "/api/courses",
            headers=student_headers(),
            name="/api/courses [학생-목록]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")

    # --- 2) 강좌별 강의 목록 -------------------------------------------------
    @tag("student", "browse")
    @task(2)
    def list_lectures(self):
        with self.client.get(
            f"/api/courses/{TEST_COURSE_ID}/lectures",
            headers=student_headers(),
            name="/api/courses/{id}/lectures",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")

    # --- 3) 세션 시작 + heartbeat + 세션 완료 --------------------------------
    @tag("student", "session")
    @task(3)
    def full_session_flow(self):
        # 세션 시작
        total_sec = random.randint(300, 1800)
        with self.client.post(
            "/api/v1/sessions",
            params={"lecture_id": TEST_LECTURE_ID, "total_sec": total_sec},
            headers=student_headers(),
            name="/api/v1/sessions [시작]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self.session_id = data.get("id")
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")
                return

        if not self.session_id:
            return

        # 집중도 추적 시작
        self.client.post(
            "/api/v1/attention/start",
            params={
                "session_id": self.session_id,
                "user_id": self.user_id,
                "lecture_id": TEST_LECTURE_ID,
            },
            name="/api/v1/attention/start",
        )

        # 세션 → IN_PROGRESS
        self.client.patch(
            f"/api/v1/sessions/{self.session_id}",
            params={"status": "IN_PROGRESS"},
            headers=student_headers(),
            name="/api/v1/sessions/{id} [PATCH]",
        )

        # heartbeat 반복
        for i in range(HEARTBEAT_COUNT):
            progress = (i + 1) * (total_sec // HEARTBEAT_COUNT)
            self.client.post(
                "/api/v1/attention/heartbeat",
                params={
                    "session_id": self.session_id,
                    "progress_seconds": progress,
                },
                name="/api/v1/attention/heartbeat",
            )

        # 세션 완료
        self.client.post(
            f"/api/v1/sessions/{self.session_id}/complete",
            params={"watched_sec": total_sec},
            headers=student_headers(),
            name="/api/v1/sessions/{id}/complete",
        )

    # --- 4) 문제 조회 + 응답 제출 ---------------------------------------------
    @tag("student", "assessment")
    @task(2)
    def assessment_flow(self):
        # formative 문제 조회
        with self.client.get(
            f"/api/questions/{TEST_LECTURE_ID}",
            params={"assessment_type": "formative"},
            headers=student_headers(),
            name="/api/questions/{id} [formative]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self.session_id = data.get("session_id")
                questions = data.get("questions", [])
                self.question_ids = [q["id"] for q in questions]
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")
                return

        if not self.question_ids or not self.session_id:
            return

        # 응답 제출
        responses = [
            {
                "question_id": qid,
                "user_answer": random.choice(["A", "B", "C", "D", "잘 모르겠습니다"]),
                "video_timestamp_seconds": random.randint(0, 1800),
            }
            for qid in self.question_ids[:5]
        ]

        with self.client.post(
            "/api/responses",
            json={"session_id": self.session_id, "responses": responses},
            headers=student_headers(),
            name="/api/responses [제출]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")


# ===========================================================================
# 시나리오 2: 교수 대시보드
# ===========================================================================
class ProfessorDashboardUser(HttpUser):
    """교수 대시보드 조회 → CSV 내보내기"""

    wait_time = between(2, 5)
    weight = 2  # 전체 트래픽의 20 %

    @tag("professor", "dashboard")
    @task(3)
    def view_attendance(self):
        self.client.get(
            f"/api/v1/dashboard/{TEST_LECTURE_ID}/attendance",
            headers=professor_headers(),
            name="/api/v1/dashboard/{id}/attendance",
        )

    @tag("professor", "dashboard")
    @task(3)
    def view_scores(self):
        self.client.get(
            f"/api/v1/dashboard/{TEST_LECTURE_ID}/scores",
            headers=professor_headers(),
            name="/api/v1/dashboard/{id}/scores",
        )

    @tag("professor", "dashboard")
    @task(2)
    def view_engagement(self):
        self.client.get(
            f"/api/v1/dashboard/{TEST_LECTURE_ID}/engagement",
            headers=professor_headers(),
            name="/api/v1/dashboard/{id}/engagement",
        )

    @tag("professor", "dashboard")
    @task(1)
    def view_qa_logs(self):
        self.client.get(
            f"/api/v1/dashboard/{TEST_LECTURE_ID}/qa",
            params={"page": 1, "limit": 50},
            headers=professor_headers(),
            name="/api/v1/dashboard/{id}/qa",
        )

    @tag("professor", "dashboard")
    @task(1)
    def view_cost(self):
        self.client.get(
            f"/api/v1/dashboard/{TEST_LECTURE_ID}/cost",
            headers=professor_headers(),
            name="/api/v1/dashboard/{id}/cost",
        )

    @tag("professor", "export")
    @task(1)
    def export_csv(self):
        with self.client.get(
            f"/api/v1/dashboard/{TEST_LECTURE_ID}/export/csv",
            headers=professor_headers(),
            name="/api/v1/dashboard/{id}/export/csv",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")


# ===========================================================================
# 시나리오 3: Q&A 질문 (RAG 검색)
# ===========================================================================
class QAUser(HttpUser):
    """학생 Q&A 질문 → RAG 기반 답변 수신"""

    wait_time = between(3, 8)
    weight = 2  # 전체 트래픽의 20 %

    SAMPLE_QUESTIONS = [
        "이 강의에서 설명한 알고리즘의 시간 복잡도는 어떻게 되나요?",
        "슬라이드 3에서 언급한 개념을 좀 더 자세히 설명해 주세요.",
        "이 부분에서 사용된 데이터 구조의 장단점은 무엇인가요?",
        "실제 코드로 구현하려면 어떻게 해야 하나요?",
        "이전 강의에서 배운 내용과 어떤 관계가 있나요?",
        "이 개념의 실무 활용 사례가 궁금합니다.",
        "시험에 자주 나오는 유형인가요?",
        "핵심 키워드를 정리해 주세요.",
    ]

    def on_start(self):
        self.session_id = str(uuid.uuid4())
        self.task_id = str(uuid.uuid4())

    @tag("student", "qa")
    @task
    def ask_question(self):
        question = random.choice(self.SAMPLE_QUESTIONS)
        with self.client.post(
            "/api/v1/qa",
            json={
                "session_id": self.session_id,
                "task_id": self.task_id,
                "question": question,
            },
            headers=student_headers(),
            name="/api/v1/qa [질문]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")
