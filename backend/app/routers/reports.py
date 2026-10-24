from fastapi import APIRouter, Depends, Request
from pymongo.database import Database

from app.core.rate_limit import get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import Pagination
from app.schemas.common import Page
from app.schemas.report import ReportCreate, ReportOut
from app.services import moderation

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportOut, status_code=201,
             summary="Report a person, project, opportunity or message")
def create_report(payload: ReportCreate, request: Request, user: CurrentUser = Depends(get_current_user),
                  db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"report:user:{user.id}", 10, 3600)
    return moderation.report_out(moderation.create_report(db, user, payload))


@router.get("/mine", response_model=Page[ReportOut], summary="Reports I submitted and their status")
def my_reports(pagination: Pagination = Depends(), user: CurrentUser = Depends(get_current_user),
               db: Database = Depends(get_db)):
    query = {"reporter_id": user.id}
    total = db.reports.count_documents(query)
    docs = db.reports.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size)
    return pagination.response([moderation.report_out(doc) for doc in docs], total)
