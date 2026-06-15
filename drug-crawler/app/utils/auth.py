from __future__ import annotations

import itertools
import threading
from typing import Iterator

from app.config import get_settings

settings = get_settings()


class CookieRotator:
    """Thread-safe cookie rotator. Cycles through a pool of cookie strings."""

    def __init__(self, cookies: list[str]) -> None:
        if not cookies:
            raise ValueError("At least one cookie string is required")
        self._pool: list[str] = cookies
        self._cycle: Iterator[str] = itertools.cycle(cookies)
        self._lock = threading.Lock()
        self._index: int = 0

    def next(self) -> str:
        with self._lock:
            cookie = next(self._cycle)
            self._index = (self._index + 1) % len(self._pool)
            return cookie

    def current_index(self) -> int:
        with self._lock:
            return self._index

    def size(self) -> int:
        return len(self._pool)

    @classmethod
    def from_settings(cls) -> "CookieRotator":
        cookies = settings.parsed_cookies()
        if not cookies:
            raise ValueError(
                "No cookies configured. Set EKA_COOKIES in environment variables."
            )
        return cls(cookies)


def parse_cookie_string(cookie_str: str) -> dict[str, str]:
    """Parse a raw cookie string into a dict for httpx."""
    cookies: dict[str, str] = {}
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            k, _, v = part.partition("=")
            cookies[k.strip()] = v.strip()
    return cookies


def build_request_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    """Build the base request headers, merging env-configured extras."""
    base = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": "https://eka.care/",
        "Origin": "https://eka.care",
    }
    env_headers = settings.parsed_headers()
    base.update(env_headers)
    if extra:
        base.update(extra)
    return base
