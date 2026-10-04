"""Public, deterministic olympiad codes; not an authentication secret."""
import re

from app.core import error_codes as codes

OLYMPIAD_CODE_OFFSET = 1_000_000


def olympiad_id_from_code(code: str) -> int:
    if not re.fullmatch(r"[0-9]{1,16}", code):
        raise ValueError(codes.INVALID_OLYMPIAD_CODE)
    olympiad_id = int(code) - OLYMPIAD_CODE_OFFSET
    if not 0 < olympiad_id <= 2_147_483_647:
        raise ValueError(codes.INVALID_OLYMPIAD_CODE)
    return olympiad_id
