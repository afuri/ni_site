"""Shared image preparation for the task form and archive importer."""
from __future__ import annotations

import hashlib
import io
from pathlib import PurePosixPath
from typing import Any, Callable, TypeVar

from anyio import CapacityLimiter, to_thread
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core import storage
from app.core.config import settings

T = TypeVar("T")
_work_limiter: CapacityLimiter | None = None


class TaskImageError(ValueError):
    pass


async def image_work(function: Callable[..., T], *args: Any) -> T:
    global _work_limiter
    if _work_limiter is None:
        _work_limiter = CapacityLimiter(2)
    return await to_thread.run_sync(function, *args, limiter=_work_limiter)


def validate_image_width(width: Any) -> int | str:
    if width == "original":
        return width
    if type(width) is not int or not 1 <= width <= settings.TASK_UPLOAD_MAX_IMAGE_WIDTH:
        raise TaskImageError("Недопустимая ширина изображения.")
    return width


def prepare_image(raw: bytes, path: str, width: int | str) -> tuple[bytes, str]:
    width = validate_image_width(width)
    try:
        with Image.open(io.BytesIO(raw)) as image:
            fmt = image.format
            if fmt not in ("JPEG", "PNG", "WEBP") or image.width * image.height > settings.TASK_UPLOAD_MAX_IMAGE_PIXELS:
                raise TaskImageError("Недопустимый формат или размер изображения.")
            if getattr(image, "n_frames", 1) != 1:
                raise TaskImageError("Анимированные изображения не поддерживаются.")
            if PurePosixPath(path).suffix.lower() not in {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}}[fmt]:
                raise TaskImageError("Расширение картинки не соответствует её содержимому.")
            image.verify()
        content_type = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[fmt]
        with Image.open(io.BytesIO(raw)) as source:
            orientation = source.getexif().get(274, 1)
            image = ImageOps.exif_transpose(source)
            if width == "original" or image.width <= width:
                if orientation == 1:
                    image.load()
                    return raw, content_type
            else:
                image = image.resize((width, max(1, round(image.height * width / image.width))), Image.Resampling.LANCZOS)
            if fmt == "JPEG":
                image = image.convert("RGB")
            output = io.BytesIO()
            image.save(output, format=fmt, **({"quality": 90} if fmt in ("JPEG", "WEBP") else {}))
            return output.getvalue(), content_type
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        if isinstance(exc, TaskImageError):
            raise
        raise TaskImageError("Изображение повреждено или не поддерживается.") from exc


def upload_task_image(raw: bytes, filename: str, width: int | str) -> dict[str, str]:
    binary, mime = prepare_image(raw, filename, width)
    # Retrying a lost response writes the same bytes to the same immutable key.
    digest = hashlib.sha256(binary).hexdigest()
    key = f"tasks/images/{digest}.{storage.CONTENT_TYPE_EXT[mime]}"
    storage.put_object(key, binary, mime)
    url = storage.public_url_for_key(key) or storage.presign_get(key)
    return {"key": key, "url": url, "content_type": mime}
