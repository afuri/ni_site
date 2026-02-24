from __future__ import annotations

import base64
import html
import re
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, StyleSheet1, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.core.storage import presign_get


def _register_fonts() -> tuple[str, str, str]:
    candidates = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
    )
    if all(Path(p).exists() for p in candidates):
        registered = set(pdfmetrics.getRegisteredFontNames())
        if "NISans" not in registered:
            pdfmetrics.registerFont(TTFont("NISans", candidates[0]))
        if "NISansBold" not in registered:
            pdfmetrics.registerFont(TTFont("NISansBold", candidates[1]))
        if "NISansItalic" not in registered:
            pdfmetrics.registerFont(TTFont("NISansItalic", candidates[2]))
        return "NISans", "NISansBold", "NISansItalic"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


def _make_styles(font_name: str, bold_font_name: str, italic_font_name: str) -> StyleSheet1:
    styles = getSampleStyleSheet()
    styles["Normal"].fontName = font_name
    styles["Normal"].fontSize = 10
    styles["Normal"].leading = 14
    styles["Heading1"].fontName = bold_font_name
    styles["Heading1"].fontSize = 16
    styles["Heading2"].fontName = bold_font_name
    styles["Heading2"].fontSize = 12
    styles["Heading3"].fontName = bold_font_name
    styles["Heading3"].fontSize = 11
    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["Normal"],
            fontName=font_name,
            textColor=colors.HexColor("#555555"),
            leading=13,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TaskTitle",
            parent=styles["Heading2"],
            fontName=bold_font_name,
            fontSize=12,
            leading=16,
            spaceBefore=8,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeLine",
            parent=styles["Normal"],
            fontName=italic_font_name if italic_font_name else font_name,
            fontSize=9,
            leading=12,
            leftIndent=10,
            backColor=colors.HexColor("#f5f5f5"),
        )
    )
    return styles


def _format_inline(text: str) -> str:
    out = html.escape(text)
    out = re.sub(r"`([^`]+)`", r"<font face='Courier'>\1</font>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", out)
    out = re.sub(r"~~([^~]+)~~", r"<i>\1</i>", out)
    return out


def _append_markdown(story: list[Any], text: str, styles: StyleSheet1) -> None:
    if not text.strip():
        return
    in_code = False
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            story.append(Paragraph(html.escape(line) or " ", styles["CodeLine"]))
            continue
        if not stripped:
            story.append(Spacer(1, 4))
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(_format_inline(stripped[4:]), styles["Heading3"]))
            continue
        if stripped.startswith("## "):
            story.append(Paragraph(_format_inline(stripped[3:]), styles["Heading2"]))
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(_format_inline(stripped[2:]), styles["Heading2"]))
            continue
        if re.match(r"^\d+\.\s+", stripped):
            item = re.sub(r"^\d+\.\s+", "", stripped)
            story.append(Paragraph(f"• {_format_inline(item)}", styles["Normal"]))
            continue
        if stripped.startswith("- ") or stripped.startswith("* "):
            story.append(Paragraph(f"• {_format_inline(stripped[2:])}", styles["Normal"]))
            continue
        if stripped.startswith("> "):
            story.append(Paragraph(f"<i>{_format_inline(stripped[2:])}</i>", styles["Normal"]))
            continue
        story.append(Paragraph(_format_inline(stripped), styles["Normal"]))


def _fetch_image_bytes(image_key: str) -> bytes | None:
    source = image_key
    if image_key.startswith("data:image/"):
        _, encoded = image_key.split(",", 1)
        return base64.b64decode(encoded)
    if not image_key.startswith("http://") and not image_key.startswith("https://"):
        source = presign_get(image_key)
    with urlopen(source, timeout=8) as response:
        return response.read()


def _build_image(image_key: str | None, width_limit: float) -> RLImage | None:
    if not image_key:
        return None
    try:
        raw = _fetch_image_bytes(image_key)
        if not raw:
            return None
        reader = ImageReader(BytesIO(raw))
        img_w, img_h = reader.getSize()
        if img_w <= 0 or img_h <= 0:
            return None
        scale = min(width_limit / float(img_w), 240.0 / float(img_h), 1.0)
        return RLImage(BytesIO(raw), width=img_w * scale, height=img_h * scale)
    except Exception:
        return None


def _task_type_label(task_type: str) -> str:
    return {
        "single_choice": "Один вариант ответа",
        "multi_choice": "Несколько вариантов ответа",
        "short_text": "Краткий ответ",
    }.get(task_type, task_type)


