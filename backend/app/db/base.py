from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# 모든 모델을 여기서 임포트하여 Alembic이 감지할 수 있게 함
from app.models import (  # noqa: F401, E402
    user, course, lecture, session, question, response, video,
    video_render, embedding, qa_log, cost_log, subscription,
    translation, assessment_result,
)
