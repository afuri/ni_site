"""Bound answer request bodies before JSON parsing; uploads are unaffected."""
import re

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import api_error
from app.core.request_id import get_request_id


class AttemptBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (scope["type"] != "http" or scope["method"] != "POST"
                or not re.fullmatch(r"/api/v1/attempts/\d+/(answers|submit)/?", scope["path"])):
            await self.app(scope, receive, send)
            return

        async def reject() -> None:
            response = JSONResponse(status_code=413, content={
                "error": api_error("attempt_payload_too_large", details={"max_bytes": self.max_bytes}),
                "request_id": get_request_id(),
            })
            await response(scope, receive, send)

        headers = dict(scope.get("headers", []))
        try:
            if int(headers.get(b"content-length", b"0")) > self.max_bytes:
                await reject()
                return
        except ValueError:
            pass  # The HTTP server validates malformed framing.

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                await reject()
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)
