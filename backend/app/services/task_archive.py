"""Bounded ZIP/Markdown preprocessing. Never retain solution text."""
from __future__ import annotations

import hashlib
import io
import json
import math
import re
import stat
from dataclasses import dataclass
from pathlib import PurePosixPath
from string import Formatter
from zipfile import BadZipFile, ZipFile

import yaml
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.tasks import TaskCreate
from app.services.task_images import TaskImageError, prepare_image, validate_image_width


class ArchiveError(ValueError):
    pass


class StrictLoader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        event = self.peek_event()
        if isinstance(event, yaml.AliasEvent) or getattr(event, "anchor", None):
            raise ArchiveError("Якоря и ссылки YAML не поддерживаются.")
        self._depth = getattr(self, "_depth", 0) + 1
        self._nodes = getattr(self, "_nodes", 0) + 1
        if self._depth > 30 or self._nodes > 10000:
            raise ArchiveError("Слишком сложная структура YAML.")
        try:
            return super().compose_node(parent, index)
        finally:
            self._depth -= 1

    def construct_mapping(self, node, deep=False):
        result = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, (str, int)) or isinstance(key, bool):
                raise ArchiveError("Недопустимый ключ YAML.")
            if key in result:
                raise ArchiveError("Повторяющийся ключ YAML.")
            result[key] = self.construct_object(value_node, deep=deep)
        return result


def load_yaml(text: str) -> dict:
    try:
        value = yaml.load(text, Loader=StrictLoader)
        if not isinstance(value, dict):
            raise ArchiveError("Ожидается объект YAML.")
        json.dumps(value, allow_nan=False)
        return value
    except (yaml.YAMLError, TypeError, OverflowError, RecursionError, ValueError) as exc:
        if isinstance(exc, ArchiveError):
            raise
        raise ArchiveError("Некорректный YAML или неподдерживаемое значение.") from exc


def archive_path(name: str) -> str:
    if "\\" in name or "\x00" in name or name.startswith("/"):
        raise ArchiveError("Недопустимый путь в архиве.")
    parts = name.rstrip("/").split("/")
    if any(part in ("", ".", "..") for part in parts) or ":" in parts[0]:
        raise ArchiveError("Недопустимый путь в архиве.")
    return "/".join(parts)


def ignored_path(path: str) -> bool:
    return any(p == "__MACOSX" or p == ".DS_Store" or p.startswith("._") for p in path.split("/"))


def validate_header(header: dict) -> list[str]:
    fields = {"format_version", "subject", "subject_label", "grade", "pool_title",
              "pool_variant_count", "task_count", "split_tasks", "task_title_pattern"}
    if set(header) != fields:
        raise ArchiveError("Общее описание содержит лишние или отсутствующие поля.")
    for key, minimum, maximum in (("format_version", 1, 1), ("grade", 0, 11),
                                 ("pool_variant_count", 4, 4), ("task_count", 1, 200)):
        value = header[key]
        if type(value) is not int or not minimum <= value <= maximum:
            raise ArchiveError(f"Недопустимое значение {key}.")
    if header["subject"] not in ("math", "cs"):
        raise ArchiveError("Предмет должен быть math или cs.")
    for key in ("subject_label", "pool_title", "task_title_pattern"):
        if not isinstance(header[key], str) or not header[key].strip() or len(header[key]) > 255:
            raise ArchiveError(f"Заполните {key} (не более 255 символов).")
    splits = header["split_tasks"]
    if not isinstance(splits, dict) or any(
        type(k) is not int or not 1 <= k <= header["task_count"] or type(v) is not int or v not in (2, 4)
        for k, v in splits.items()
    ):
        raise ArchiveError("Некорректное распределение split_tasks.")
    try:
        for _, field, spec, conversion in Formatter().parse(header["task_title_pattern"]):
            if field is not None and (field not in {"subject_label", "grade", "number", "index"} or spec or conversion):
                raise ValueError
    except ValueError as exc:
        raise ArchiveError("Недопустимый паттерн названия.") from exc
    indices = []
    for number in range(1, header["task_count"] + 1):
        count = splits.get(number, 1)
        indices.extend([str(number)] if count == 1 else
                       [f"{number}ab", f"{number}cd"] if count == 2 else
                       [f"{number}{v}" for v in "abcd"])
    if len(indices) > settings.TASK_UPLOAD_MAX_TASKS:
        raise ArchiveError("Слишком много заданий в архиве.")
    return indices


