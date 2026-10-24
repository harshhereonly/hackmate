from __future__ import annotations

from typing import Literal, get_args

from fastapi import APIRouter, Depends, Query, Request, Response
from pymongo.database import Database

from app.core.errors import not_found
from app.core.rate_limit import get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user, get_optional_user
from app.dependencies.common import Pagination
from app.dependencies.params import csv_choices, csv_values
from app.schemas.common import Page
from app.schemas.enums import CollaborationMode, ProjectCategory, ProjectStatus
from app.schemas.project import ProjectCreate, ProjectDetail, ProjectListItem, ProjectMember, ProjectUpdate
from app.schemas.request import InvitationCreate, JoinRequestCreate, JoinRequestOut
from app.services import join_requests as request_service
from app.services import projects as project_service
from app.services.profiles import Viewer, get_visible_profile
from app.services.taxonomy import skill_keys
from app.utils import escape_regex

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=Page[ProjectListItem], summary="Browse projects")
def list_projects(
    q: str | None = Query(None, max_length=80),
    skills: str | None = Query(None, description="Comma-separated skills"),
    skills_mode: Literal["any", "all"] = "any",
    category: str | None = Query(None, description="Comma-separated categories"),
    status: str | None = Query(None, description="Comma-separated: recruiting, active, completed"),
    mode: str | None = Query(None, description="Comma-separated collaboration modes"),
    has_openings: bool = False,
    member: str | None = Query(None, description="Only projects this handle belongs to"),
    sort: Literal["recent", "title"] = "recent",
    pagination: Pagination = Depends(),
    user: CurrentUser | None = Depends(get_optional_user),
    db: Database = Depends(get_db),
):
    viewer = Viewer(db, user)
    query: dict = {"is_removed": {"$ne": True}}
    if q and q.strip():
        pattern = {"$regex": escape_regex(q), "$options": "i"}
        query["$or"] = [{"title": pattern}, {"summary": pattern}, {"required_skills": pattern}]
    if skill_list := skill_keys(csv_values(skills)):
        query["skills_key"] = {"$all": skill_list} if skills_mode == "all" else {"$in": skill_list}
    if categories := csv_choices(category, get_args(ProjectCategory)):
        query["category"] = {"$in": categories}
    if statuses := csv_choices(status, get_args(ProjectStatus)):
        query["status"] = {"$in": statuses}
    if modes := csv_choices(mode, get_args(CollaborationMode)):
        query["collaboration_mode"] = {"$in": modes}
    if has_openings:
        query["$expr"] = {"$lt": ["$member_count", "$max_team_size"]}
    if member:
        profile = get_visible_profile(db, member, viewer)
        query["_id"] = {"$in": db.team_memberships.distinct("project_id", {"user_id": profile["user_id"]})}

    order = [("created_at", -1)] if sort == "recent" else [("title", 1)]
    total = db.projects.count_documents(query)
    docs = list(db.projects.find(query).sort(order).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(project_service.to_list_items(db, viewer, docs), total)


@router.get("/mine", response_model=Page[ProjectListItem], summary="Projects I own or belong to")
def my_projects(
    role: Literal["all", "owner", "member"] = "all",
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    membership_query: dict = {"user_id": user.id}
    if role != "all":
        membership_query["role"] = role
    project_ids = db.team_memberships.distinct("project_id", membership_query)
    query = {"_id": {"$in": project_ids}}
    total = db.projects.count_documents(query)
    docs = list(db.projects.find(query).sort("updated_at", -1).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(project_service.to_list_items(db, Viewer(db, user), docs), total)


@router.post("", response_model=ProjectDetail, status_code=201)
def create_project(payload: ProjectCreate, request: Request, user: CurrentUser = Depends(get_current_user),
                   db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"project-create:user:{user.id}", 10, 3600)
    project = project_service.create_project(db, user, payload)
    return project_service.to_detail(db, project, Viewer(db, user))


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str, user: CurrentUser | None = Depends(get_optional_user),
                db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    project = project_service.get_project(db, project_id, viewer)
    return project_service.to_detail(db, project, viewer)


@router.patch("/{project_id}", response_model=ProjectDetail)
def update_project(project_id: str, payload: ProjectUpdate, user: CurrentUser = Depends(get_current_user),
                   db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    project = project_service.get_project(db, project_id, viewer)
    updated = project_service.update_project(db, project, user, payload)
    return project_service.to_detail(db, updated, viewer)


@router.delete("/{project_id}", status_code=204, response_class=Response)
def delete_project(project_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    project = project_service.get_project(db, project_id, Viewer(db, user))
    project_service.delete_project(db, project, user)
    return Response(status_code=204)


@router.get("/{project_id}/members", response_model=list[ProjectMember])
def list_members(project_id: str, user: CurrentUser | None = Depends(get_optional_user),
                 db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    project = project_service.get_project(db, project_id, viewer)
    return project_service.list_members(db, project, viewer)


@router.delete("/{project_id}/members/{handle}", status_code=204, response_class=Response,
               summary="Remove a member (owner only)")
def remove_member(project_id: str, handle: str, user: CurrentUser = Depends(get_current_user),
                  db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    project = project_service.get_project(db, project_id, viewer)
    project_service.require_owner(project, user)
    profile = db.profiles.find_one({"handle": handle.lower()}, {"user_id": 1})
    if not profile:
        raise not_found("That person isn't on this team.")
    project_service.remove_member(db, project, user, profile["user_id"])
    return Response(status_code=204)


@router.post("/{project_id}/leave", status_code=204, response_class=Response)
def leave_project(project_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    project = project_service.get_project(db, project_id, Viewer(db, user))
    project_service.remove_member(db, project, user, user.id)
    return Response(status_code=204)


@router.post("/{project_id}/requests", response_model=JoinRequestOut, status_code=201,
             summary="Request to join a project")
def request_to_join(project_id: str, payload: JoinRequestCreate, request: Request,
                    user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"join-request:user:{user.id}", 30, 3600)
    project = project_service.get_project(db, project_id, Viewer(db, user))
    doc = request_service.create_application(db, project, user, payload)
    return request_service.to_out_many(db, [doc], user)[0]


@router.post("/{project_id}/invitations", response_model=JoinRequestOut, status_code=201,
             summary="Invite someone to join (owner only)")
def invite(project_id: str, payload: InvitationCreate, request: Request,
           user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"invitation:user:{user.id}", 30, 3600)
    project = project_service.get_project(db, project_id, Viewer(db, user))
    doc = request_service.create_invitation(db, project, user, payload)
    return request_service.to_out_many(db, [doc], user)[0]


@router.get("/{project_id}/requests", response_model=Page[JoinRequestOut],
            summary="Requests and invitations for one project (owner only)")
def project_requests(
    project_id: str,
    status: Literal["pending", "accepted", "rejected", "withdrawn", "all"] = "pending",
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    project = project_service.get_project(db, project_id, Viewer(db, user))
    project_service.require_owner(project, user)
    query: dict = {"project_id": project["_id"]}
    if status != "all":
        query["status"] = status
    total = db.join_requests.count_documents(query)
    docs = list(db.join_requests.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(request_service.to_out_many(db, docs, user), total)
