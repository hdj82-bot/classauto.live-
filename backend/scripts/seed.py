"""데모 시드 데이터 생성 스크립트.

사용법:
    docker compose exec backend python -m scripts.seed
    docker compose exec backend python -m scripts.seed --clean   # 기존 데이터 삭제 후 재생성

생성되는 데이터:
    - 교수자 1명 (demo-professor@ifl.dev)
    - 학생 3명 (demo-student-1~3@ifl.dev)
    - 강좌 2개 (각 강의 3개)
    - 강의별 평가 문제 5개
    - 학생별 학습 세션 + 응답 데이터
"""
import argparse
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SyncSessionLocal
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.question import AssessmentType, Difficulty, Question, QuestionType
from app.models.response import Response
from app.models.session import LearningSession, SessionStatus
from app.models.user import User, UserRole

# ── 고정 UUID (멱등성 보장) ──────────────────────────────────────────────────

PROFESSOR_ID = uuid.UUID("00000000-0000-4000-a000-000000000001")
STUDENT_IDS = [
    uuid.UUID("00000000-0000-4000-a000-000000000010"),
    uuid.UUID("00000000-0000-4000-a000-000000000011"),
    uuid.UUID("00000000-0000-4000-a000-000000000012"),
]
COURSE_IDS = [
    uuid.UUID("00000000-0000-4000-b000-000000000001"),
    uuid.UUID("00000000-0000-4000-b000-000000000002"),
]

NOW = datetime.now(timezone.utc)
SEED_PASSWORD = hash_password("demo1234!")


def _clean(db):
    """시드 데이터 삭제 (역순 삭제로 FK 충돌 방지)."""
    all_ids = [PROFESSOR_ID] + STUDENT_IDS
    id_strs = [str(uid) for uid in all_ids]
    course_strs = [str(cid) for cid in COURSE_IDS]

    # 응답 → 세션 → 문제 → 강의 → 강좌 → 사용자
    db.execute(text(
        "DELETE FROM responses WHERE session_id IN "
        "(SELECT id FROM learning_sessions WHERE user_id IN :uids)"
    ), {"uids": tuple(id_strs)})
    db.execute(text("DELETE FROM learning_sessions WHERE user_id IN :uids"), {"uids": tuple(id_strs)})
    db.execute(text(
        "DELETE FROM questions WHERE lecture_id IN "
        "(SELECT id FROM lectures WHERE course_id IN :cids)"
    ), {"cids": tuple(course_strs)})
    db.execute(text("DELETE FROM lectures WHERE course_id IN :cids"), {"cids": tuple(course_strs)})
    db.execute(text("DELETE FROM courses WHERE id IN :cids"), {"cids": tuple(course_strs)})
    db.execute(text("DELETE FROM users WHERE id IN :uids"), {"uids": tuple(id_strs)})
    db.commit()
    print("[clean] 기존 시드 데이터 삭제 완료")


def _create_users(db):
    """교수자 1명 + 학생 3명 생성."""
    professor = User(
        id=PROFESSOR_ID,
        email="demo-professor@ifl.dev",
        name="김교수",
        hashed_password=SEED_PASSWORD,
        google_sub="seed_google_prof_001",
        role=UserRole.professor,
        school="IFL 대학교",
        department="컴퓨터공학과",
        is_active=True,
    )
    db.merge(professor)

    student_names = ["이학생", "박학생", "최학생"]
    for i, (sid, name) in enumerate(zip(STUDENT_IDS, student_names)):
        student = User(
            id=sid,
            email=f"demo-student-{i+1}@ifl.dev",
            name=name,
            hashed_password=SEED_PASSWORD,
            google_sub=f"seed_google_stu_{i+1:03d}",
            role=UserRole.student,
            student_number=f"2024{i+1:04d}",
            is_active=True,
        )
        db.merge(student)

    db.commit()
    print(f"[users] 교수자 1명 + 학생 {len(STUDENT_IDS)}명 생성")


