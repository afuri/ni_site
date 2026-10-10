"""Attach an authoritative clock sample without database or Redis work."""
import time

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class ServerTimeMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/v1/"):
            await self.app(scope, receive, send)
            return

        async def send_with_time(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Server-Time"] = str(time.time_ns() // 1_000_000)
                exposed = [value.strip() for value in headers.get("Access-Control-Expose-Headers", "").split(",") if value.strip()]
                if not any(value.lower() == "x-server-time" for value in exposed):
                    exposed.append("X-Server-Time")
                headers["Access-Control-Expose-Headers"] = ", ".join(exposed)
            await send(message)

        await self.app(scope, receive, send_with_time)
