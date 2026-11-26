from dataclasses import dataclass, field
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class ProviderError(Exception):
    """A provider call failed in a way the caller should surface (bad key, quota, refusal, unusable output)."""

    def __init__(self, message: str, *, retryable: bool = False, code: str = "provider_error"):
        super().__init__(message)
        self.retryable = retryable
        self.code = code


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, other: "Usage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens


@dataclass
class StructuredResult:
    data: BaseModel
    usage: Usage
    sources: list[dict[str, str]] = field(default_factory=list)


@dataclass
class MediaResult:
    items: list[tuple[bytes, str]]  # (bytes, mime)
    usage: Usage
    units: int  # images generated / video seconds


class Provider(Protocol):
    name: str
    model: str
    supports_grounding: bool

    def structured(self, system: str, user: str, schema: type[T], *, max_tokens: int = 12000) -> StructuredResult: ...

    def research(self, system: str, user: str, schema: type[T]) -> StructuredResult: ...

    def image(self, prompt: str, *, size: str = "1024x1024", n: int = 1) -> MediaResult: ...

    def video(self, prompt: str, *, aspect_ratio: str = "9:16", seconds: int = 8) -> MediaResult: ...


def http_error_message(provider: str, status: int | None, detail: str) -> tuple[str, bool]:
    """Human message + retryable flag for common HTTP statuses."""
    msg = {
        400: f"{provider} rejected the request",
        401: f"{provider} API key was rejected",
        403: f"{provider} API key lacks permission for this model",
        404: f"{provider} model not found",
        429: f"{provider} rate limit or quota reached",
    }.get(status or 0, f"{provider} API error {status}")
    return f"{msg}: {detail[:200]}", status in (429, 500, 502, 503, 504, None)


def strip_json_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    return t.strip()


Json = dict[str, Any]
