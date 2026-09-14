"""Shared normalization for directory lookup and writes."""
from __future__ import annotations

import unicodedata


def normalize_directory_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().casefold().replace("ё", "е")
    return " ".join(normalized.split())
