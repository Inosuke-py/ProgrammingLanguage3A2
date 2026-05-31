from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import httpx
import re

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.auth import create_access_token
from app.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def generate_username(db: Session, name: str, email: str) -> str:
    """Generate a unique @username from the user's name (or email fallback).

    Strips spaces, lowercases, removes non-alphanumeric chars. If the base
    username is taken, appends an incrementing number until unique.
    """
    # Try name first
    base = re.sub(r"[^a-zA-Z0-9]", "", name).lower()
    if not base:
        # Fallback to email local-part
        local = email.split("@")[0]
        base = re.sub(r"[^a-zA-Z0-9]", "", local).lower()
    if not base:
        base = "user"

    # Cap length so usernames stay readable
    base = base[:20]

    # Ensure uniqueness
    candidate = base
    suffix = 1
    while db.query(User).filter(User.username == candidate).first() is not None:
        suffix += 1
        candidate = f"{base}{suffix}"
        if suffix > 999:
            # Pathological fallback
            import secrets
            candidate = f"{base}{secrets.token_hex(3)}"
            break
    return candidate


class GoogleLoginRequest(BaseModel):
    credential: str  # Google ID token from frontend
    explorer_flag: str | None = None  # "both" if user completed landing + login quizzes


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    badge_earned: dict | None = None  # Surprise drop for the curious explorer secret badge


@router.post("/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_login(request: Request, body: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Verify Google ID token and create/login user."""
    # Verify the Google ID token
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={body.credential}"
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_data = resp.json()

    # Validate the token is for our app
    if google_data.get("aud") != settings.google_client_id:
        raise HTTPException(status_code=401, detail="Token not issued for this app")

    google_id = google_data["sub"]
    email = google_data["email"]
    name = google_data.get("name", email.split("@")[0])
    picture = google_data.get("picture")

    # Find or create user
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = User(
            email=email,
            name=name,
            picture=picture,
            google_id=google_id,
            username=generate_username(db, name, email),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update profile info on each login
        user.name = name
        user.picture = picture
        # Backfill username for existing accounts created before this feature
        if not user.username:
            user.username = generate_username(db, name, email)
        db.commit()

    # Create JWT
    access_token = create_access_token(user.id)

    # Curious Explorer secret badge: granted only if the browser carried both
    # landing-quiz and login-quiz completion flags. We never tell users this
    # exists — it's a reward for poking around before signing up.
    badge_earned = None
    if body.explorer_flag == "both":
        from app.routers.badges_router import check_and_award_badge
        badge_earned = check_and_award_badge(db, user, "curious_explorer")

    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "user_number": user.user_number,
            "email": user.email,
            "name": user.name,
            "username": user.username,
            "picture": user.picture,
            "xp": user.xp,
            "level": user.level,
            "streak": user.streak,
            "role": user.role,
        },
        badge_earned=badge_earned,
    )


@router.get("/me")
async def get_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_settings),
):
    """Get current user profile."""
    from app.auth import get_current_user
    # This endpoint is handled via the dependency
    pass
