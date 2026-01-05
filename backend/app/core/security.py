"""Security utilities."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import jwt
from passlib.context import CryptContext
from app.core.config import settings
from app.core import error_codes as codes

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def _jwt_secrets() -> list[str]:
    secrets_list = [s.strip() for s in settings.JWT_SECRETS.split(",") if s.strip()]
    if settings.JWT_SECRET and settings.JWT_SECRET not in secrets_list:
        secrets_list.append(settings.JWT_SECRET)
    return secrets_list or [settings.JWT_SECRET]


def _jwt_signing_secret() -> str:
    return _jwt_secrets()[0]

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_ACCESS_TTL_MIN)
    return jwt.encode(
        {"sub": sub, "type": "access", "iat": int(now.timestamp()), "exp": exp},
        _jwt_signing_secret(),
        algorithm=settings.JWT_ALG,
    )

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
        _jwt_signing_secret(),
        algorithm=settings.JWT_ALG,
    )

def decode_token(token: str) -> dict:
    last_error: Exception | None = None
    for secret in _jwt_secrets():
        try:
            return jwt.decode(token, secret, algorithms=[settings.JWT_ALG])
        except jwt.InvalidSignatureError as exc:
            last_error = exc
            continue
        except jwt.InvalidTokenError as exc:
            last_error = exc
            break
    if last_error:
        raise last_error
    raise jwt.InvalidTokenError("Invalid token")


def encode_token(payload: dict) -> str:
    return jwt.encode(payload, _jwt_signing_secret(), algorithm=settings.JWT_ALG)

def generate_token() -> str:
    return secrets.token_urlsafe(32)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def verify_token_hash(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)


def validate_password_policy(password: str) -> None:
    if len(password) < settings.PASSWORD_MIN_LEN:
        raise ValueError(codes.WEAK_PASSWORD)
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if settings.PASSWORD_REQUIRE_UPPER and not has_upper:
        raise ValueError(codes.WEAK_PASSWORD)
    if settings.PASSWORD_REQUIRE_LOWER and not has_lower:
        raise ValueError(codes.WEAK_PASSWORD)
    if settings.PASSWORD_REQUIRE_DIGIT and not has_digit:
        raise ValueError(codes.WEAK_PASSWORD)
