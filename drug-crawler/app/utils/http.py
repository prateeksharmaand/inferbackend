from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import structlog
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings
from app.utils.auth import CookieRotator, build_request_headers, parse_cookie_string

logger = structlog.get_logger(__name__)
settings = get_settings()

# Characters that trigger rate limiting / auth failure
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class EkaApiClient:
    """
    Async HTTP client for the Eka Care drug search API.

    Features:
    - Cookie rotation across a pool
    - Exponential backoff with jitter
    - Per-request timeout
    - Pagination detection
    """

    BASE_URL = settings.eka_base_url
    ENDPOINT = "/v1/drugs-and-labs"

    def __init__(self, rotator: CookieRotator) -> None:
        self._rotator = rotator
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        base_url=self.BASE_URL,
                        timeout=httpx.Timeout(settings.crawler_request_timeout),
                        follow_redirects=True,
                        http2=True,
                    )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _build_params(self, query: str, limit: int, offset: int = 0) -> dict[str, Any]:
        params: dict[str, Any] = {
            "q": query,
            "limit": limit,
            "show_custom": "true",
            "s_type": "drug",
            "flavour": "dw",
        }
        if settings.eka_cid:
            params["cid"] = settings.eka_cid
        if settings.eka_docid:
            params["docid"] = settings.eka_docid
        if offset:
            params["offset"] = offset
        return params

    async def search(
        self, query: str, limit: int | None = None, offset: int = 0
    ) -> dict[str, Any]:
        """
        Execute a single search request with retries and cookie rotation.
        Returns the raw parsed JSON or raises after exhausting retries.
        """
        effective_limit = limit or settings.crawler_api_limit
        params = self._build_params(query, effective_limit, offset)

        last_exc: Exception | None = None

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(settings.crawler_retry_max),
                wait=wait_exponential(
                    min=settings.crawler_retry_min_wait,
                    max=settings.crawler_retry_max_wait,
                ),
                retry=retry_if_exception_type(
                    (httpx.TransportError, httpx.TimeoutException, RetryableError)
                ),
                reraise=False,
            ):
                with attempt:
                    cookie_str = self._rotator.next()
                    cookies = parse_cookie_string(cookie_str)
                    headers = build_request_headers()

                    client = await self._get_client()
                    t0 = time.perf_counter()

                    resp = await client.get(
                        self.ENDPOINT,
                        params=params,
                        headers=headers,
                        cookies=cookies,
                    )
                    latency_ms = (time.perf_counter() - t0) * 1000

                    if resp.status_code in _RETRYABLE_STATUS:
                        logger.warning(
                            "retryable_status",
                            status=resp.status_code,
                            query=query,
                            latency_ms=round(latency_ms, 1),
                        )
                        raise RetryableError(f"HTTP {resp.status_code}")

                    if resp.status_code == 401:
                        logger.error("auth_failed", query=query, cookie_idx=self._rotator.current_index())
                        raise AuthError("Cookie rejected by API (401)")

                    resp.raise_for_status()

                    logger.debug(
                        "api_ok",
                        query=query,
                        status=resp.status_code,
                        latency_ms=round(latency_ms, 1),
                    )
                    return resp.json()

        except RetryError as exc:
            logger.error("retry_exhausted", query=query, error=str(exc))
            raise

        raise RuntimeError("search: should not reach here")

    async def search_all_pages(self, query: str) -> list[dict[str, Any]]:
        """
        Fetch all pages for a query by detecting pagination metadata.
        Returns flat list of raw drug dicts.
        """
        limit = settings.crawler_api_limit
        all_items: list[dict[str, Any]] = []
        offset = 0

        while True:
            data = await self.search(query, limit=limit, offset=offset)

            # Detect where results live (data, results, drugs, items…)
            items = _extract_items(data)
            all_items.extend(items)

            # Pagination detection
            has_next = (
                data.get("next")
                or data.get("cursor")
                or (
                    isinstance(data.get("total"), int)
                    and data["total"] > offset + len(items)
                    and len(items) == limit
                )
            )

            if not has_next or not items or len(items) < limit:
                break

            offset += limit
            await asyncio.sleep(0.1)  # gentle pacing

        return all_items


def _extract_items(response: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect the results array from various API response shapes."""
    for key in ("data", "results", "drugs", "items", "medicines"):
        val = response.get(key)
        if isinstance(val, list):
            return val
    # Flat list response
    if isinstance(response, list):
        return response
    return []


class RetryableError(Exception):
    pass


class AuthError(Exception):
    pass
