from __future__ import annotations

from typing import Literal, get_args

from bson import Binary
from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from pymongo import ReturnDocument
from pymongo.database import Database

from app.core.config import Settings
from app.core.errors import AppError, not_found
from app.core.rate_limit import client_ip, get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user, get_optional_user
from app.dependencies.common import Pagination, get_app_settings
from app.dependencies.params import csv_choices, csv_values
from app.schemas.common import Page
from app.schemas.enums import Availability, CollaborationMode, ExperienceLevel, Role
from app.schemas.profile import ProfileCard, ProfileMe, ProfilePublic, ProfileUpdate, validate_handle
from app.services import profiles as profile_service
from app.services.avatars import ALLOWED_CONTENT_TYPES, process_avatar
from app.services.profiles import Viewer
from app.services.taxonomy import skill_keys, tag_keys
from app.utils import escape_regex, utcnow

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me", response_model=ProfileMe)
def get_my_profile(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    profile = profile_service.get_profile_by_user(db, user.id)
    return profile_service.to_me(profile, Viewer(db, user))


@router.patch("/me", response_model=ProfileMe)
def update_my_profile(payload: ProfileUpdate, user: CurrentUser = Depends(get_current_user),
                      db: Database = Depends(get_db)):
    profile = profile_service.update_profile(db, user.id, payload)
    return profile_service.to_me(profile, Viewer(db, user))


@router.post("/me/avatar", response_model=ProfileMe, summary="Upload a profile photo (PNG, JPEG, WebP, GIF)")
def upload_avatar(request: Request, file: UploadFile = File(...),
                  user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db),
                  settings: Settings = Depends(get_app_settings)):
    get_rate_limiter(request).check(f"avatar:user:{user.id}", 10, 3600)
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(415, "unsupported_image", "Upload a PNG, JPEG, WebP or GIF image.")
    raw = file.file.read(settings.max_avatar_upload_bytes + 1)
    if len(raw) > settings.max_avatar_upload_bytes:
        limit_mb = settings.max_avatar_upload_bytes / 1_000_000
        raise AppError(413, "file_too_large", f"Images must be {limit_mb:g} MB or smaller.")
    data = process_avatar(raw)
    now = utcnow()
    db.avatars.replace_one(
        {"_id": user.id},
        {"_id": user.id, "data": Binary(data), "content_type": "image/webp", "updated_at": now},
        upsert=True,
    )
    version = int(now.timestamp() * 1000)
    profile = db.profiles.find_one_and_update(
        {"user_id": user.id}, {"$set": {"avatar_version": version, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    return profile_service.to_me(profile, Viewer(db, user))


@router.delete("/me/avatar", response_model=ProfileMe)
def delete_avatar(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    db.avatars.delete_one({"_id": user.id})
    profile = db.profiles.find_one_and_update(
        {"user_id": user.id}, {"$set": {"avatar_version": None, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return profile_service.to_me(profile, Viewer(db, user))


@router.get("", response_model=Page[ProfileCard], summary="Teammate directory (signed-in members only)")
def list_profiles(
    q: str | None = Query(None, max_length=80, description="Name, headline, skill or college"),
    skills: str | None = Query(None, description="Comma-separated skills"),
    skills_mode: Literal["any", "all"] = "any",
    interests: str | None = Query(None, description="Comma-separated interests"),
    experience: str | None = Query(None, description=f"Comma-separated: {', '.join(get_args(ExperienceLevel))}"),
    roles: str | None = Query(None, description="Comma-separated preferred roles"),
    availability: str | None = Query(None, description="Comma-separated availability values"),
    mode: str | None = Query(None, description="Comma-separated collaboration modes"),
    open_only: bool = False,
    sort: Literal["recent", "name"] = "recent",
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    # Hidden profiles are never listed; the viewer is excluded from their own search.
    query: dict = {"is_active": True, "visibility": {"$in": ["public", "members"]}, "user_id": {"$ne": user.id}}
    if q and q.strip():
        term = q.strip().lstrip("@")  # "@ada" searches usernames too
        pattern = {"$regex": escape_regex(term or q), "$options": "i"}
        query["$or"] = [{"handle": pattern}, {"name": pattern}, {"headline": pattern}, {"skills": pattern},
                        {"institution": pattern}, {"background": pattern}]
    if skill_list := skill_keys(csv_values(skills)):
        query["skills_key"] = {"$all": skill_list} if skills_mode == "all" else {"$in": skill_list}
    if interest_list := tag_keys(csv_values(interests)):
        query["interests_key"] = {"$in": interest_list}
    if levels := csv_choices(experience, get_args(ExperienceLevel)):
        query["experience_level"] = {"$in": levels}
    if role_list := csv_choices(roles, get_args(Role)):
        query["preferred_roles"] = {"$in": role_list}
    if availability_list := csv_choices(availability, get_args(Availability)):
        query["availability"] = {"$in": availability_list}
    if modes := csv_choices(mode, get_args(CollaborationMode)):
        query["collaboration_mode"] = {"$in": modes}
    if open_only:
        query["open_to_collaborate"] = True

    order = [("updated_at", -1)] if sort == "recent" else [("name", 1)]
    total = db.profiles.count_documents(query)
    docs = db.profiles.find(query).sort(order).skip(pagination.skip).limit(pagination.page_size)
    return pagination.response([profile_service.to_card(doc) for doc in docs], total)


@router.get("/handle-available", summary="Is this username free? (public; usernames are public identifiers)")
def handle_available(request: Request, handle: str = Query(..., max_length=30)):
    get_rate_limiter(request).check(f"handle-check:ip:{client_ip(request)}", 60, 60)
    try:
        value = validate_handle(handle)
    except ValueError as exc:
        return {"handle": handle.strip().lower(), "valid": False, "available": False, "message": str(exc)}
    db = request.app.state.db_manager.db
    taken = profile_service.handle_taken(db, value)
    return {"handle": value, "valid": True, "available": not taken,
            "message": "That username is already taken." if taken else "Username is available."}


@router.get("/{handle}", response_model=ProfilePublic)
def get_profile(handle: str, user: CurrentUser | None = Depends(get_optional_user), db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    profile = profile_service.get_visible_profile(db, handle, viewer)
    return profile_service.to_public(profile, viewer)


@router.get("/{handle}/avatar", response_class=Response, include_in_schema=True,
            responses={200: {"content": {"image/webp": {}}}})
def get_avatar(handle: str, request: Request, user: CurrentUser | None = Depends(get_optional_user),
               db: Database = Depends(get_db)):
    profile = profile_service.get_visible_profile(db, handle, Viewer(db, user))
    avatar = db.avatars.find_one({"_id": profile["user_id"]})
    if not avatar:
        raise not_found("No profile photo.")
    etag = f'"{profile.get("avatar_version")}"'
    cache = "public" if profile.get("visibility") == "public" else "private"
    headers = {"Cache-Control": f"{cache}, max-age=86400", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=bytes(avatar["data"]), media_type=avatar.get("content_type", "image/webp"),
                    headers=headers)