def _create_courses_and_lectures(db):
    """강좌 2개, 각 강의 3개 생성."""
    courses_data = [
        {
            "id": COURSE_IDS[0],
            "title": "인공지능 개론",
            "description": "AI 기초 이론부터 딥러닝까지 다루는 입문 강좌입니다.",
            "lectures": [
                ("AI의 역사와 개요", "ai-history-overview", "인공지능의 탄생부터 현재까지의 발전 과정을 살펴봅니다."),
                ("머신러닝 기초", "ml-fundamentals", "지도학습, 비지도학습, 강화학습의 기본 개념을 학습합니다."),
                ("딥러닝 입문", "deep-learning-intro", "신경망의 구조와 역전파 알고리즘을 이해합니다."),
            ],
        },
        {
            "id": COURSE_IDS[1],
            "title": "웹 프로그래밍 실습",
            "description": "HTML/CSS/JavaScript부터 React, Next.js까지 실습 중심으로 진행합니다.",
            "lectures": [
                ("HTML과 CSS 기초", "html-css-basics", "웹 페이지의 구조와 스타일링을 학습합니다."),
                ("JavaScript 핵심", "javascript-essentials", "ES6+ 문법과 비동기 프로그래밍을 다룹니다."),
                ("React 실전", "react-in-practice", "컴포넌트, 상태 관리, 훅을 활용한 SPA 개발을 실습합니다."),
            ],
        },
    ]

    lecture_ids = []
    for course_data in courses_data:
        course = Course(
            id=course_data["id"],
            title=course_data["title"],
            description=course_data["description"],
            instructor_id=PROFESSOR_ID,
            is_published=True,
        )
        db.merge(course)

        for order, (title, slug, desc) in enumerate(course_data["lectures"]):
            lid = uuid.uuid5(course_data["id"], slug)
            lecture = Lecture(
                id=lid,
                course_id=course_data["id"],
                title=title,
                slug=slug,
                description=desc,
                order=order,
                is_published=True,
                expires_at=NOW + timedelta(days=90),
            )
            db.merge(lecture)
            lecture_ids.append(lid)

    db.commit()
    print(f"[courses] 강좌 {len(courses_data)}개 + 강의 {len(lecture_ids)}개 생성")
    return lecture_ids


def _create_questions(db, lecture_ids: list[uuid.UUID]):
    """강의별 형성평가 3개 + 총괄평가 2개 생성."""
    question_bank = [
        # 형성평가 (강의 중간 출제)
        {
            "type": QuestionType.multiple_choice,
            "assessment": AssessmentType.formative,
            "content": "다음 중 지도학습(Supervised Learning)에 해당하는 것은?",
            "options": ["분류(Classification)", "클러스터링(Clustering)", "차원 축소", "이상 탐지"],
            "correct_answer": "0",
            "explanation": "분류는 레이블이 있는 데이터로 학습하는 대표적인 지도학습 방법입니다.",
            "timestamp": 120,
        },
        {
            "type": QuestionType.multiple_choice,
            "assessment": AssessmentType.formative,
            "content": "역전파(Backpropagation) 알고리즘의 핵심 수학 원리는?",
            "options": ["미분의 연쇄법칙", "베이즈 정리", "라그랑주 승수법", "몬테카를로 방법"],
            "correct_answer": "0",
            "explanation": "역전파는 연쇄법칙을 사용하여 각 가중치에 대한 손실 함수의 기울기를 계산합니다.",
            "timestamp": 300,
        },
        {
            "type": QuestionType.short_answer,
            "assessment": AssessmentType.formative,
            "content": "과적합(Overfitting)을 방지하기 위한 기법을 한 가지 서술하세요.",
            "options": None,
            "correct_answer": "드롭아웃, 정규화, 조기 종료, 데이터 증강 등",
            "explanation": "드롭아웃은 학습 시 랜덤하게 뉴런을 비활성화하여 모델의 일반화 성능을 높입니다.",
            "timestamp": 480,
        },
        # 총괄평가 (영상 종료 후)
        {
            "type": QuestionType.multiple_choice,
            "assessment": AssessmentType.summative,
            "content": "CNN(합성곱 신경망)에서 풀링(Pooling) 레이어의 주된 역할은?",
            "options": ["특성 맵의 공간적 크기 축소", "활성화 함수 적용", "가중치 초기화", "배치 정규화"],
            "correct_answer": "0",
            "explanation": "풀링 레이어는 특성 맵의 공간적 차원을 줄여 계산량을 감소시키고 과적합을 방지합니다.",
            "timestamp": None,
        },
        {
            "type": QuestionType.short_answer,
            "assessment": AssessmentType.summative,
            "content": "트랜스포머(Transformer) 모델의 핵심 메커니즘인 '어텐션'이 RNN 대비 가지는 장점을 서술하세요.",
            "options": None,
            "correct_answer": "병렬 처리 가능, 장거리 의존성 학습 용이",
            "explanation": "어텐션 메커니즘은 시퀀스의 모든 위치를 동시에 참조할 수 있어 병렬화가 가능하고 장거리 의존성 문제를 해결합니다.",
            "timestamp": None,
        },
    ]

    total = 0
    for lid in lecture_ids:
        for i, q in enumerate(question_bank):
            qid = uuid.uuid5(lid, f"q{i}")
            question = Question(
                id=qid,
                lecture_id=lid,
                assessment_type=q["assessment"],
                question_type=q["type"],
                difficulty=Difficulty.medium,
                content=q["content"],
                options=q["options"],
                correct_answer=q["correct_answer"],
                explanation=q["explanation"],
                timestamp_seconds=q["timestamp"],
                is_active=True,
            )
            db.merge(question)
            total += 1

    db.commit()
    print(f"[questions] 강의당 5개 × {len(lecture_ids)}개 강의 = {total}개 문제 생성")