def task_sections(text: str) -> list[tuple[str, str]]:
    sections: list[tuple[str, list[str]]] = []
    fence: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        match_fence = re.match(r"^(`{3,}|~{3,})", stripped)
        if match_fence:
            marker = match_fence[1]
            if fence is None:
                fence = marker
            elif stripped == fence:
                fence = None
        match = re.fullmatch(r"## Задание ([1-9]\d*(?:[a-d]|ab|cd)?)\s*", line) if fence is None else None
        if match:
            sections.append((match[1], []))
        elif fence is None and line.startswith("## Задание"):
            raise ArchiveError("Неподдерживаемый индекс задания.")
        elif sections:
            sections[-1][1].append(line)
        elif stripped not in ("", "# Задания"):
            raise ArchiveError("Перед заданиями допускается только заголовок # Задания.")
    return [(index, "\n".join(lines)) for index, lines in sections]


def read_task(text: str) -> tuple[dict, str]:
    match = re.match(r"\s*```yaml\s*\n(.*?)\n```\s*\n### Условие\s*\n", text, re.S)
    if not match:
        raise ArchiveError("Ожидаются YAML-параметры и раздел ### Условие.")
    content_lines = []
    fence: str | None = None
    for line in text[match.end():].splitlines():
        marker = re.match(r"^(`{3,}|~{3,})", line.strip())
        if marker:
            if fence is None:
                fence = marker[1]
            elif line.strip() == fence:
                fence = None
        if fence is None and re.fullmatch(r"### Решение\s*", line):
            break
        if fence is None and re.match(r"^###\s", line):
            raise ArchiveError("В задании допускается только раздел ### Условие.")
        content_lines.append(line)
    return load_yaml(match[1]), "\n".join(content_lines).strip()


