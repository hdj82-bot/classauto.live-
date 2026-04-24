import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


# ── 비밀번호 ──────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


# ── JWT ───────────────────────────────────────────────────────────────────────

def _build_payload(user_id: str, role: str, token_type: str, expire: datetime) -> dict:
    return {
        "sub": user_id,
        "role": role,
        "type": token_type,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = _build_payload(user_id, role, "access", expire)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str, role: str) -> tuple[str, str]:
    """(encoded_token, jti) 반환. jti는 Redis 저장 키로 사용."""
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = _build_payload(user_id, role, "refresh", expire)
    payload["jti"] = jti
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti


def decode_token(token: str) -> dict:
    """유효하지 않거나 만료된 경우 JWTError를 raise."""
    return jwt.decode(
        token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
    )


def create_temp_token(google_sub: str, email: str, name: str, role: str) -> str:
    """신규 유저 프로필 완성 전까지 사용하는 단기 임시 토큰 (10분)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": google_sub,
        "email": email,
        "name": name,
        "role": role,
        "type": "temp",
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
