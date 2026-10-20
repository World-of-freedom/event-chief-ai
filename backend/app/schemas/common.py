from typing import Generic, TypeVar

from pydantic import BaseModel


class DetailResponse(BaseModel):
    detail: str


T = TypeVar("T")


class ListResponse(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
