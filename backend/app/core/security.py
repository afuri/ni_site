"""Security utilities."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_ACCESS_TTL_MIN)
    return jwt.encode({"sub": sub, "type": "access", "iat": int(now.timestamp()), "exp": exp}, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

def create_refresh_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
    return jwt.encode(
        {
            "sub": sub,
            "type": "refresh",
            "iat": int(now.timestamp()),
            "exp": exp,
            "jti": secrets.token_urlsafe(16),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALG,
    )

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])

def generate_token() -> str:
    return secrets.token_urlsafe(32)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def verify_token_hash(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)


def validate_password_policy(password: str) -> None:
    if len(password) < settings.PASSWORD_MIN_LEN:
        raise ValueError("weak_password")
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_upper and has_lower and has_digit):
        raise ValueError("weak_password")
