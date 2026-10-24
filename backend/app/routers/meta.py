from fastapi import APIRouter, Depends, Request

from app.core.config import Settings
from app.dependencies.common import get_app_settings

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/config", summary="Public, non-secret server capabilities for the UI")
def public_config(request: Request, settings: Settings = Depends(get_app_settings)) -> dict:
    return {
        "environment": settings.environment,
        "email_delivery_enabled": settings.email_enabled,
        "email_verification_required": settings.require_email_verification,
        # Lets the UI warn that data lives only in the dev in-memory database.
        "in_memory_database": request.app.state.db_manager.in_memory,
        "external_providers_enabled": settings.external_providers_enabled,
    }