def _answer_type_label(task_type: str, payload: dict[str, Any]) -> str:
    if task_type != "short_text":
        return "Выбор варианта"
    subtype = str(payload.get("subtype") or "text")
    return {
        "int": "Целое число",
        "float": "Число",
        "text": "Текст",
    }.get(subtype, subtype)


def _correct_answer_label(task_type: str, payload: dict[str, Any]) -> str:
    options = payload.get("options") if isinstance(payload.get("options"), list) else []
    by_id = {str(o.get("id")): str(o.get("text") or "") for o in options if isinstance(o, dict)}
    if task_type == "single_choice":
        cid = str(payload.get("correct_option_id") or "")
        text = by_id.get(cid)
        return f"{cid}. {text}" if text else cid
    if task_type == "multi_choice":
        cids = [str(v) for v in (payload.get("correct_option_ids") or [])]
        items = []
        for cid in cids:
            text = by_id.get(cid)
            items.append(f"{cid}. {text}" if text else cid)
        return ", ".join(items)
    expected = payload.get("expected")
    return "" if expected is None else str(expected)


def _age_group_label(age_group: str) -> str:
    if "," in age_group:
        items = [it.strip() for it in age_group.split(",") if it.strip()]
        return ", ".join(items)
    return age_group


def build_olympiad_pdf_bytes(
    *,
    olympiad: Any,
    task_rows: list[tuple[Any, Any]],
    include_description: bool,
    include_task_title: bool,
    include_task_and_answer_type: bool,
    include_correct_answer: bool,
) -> bytes:
    font_name, bold_font_name, italic_font_name = _register_fonts()
    styles = _make_styles(font_name, bold_font_name, italic_font_name)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Olympiad {olympiad.id}",
    )
    story: list[Any] = []
    content_width = A4[0] - doc.leftMargin - doc.rightMargin

    sorted_rows = sorted(task_rows, key=lambda pair: pair[0].sort_order)
    total_score = sum(int(ot.max_score or 0) for ot, _ in sorted_rows)

    story.append(Paragraph(html.escape(olympiad.title), styles["Heading1"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"Допущенные классы: {_age_group_label(olympiad.age_group)}", styles["Meta"]))
    story.append(
        Paragraph(
            f"Количество заданий: {len(sorted_rows)} - Максимальное количество баллов: {total_score}",
            styles["Meta"],
        )
    )
    if include_description and olympiad.description:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Описание олимпиады", styles["Heading3"]))
        _append_markdown(story, str(olympiad.description), styles)

    story.append(Spacer(1, 10))

    for index, (ot, task) in enumerate(sorted_rows, start=1):
        payload = task.payload if isinstance(task.payload, dict) else {}
        image_position = str(payload.get("image_position") or "after")
        image_flow = _build_image(task.image_key, content_width)

        title_bits = [f"№{index}"]
        if include_task_title:
            title_bits.append(str(task.title))
        story.append(Paragraph(" ".join(title_bits), styles["TaskTitle"]))
        story.append(Paragraph(f"Количество баллов: {int(ot.max_score or 0)}", styles["Meta"]))

        if image_flow is not None and image_position == "before":
            story.append(image_flow)
            story.append(Spacer(1, 4))

        _append_markdown(story, str(task.content or ""), styles)

        if image_flow is not None and image_position != "before":
            story.append(Spacer(1, 4))
            story.append(image_flow)

        if include_task_and_answer_type:
            story.append(Spacer(1, 4))
            story.append(Paragraph(f"Тип задания: {_task_type_label(str(task.task_type))}", styles["Meta"]))
            story.append(
                Paragraph(
                    f"Тип ответа: {_answer_type_label(str(task.task_type), payload)}",
                    styles["Meta"],
                )
            )

        if str(task.task_type) in ("single_choice", "multi_choice"):
            options = payload.get("options") if isinstance(payload.get("options"), list) else []
            if options:
                story.append(Spacer(1, 4))
                story.append(Paragraph("Варианты ответа:", styles["Meta"]))
                for option in options:
                    if not isinstance(option, dict):
                        continue
                    oid = str(option.get("id") or "")
                    text = str(option.get("text") or "")
                    story.append(Paragraph(f"- {html.escape(oid)}. {html.escape(text)}", styles["Normal"]))

        if include_correct_answer:
            correct = _correct_answer_label(str(task.task_type), payload)
            if correct:
                story.append(Spacer(1, 4))
                story.append(Paragraph(f"Правильный ответ: {html.escape(correct)}", styles["Meta"]))

        story.append(Spacer(1, 10))

    doc.build(story)
    return buffer.getvalue()
