from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from app.core.security import hash_token, verify_token_hash


def test_token_hash_and_verify():
    token = "test-token-123"
    token_hash = hash_token(token)
    assert verify_token_hash(token, token_hash) is True
    assert verify_token_hash("other", token_hash) is False
