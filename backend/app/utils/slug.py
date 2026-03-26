import re
import uuid


def slugify(title: str) -> str:
    """한국어·영문 제목을 URL-safe slug로 변환 후 UUID 8자리 접미사를 붙여 유일성 보장.

    예) "파이썬 입문 강의" → "파이썬-입문-강의-a1b2c3d4"
        "Intro to FastAPI" → "intro-to-fastapi-a1b2c3d4"
    """
    slug = title.strip().lower()
    # 허용 문자 외 제거 (한글, 영문, 숫자, 공백, 하이픈 유지)
    slug = re.sub(r"[^\w\s\-가-힣]", "", slug, flags=re.UNICODE)
    # 공백·언더스코어·하이픈을 하이픈 하나로 통합
    slug = re.sub(r"[\s_\-]+", "-", slug)
    slug = slug.strip("-")
    suffix = uuid.uuid4().hex[:8]
    return f"{slug}-{suffix}"