def _create_sessions_and_responses(db, lecture_ids: list[uuid.UUID]):
    """학생별 학습 세션 + 평가 응답 생성."""
    session_count = 0
    response_count = 0

    for student_id in STUDENT_IDS:
        for lid in lecture_ids[:4]:  # 앞 4개 강의만 수강
            sess_id = uuid.uuid5(student_id, str(lid))
            progress = 85.0 if lid in lecture_ids[:2] else 45.0
            status = SessionStatus.completed if progress > 80 else SessionStatus.in_progress

            session = LearningSession(
                id=sess_id,
                user_id=student_id,
                lecture_id=lid,
                status=status,
                watched_sec=int(600 * progress / 100),
                total_sec=600,
                progress_pct=progress,
                started_at=NOW - timedelta(days=7),
                completed_at=(NOW - timedelta(days=5)) if status == SessionStatus.completed else None,
            )
            db.merge(session)
            session_count += 1

            # 형성평가 응답 (앞 3문제)
            from sqlalchemy import select
            questions = db.execute(
                select(Question).where(
                    Question.lecture_id == lid,
                    Question.assessment_type == AssessmentType.formative,
                )
            ).scalars().all()

            for q in questions[:3]:
                resp_id = uuid.uuid5(sess_id, str(q.id))
                is_correct = resp_id.int % 3 != 0  # 약 67% 정답
                answer = q.correct_answer if is_correct else "1"
                resp = Response(
                    id=resp_id,
                    question_id=q.id,
                    session_id=sess_id,
                    user_answer=answer,
                    is_correct=is_correct,
                    video_timestamp_seconds=q.timestamp_seconds or 0,
                    timestamp_valid=True,
                )
                db.merge(resp)
                response_count += 1

    db.commit()
    print(f"[sessions] 학습 세션 {session_count}개 + 응답 {response_count}개 생성")


def main():
    parser = argparse.ArgumentParser(description="IFL 데모 시드 데이터 생성")
    parser.add_argument("--clean", action="store_true", help="기존 시드 데이터 삭제 후 재생성")
    args = parser.parse_args()

    print(f"=== IFL 시드 데이터 생성 (env={settings.ENVIRONMENT}) ===\n")

    db = SyncSessionLocal()
    try:
        if args.clean:
            _clean(db)

        _create_users(db)
        lecture_ids = _create_courses_and_lectures(db)
        _create_questions(db, lecture_ids)
        _create_sessions_and_responses(db, lecture_ids)

        print(f"\n=== 완료 ===")
        print(f"교수자 로그인: demo-professor@ifl.dev / demo1234!")
        print(f"학생 로그인:   demo-student-1@ifl.dev / demo1234!")
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] 시드 데이터 생성 실패: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
