from __future__ import annotations

import math
from typing import Any

from fastapi import Query, Request

from app.core.config import Settings


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1, le=1000, description="1-based page number"),
        page_size: int = Query(12, ge=1, le=50, description="Items per page (max 50)"),
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.page_size

    def response(self, items: list[Any], total: int) -> dict[str, Any]:
        return {
            "items": items,
            "total": total,
            "page": self.page,
            "page_size": self.page_size,
            "pages": math.ceil(total / self.page_size) if total else 0,
        }
