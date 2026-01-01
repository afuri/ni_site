from __future__ import annotations

from dataclasses import dataclass
from redis.asyncio import Redis


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_sec: int


TOKEN_BUCKET_LUA = r"""
-- KEYS[1] = tokens_key
-- KEYS[2] = ts_key
-- ARGV[1] = capacity
-- ARGV[2] = refill_rate_per_ms
-- ARGV[3] = now_ms
-- ARGV[4] = cost
-- ARGV[5] = ttl_ms

local tokens_key = KEYS[1]
local ts_key = KEYS[2]

local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])

local tokens = redis.call("GET", tokens_key)
local last_ts = redis.call("GET", ts_key)

if tokens == false then
  tokens = capacity
else
  tokens = tonumber(tokens)
end

if last_ts == false then
  last_ts = now_ms
else
  last_ts = tonumber(last_ts)
end

local delta = now_ms - last_ts
if delta < 0 then delta = 0 end

local refill = delta * refill_rate
tokens = math.min(capacity, tokens + refill)

local allowed = 0
local retry_after_ms = 0

if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  allowed = 0
  local missing = cost - tokens
  if refill_rate > 0 then
    retry_after_ms = math.ceil(missing / refill_rate)
  else
    retry_after_ms = ttl_ms
  end
end

redis.call("SET", tokens_key, tokens, "PX", ttl_ms)
redis.call("SET", ts_key, now_ms, "PX", ttl_ms)

local remaining = math.floor(tokens)
return {allowed, remaining, retry_after_ms}
"""


async def token_bucket_rate_limit(
    redis: Redis,
    *,
    key: str,
    capacity: int,
    window_sec: int,
    cost: int = 1,
) -> RateLimitResult:
    if capacity <= 0 or window_sec <= 0:
        return RateLimitResult(allowed=True, remaining=capacity, retry_after_sec=0)

    refill_rate_per_ms = float(capacity) / float(window_sec * 1000)
    ttl_ms = int(max(window_sec * 2 * 1000, 10_000))

    # время берём у Redis (чтобы не зависеть от локальных часов)
    sec, usec = await redis.time()
    now_ms = int(sec) * 1000 + int(usec) // 1000

    tokens_key = f"{key}:tokens"
    ts_key = f"{key}:ts"

    # ВАЖНО: redis.eval(script, numkeys, *keys_and_args)
    res = await redis.eval(
        TOKEN_BUCKET_LUA,
        2,
        tokens_key,
        ts_key,
        str(float(capacity)),
        str(refill_rate_per_ms),
        str(now_ms),
        str(float(cost)),
        str(ttl_ms),
    )

    allowed = int(res[0]) == 1
    remaining = int(res[1])
    retry_after_ms = int(res[2])

    retry_after_sec = 0 if allowed else int((retry_after_ms + 999) // 1000)
    return RateLimitResult(allowed=allowed, remaining=remaining, retry_after_sec=retry_after_sec)
