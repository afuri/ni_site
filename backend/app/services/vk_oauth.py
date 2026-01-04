from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets
import urllib.parse

import httpx
import jwt
from fastapi import status

from app.core.config import settings
from app.core.errors import http_error


VK_AUTHORIZE_URL = "https://oauth.vk.com/authorize"
VK_TOKEN_URL = "https://oauth.vk.com/access_token"


def _require_vk_config():
    if not settings.VK_CLIENT_ID or not settings.VK_CLIENT_SECRET or not settings.VK_REDIRECT_URI:
        raise RuntimeError("VK OAuth config is missing (VK_CLIENT_ID/VK_CLIENT_SECRET/VK_REDIRECT_URI)")


def make_state_jwt() -> str:
    """Стейт без хранения: JWT с random nonce и коротким TTL."""
    now = datetime.now(timezone.utc)
    payload = {
        "typ": "vk_state",
        "nonce": secrets.token_urlsafe(24),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=10)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def validate_state_jwt(state: str) -> None:
    try:
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except Exception:
        raise http_error(status.HTTP_400_BAD_REQUEST, "invalid_state")
    if payload.get("typ") != "vk_state":
        raise http_error(status.HTTP_400_BAD_REQUEST, "invalid_state")


def build_authorize_url() -> str:
    _require_vk_config()
    state = make_state_jwt()
    params = {
        "client_id": settings.VK_CLIENT_ID,
        "redirect_uri": settings.VK_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.VK_SCOPE,  # часто offline,email :contentReference[oaicite:2]{index=2}
        "state": state,
        "display": "page",
    }
    return f"{VK_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code_for_token(code: str) -> dict:
    _require_vk_config()
    params = {
        "client_id": settings.VK_CLIENT_ID,
        "client_secret": settings.VK_CLIENT_SECRET,
        "redirect_uri": settings.VK_REDIRECT_URI,
        "code": code,
    }
    async with httpx.AsyncClient(timeout=settings.HTTP_CLIENT_TIMEOUT_SEC) as client:
        r = await client.get(VK_TOKEN_URL, params=params)
        data = r.json()

    # VK может вернуть error/error_description
    if "error" in data:
        raise http_error(status.HTTP_400_BAD_REQUEST, "vk_token_error", details={"vk_error": data.get("error")})
    return data
