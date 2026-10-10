from datetime import datetime

from pydantic import BaseModel


class ServerTimeRead(BaseModel):
    server_now: datetime
