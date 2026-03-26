from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# 모든 모델을 여기서 임포트하여 Alembic이 감지할 수 있게 함
from app.models import user, course, lecture, session, question, response, video  # noqa: F401, E402
