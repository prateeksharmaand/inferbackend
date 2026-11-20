"""Fixed-window rate limiter backed by Redis, with an in-process fallback when Redis is down."""
import threading
import time

import redis

from app.core.config import settings
from app.core.errors import AppError

_local: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()
_client: redis.Redis | None = None


def _redis() -> redis.Redis | None:
    global _client
    if _client is None:
        try:
            _client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=0.5, socket_connect_timeout=0.5)
            _client.ping()
        except Exception:
            _client = None
    return _client


def hit(key: str, limit: int, window_s: int) -> None:
    bucket = f"rl:{key}:{int(time.time() // window_s)}"
    count = None
    r = _redis()
    if r is not None:
        try:
            pipe = r.pipeline()
            pipe.incr(bucket)
            pipe.expire(bucket, window_s)
            count = pipe.execute()[0]
        except Exception:
            count = None
    if count is None:
        with _lock:
            n, exp = _local.get(bucket, (0, time.time() + window_s))
            n += 1
            _local[bucket] = (n, exp)
            for k in [k for k, (_, e) in _local.items() if e < time.time()]:
                _local.pop(k, None)
            count = n
    if count > limit:
        raise AppError("Too many requests. Please slow down.", status_code=429, code="rate_limited")
