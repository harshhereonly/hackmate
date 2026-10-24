from fastapi import APIRouter, Depends, Query, Request
from pymongo.database import Database

from app.core.rate_limit import get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.matching import OpportunitySuggestions, TeammateSuggestions
from app.services import projects as project_service
from app.services.matching import engine
from app.services.opportunities import catalog
from app.services.profiles import Viewer

router = APIRouter(prefix="/matching", tags=["matching"])


def _throttle(request: Request, user: CurrentUser) -> None:
    get_rate_limiter(request).check(f"matching:user:{user.id}", 60, 60)


@router.get("/teammates", response_model=TeammateSuggestions, summary="Suggested teammates for me")
def suggested_teammates(request: Request, limit: int = Query(10, ge=1, le=30),
                        user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    _throttle(request, user)
    return engine.teammates_for_user(db, user, limit)


@router.get("/projects/{project_id}/candidates", response_model=TeammateSuggestions,
            summary="Suggested candidates for a project (its team only)")
def project_candidates(project_id: str, request: Request, limit: int = Query(10, ge=1, le=30),
                       user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    _throttle(request, user)
    project = project_service.get_project(db, project_id, Viewer(db, user))
    return engine.candidates_for_project(db, project, user, limit)


@router.get("/opportunities", response_model=OpportunitySuggestions,
            summary="Suggested opportunities and recruiting projects for me")
def suggested_opportunities(request: Request, limit: int = Query(10, ge=1, le=30),
                            user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    _throttle(request, user)
    return engine.opportunities_for_user(db, user, limit)


@router.get("/opportunities/{opportunity_id}/teammates", response_model=TeammateSuggestions,
            summary="People who could team up with me for this opportunity")
def opportunity_teammates(opportunity_id: str, request: Request, limit: int = Query(10, ge=1, le=30),
                          user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    _throttle(request, user)
    opportunity = catalog.get_opportunity(db, opportunity_id, Viewer(db, user))
    return engine.teammates_for_opportunity(db, opportunity, user, limit)
