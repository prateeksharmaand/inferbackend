from datetime import date, datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, field_serializer

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", when_used="json")
    def _ser(self, v):
        if isinstance(v, Decimal):
            return float(v)
        return v


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Msg(BaseModel):
    ok: bool = True
    message: str = ""


__all__ = ["ORM", "Page", "Msg", "date", "datetime"]