def validate_payload(task_type: str, payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ArchiveError("payload должен быть объектом.")
    if task_type == "short_text":
        subtype = payload.get("subtype")
        allowed = {"subtype", "expected"}
        allowed |= {"epsilon"} if subtype == "float" else {"case_insensitive", "trim", "collapse_spaces"} if subtype == "text" else set()
        if set(payload) - allowed:
            raise ArchiveError("Лишние поля payload.")
        expected = payload.get("expected")
        if subtype == "int" and type(expected) is not int:
            raise ArchiveError("Правильный ответ должен быть целым числом.")
        if subtype == "float":
            eps = payload.get("epsilon", 0.01)
            if type(expected) not in (int, float) or not math.isfinite(expected):
                raise ArchiveError("Правильный ответ должен быть конечным числом.")
            if type(eps) not in (int, float) or not math.isfinite(eps) or eps <= 0:
                raise ArchiveError("Погрешность должна быть положительным числом.")
        if subtype == "text":
            if not isinstance(expected, str) or not expected.strip():
                raise ArchiveError("Заполните текстовый ответ.")
            if any(type(payload[k]) is not bool for k in ("case_insensitive", "trim", "collapse_spaces") if k in payload):
                raise ArchiveError("Настройки сравнения текста должны быть true или false.")
        if subtype not in ("int", "float", "text"):
            raise ArchiveError("Неподдерживаемый subtype.")
    elif task_type in ("single_choice", "multi_choice"):
        correct_key = "correct_option_id" if task_type == "single_choice" else "correct_option_ids"
        if set(payload) != {"options", correct_key}:
            raise ArchiveError("Неверные поля ответа с выбором.")
        options = payload["options"]
        if not isinstance(options, list) or not 2 <= len(options) <= 100:
            raise ArchiveError("Требуется от 2 до 100 вариантов ответа.")
        for option in options:
            if not isinstance(option, dict) or set(option) != {"id", "text"}:
                raise ArchiveError("Неверные поля варианта ответа.")
            if not isinstance(option["id"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,20}", option["id"]):
                raise ArchiveError("Некорректное обозначение варианта ответа.")
            if not isinstance(option["text"], str) or not 1 <= len(option["text"].strip()) <= 500:
                raise ArchiveError("Текст варианта ответа должен содержать 1–500 символов.")
        ids = [o["id"] for o in options]
        correct = payload[correct_key]
        selected = [correct] if task_type == "single_choice" else correct
        if (len(ids) != len(set(ids)) or not isinstance(selected, list) or not selected
                or any(not isinstance(v, str) or v not in ids for v in selected)
                or len(selected) != len(set(selected))):
            raise ArchiveError("Некорректные правильные варианты ответа.")
    else:
        raise ArchiveError("Неподдерживаемый task_type.")


@dataclass
class PreparedArchive:
    data: dict
    images: dict[str, tuple[bytes, str]]


def parse_archive(raw: bytes) -> PreparedArchive:
    if len(raw) > settings.TASK_UPLOAD_MAX_MB * 1024 * 1024:
        raise ArchiveError("Архив превышает допустимый размер.")
    try:
        with ZipFile(io.BytesIO(raw)) as archive:
            entries = {}
            seen = set()
            total = 0
            if len(archive.infolist()) > settings.TASK_UPLOAD_MAX_FILES:
                raise ArchiveError("Слишком много файлов в архиве.")
            for info in archive.infolist():
                path = archive_path(info.filename)
                if path in seen or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1:
                    raise ArchiveError("Дубли путей, ссылки и шифрование в ZIP не поддерживаются.")
                seen.add(path)
                total += info.file_size
                if total > settings.TASK_UPLOAD_UNPACKED_MAX_MB * 1024 * 1024:
                    raise ArchiveError("Распакованный архив превышает допустимый размер.")
                if not info.is_dir() and not ignored_path(path):
                    entries[path] = info
            md = [p for p in entries if "/" not in p and p.endswith(".md")]
            if len(md) != 1:
                raise ArchiveError("В корне ZIP должен быть ровно один MD-файл.")
            if any(p != md[0] and (not p.startswith("images/") or PurePosixPath(p).suffix.lower()
                                   not in (".jpg", ".jpeg", ".png", ".webp")) for p in entries):
                raise ArchiveError("В ZIP допускаются только MD-файл и папка images/.")
            if entries[md[0]].file_size > 1024 * 1024:
                raise ArchiveError("MD-файл превышает 1 МБ.")
            text = archive.read(entries[md[0]]).decode("utf-8-sig").replace("\r\n", "\n")
            front = re.match(r"\A---[ \t]*\n(.*?)\n---[ \t]*\n", text, re.S)
            if not front:
                raise ArchiveError("MD должен начинаться с общего описания YAML между ---.")
            header = load_yaml(front[1])
            expected = validate_header(header)
            sections = task_sections(text[front.end():])
            if len(sections) != len(expected) or {i for i, _ in sections} != set(expected):
                raise ArchiveError("Индексы заданий не соответствуют task_count и split_tasks либо повторяются.")
            section_map = dict(sections)
            items = []
            images: dict[str, tuple[bytes, str]] = {}
            image_cache: dict[tuple[str, int | str], str] = {}
            for index in expected:
                number = int(re.match(r"\d+", index)[0])
                title = header["task_title_pattern"].format(subject_label=header["subject_label"], grade=header["grade"], number=number, index=index)
                item = {"index": index, "status": "pending", "task_id": None, "reason": None,
                        "title": title, "content": "", "task_type": "short_text", "payload": {},
                        "image_key": None, "image_ref": None, "errors": []}
                try:
                    meta, content = read_task(section_map[index])
                    item["content"] = content
                    if set(meta) != {"title", "task_type", "image_file", "image_width_px", "image_position", "payload"}:
                        raise ArchiveError("Лишние или отсутствующие поля задания.")
                    if meta["title"] is not None:
                        title = meta["title"]
                    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 255:
                        raise ArchiveError("Название должно содержать 1–255 символов.")
                    item["title"] = title
                    if not content or "[ЗАПОЛНИТЕ" in content:
                        raise ArchiveError("Заполните условие задания.")
                    validate_payload(meta["task_type"], meta["payload"])
                    if meta["image_position"] not in ("before", "after"):
                        raise ArchiveError("image_position должен быть before или after.")
                    width = validate_image_width(meta["image_width_px"])
                    payload = {**meta["payload"], "image_position": meta["image_position"]}
                    task = TaskCreate(subject=header["subject"], title=title, content=content,
                                      task_type=meta["task_type"], payload=payload)
                    item.update(task.model_dump(mode="json", exclude={"subject"}))
                    path = meta["image_file"]
                    if path is not None:
                        if not isinstance(path, str) or archive_path(path) != path or not path.startswith("images/"):
                            raise ArchiveError("image_file должен указывать файл в images/.")
                        if path not in entries:
                            raise ArchiveError("Файл изображения не найден в ZIP.")
                        cache_key = (path, width)
                        if cache_key not in image_cache:
                            binary, mime = prepare_image(archive.read(entries[path]), path, width)
                            ref = hashlib.sha256(binary).hexdigest()
                            images[ref] = (binary, mime)
                            image_cache[cache_key] = ref
                        item["image_ref"] = image_cache[cache_key]
                except (ArchiveError, TaskImageError, ValidationError) as exc:
                    item["errors"] = [str(exc) if isinstance(exc, (ArchiveError, TaskImageError)) else "Параметры задания не прошли проверку."]
                items.append(item)
            return PreparedArchive({"pool_title": header["pool_title"], "subject": header["subject"],
                                    "grade": header["grade"], "items": items}, images)
    except (BadZipFile, UnicodeError, RuntimeError, NotImplementedError) as exc:
        raise ArchiveError("ZIP повреждён, не поддерживается или MD не записан в UTF-8.") from exc
