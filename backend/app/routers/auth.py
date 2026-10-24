from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pymongo.database import Database

from app.core.config import Settings
from app.core.rate_limit import get_rate_limiter, rate_limit
from app.core.security import decode_session_token
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import get_app_settings
from app.schemas.auth import (
    AuthUser,
    ChangePasswordRequest,
    CsrfResponse,
    EmailActionResponse,
    EmailOnlyRequest,
    LoginRequest,
    ResetPasswordRequest,
    SessionResponse,
    SignupRequest,
    SignupResponse,
    TokenRequest,
)
from app.schemas.common import MessageResponse
from app.services import auth_service
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])


class MeResponse(BaseModel):
    user: AuthUser


def _email_delivery(settings: Settings) -> str:
    return "enabled" if settings.email_enabled else "not_configured"


@router.get("/csrf", response_model=CsrfResponse, summary="Get (or create) the CSRF token for this browser")
def get_csrf_token(request: Request, response: Response, settings: Settings = Depends(get_app_settings)):
    existing = request.cookies.get(settings.csrf_cookie_name)
    if existing and 32 <= len(existing) <= 128:
        return {"csrf_token": existing}
    return {"csrf_token": auth_service.issue_csrf_token(response, settings)}


@router.post("/signup", response_model=SignupResponse, status_code=201,
             dependencies=[rate_limit("signup", 5, 600)])
def signup(payload: SignupRequest, request: Request, response: Response,
           db: Database = Depends(get_db), settings: Settings = Depends(get_app_settings)):
    user, delivery = auth_service.signup(
        db, settings, request.app.state.email, name=payload.name, address=payload.email, password=payload.password,
        username=payload.username,
    )
    csrf_token = auth_service.issue_csrf_token(response, settings)
    if settings.require_email_verification:
        return {"user": None, "csrf_token": csrf_token, "verification_required": True, "email_delivery": delivery}
    token = auth_service.create_session(db, settings, user["_id"], request.headers.get("user-agent"))
    auth_service.set_session_cookie(response, settings, token)
    return {
        "user": auth_service.auth_user_payload(db, user),
        "csrf_token": csrf_token,
        "verification_required": False,
        "email_delivery": delivery,
    }


@router.post("/login", response_model=SessionResponse, dependencies=[rate_limit("login", 20, 300)])
def login(payload: LoginRequest, request: Request, response: Response,
          db: Database = Depends(get_db), settings: Settings = Depends(get_app_settings)):
    user = auth_service.authenticate(
        db, settings, get_rate_limiter(request), address=payload.email, password=payload.password
    )
    previous = request.cookies.get(settings.session_cookie_name)
    if previous:
        claims = decode_session_token(previous, secret=settings.jwt_key, algorithm=settings.jwt_algorithm)
        if claims:
            auth_service.revoke_session(db, claims["sid"])
    token = auth_service.create_session(db, settings, user["_id"], request.headers.get("user-agent"))
    auth_service.set_session_cookie(response, settings, token)
    # Rotate the CSRF token on privilege change (sign-in).
    csrf_token = auth_service.issue_csrf_token(response, settings)
    return {"user": auth_service.auth_user_payload(db, user), "csrf_token": csrf_token}


@router.post("/logout", response_model=MessageResponse)
def logout(request: Request, response: Response,
           db: Database = Depends(get_db), settings: Settings = Depends(get_app_settings)):
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        claims = decode_session_token(token, secret=settings.jwt_key, algorithm=settings.jwt_algorithm)
        if claims:
            auth_service.revoke_session(db, claims["sid"])
    auth_service.clear_session_cookie(response, settings)
    return {"message": "You have been signed out."}


@router.post("/logout-all", response_model=MessageResponse, summary="Sign out of every device")
def logout_all(response: Response, user: CurrentUser = Depends(get_current_user),
               db: Database = Depends(get_db), settings: Settings = Depends(get_app_settings)):
    auth_service.revoke_all_sessions(db, user.id)
    auth_service.clear_session_cookie(response, settings)
    return {"message": "You have been signed out on all devices."}


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    doc = db.users.find_one({"_id": user.id})
    return {"user": auth_service.auth_user_payload(db, doc)}


@router.post("/verify-email", response_model=MessageResponse, dependencies=[rate_limit("verify", 10, 600)])
def verify_email(payload: TokenRequest, db: Database = Depends(get_db)):
    auth_service.verify_email(db, payload.token)
    return {"message": "Your email address is verified."}


@router.post("/resend-verification", response_model=EmailActionResponse,
             dependencies=[rate_limit("resend-verify", 5, 3600)])
def resend_verification(payload: EmailOnlyRequest, request: Request,
                        db: Database = Depends(get_db), settings: Settings = Depends(get_app_settings)):
    get_rate_limiter(request).check(f"resend-verify:email:{payload.email}", 3, 3600)
    auth_service.resend_verification(db, settings, request.app.state.email, payload.email)
    return {
        "message": "If that account exists and is not verified yet, a new verification link is on its way.",
        "email_delivery": _email_delivery(settings),
    }


@router.post("/forgot-password", response_model=EmailActionResponse,
             dependencies=[rate_limit("forgot", 5, 900)])
def forgot_password(payload: EmailOnlyRequest, request: Request,
                    db: Database = Depends(get_db), settings: Settings = Depends(get_app_settings)):
    get_rate_limiter(request).check(f"forgot:email:{payload.email}", 3, 3600)
    auth_service.request_password_reset(db, settings, request.app.state.email, payload.email)
    return {
        "message": "If an account exists for that email, we've sent a link to reset the password.",
        "email_delivery": _email_delivery(settings),
    }


@router.post("/reset-password", response_model=MessageResponse, dependencies=[rate_limit("reset", 10, 3600)])
def reset_password(payload: ResetPasswordRequest, request: Request, db: Database = Depends(get_db)):
    auth_service.reset_password(db, get_rate_limiter(request), payload.token, payload.password)
    return {"message": "Your password has been reset. Sign in with your new password."}


@router.post("/change-password", response_model=MessageResponse)
def change_password(payload: ChangePasswordRequest, request: Request,
                    user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"change-password:user:{user.id}", 10, 3600)
    auth_service.change_password(db, user.id, user.session_id, payload.current_password, payload.new_password)
    return {"message": "Password updated. Other devices have been signed out."}
