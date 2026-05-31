"""
Public user-facing endpoints: search by username, view a user's public profile.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional

from app.database import get_db
from app.models import User, UserBadge, Attempt, Title, UserTitle
from app.auth import get_current_user
from app.routers.profile_router import (
    get_user_aura_tier, get_badge_rarity_pct, get_user_recent_activity,
    get_user_better_than, is_user_online, check_and_award_titles, get_user_presence,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
async def search_users(
    q: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search users by username or display name. Strips a leading @ from the query."""
    query = q.strip().lstrip("@").lower()
    if len(query) < 1:
        return {"results": []}

    pattern = f"%{query}%"
    results = (
        db.query(User)
        .filter(
            or_(
                func.lower(User.username).like(pattern),
                func.lower(User.name).like(pattern),
            )
        )
        .filter(User.role != "banned")
        .order_by(User.xp.desc())
        .limit(min(limit, 25))
        .all()
    )

    return {
        "results": [
            {
                "id": u.id,
                "user_number": u.user_number,
                "name": u.name,
                "username": u.username,
                "picture": u.picture,
                "xp": u.xp,
                "level": u.level,
                "is_self": u.id == current_user.id,
            }
            for u in results
        ]
    }


@router.get("/by-username/{username}")
async def get_user_by_username(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Public profile lookup by @username."""
    clean = username.lstrip("@")
    user = db.query(User).filter(func.lower(User.username) == clean.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_public_profile(db, user, current_user)


@router.get("/{user_id}")
async def get_user_profile(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Public profile by user number (sequential int) or UUID fallback."""
    user = None
    # Try numeric lookup first (e.g. /users/42)
    if user_id.isdigit():
        user = db.query(User).filter(User.user_number == int(user_id)).first()
    # Fallback to UUID (legacy URLs / classroom etc.)
    if not user:
        user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_public_profile(db, user, current_user)


def _build_public_profile(db: Session, user: User, viewer: User) -> dict:
    """Build a public profile payload for any user."""
    # Auto-check titles for viewers viewing their own profile (so they see new ones)
    if user.id == viewer.id:
        check_and_award_titles(db, user)

    # Quiz stats
    completed_attempts = (
        db.query(Attempt)
        .filter(Attempt.user_id == user.id, Attempt.completed_at.isnot(None))
        .all()
    )
    quiz_count = len(completed_attempts)
    avg_score = (
        round(sum(a.score for a in completed_attempts if a.score is not None) / quiz_count, 1)
        if quiz_count > 0 else 0
    )

    # Global rank by XP
    higher_count = db.query(User).filter(User.xp > user.xp).count()
    global_rank = higher_count + 1

    # Badges with rarity %
    badge_rows = db.query(UserBadge).filter(UserBadge.user_id == user.id).all()
    from app.models import Badge
    badges = []
    for ub in badge_rows:
        b = db.query(Badge).filter(Badge.key == ub.badge_key).first()
        if b:
            badges.append({
                "key": b.key,
                "name": b.name,
                "description": b.description,
                "icon": b.icon,
                "rarity": b.rarity,
                "category": b.category,
                "earned_at": ub.earned_at.isoformat() if ub.earned_at else None,
                "rarity_pct": get_badge_rarity_pct(db, b.key),
            })

    # Pinned badge for showcase
    pinned_badge = None
    if user.pinned_badge_key:
        pb = db.query(Badge).filter(Badge.key == user.pinned_badge_key).first()
        if pb:
            pinned_badge = {
                "key": pb.key,
                "name": pb.name,
                "description": pb.description,
                "icon": pb.icon,
                "rarity": pb.rarity,
            }

    # Equipped title
    equipped_title = None
    if user.equipped_title_key:
        et = db.query(Title).filter(Title.key == user.equipped_title_key).first()
        if et:
            # Verify the user actually owns it (cleanup in case of demotions)
            owns = db.query(UserTitle).filter(
                UserTitle.user_id == user.id, UserTitle.title_key == et.key
            ).first()
            if owns:
                equipped_title = {"key": et.key, "name": et.name, "rarity": et.rarity}

    # Title count
    title_count = db.query(UserTitle).filter(UserTitle.user_id == user.id).count()

    return {
        "id": user.id,
        "user_number": user.user_number,
        "name": user.name,
        "username": user.username,
        "picture": user.picture,
        "motto": user.motto,
        "xp": user.xp,
        "level": user.level,
        "streak": user.streak,
        "longest_survival": user.longest_survival,
        "total_questions_answered": user.total_questions_answered,
        "quiz_count": quiz_count,
        "avg_score": avg_score,
        "global_rank": global_rank,
        "better_than_pct": get_user_better_than(db, user),
        "aura_tier": get_user_aura_tier(user.level),
        "online": is_user_online(user.id),
        "presence": get_user_presence(user),
        "badges": badges,
        "badge_count": len(badges),
        "pinned_badge": pinned_badge,
        "equipped_title": equipped_title,
        "title_count": title_count,
        "activity": get_user_recent_activity(db, user.id, limit=8),
        "joined_at": user.created_at.isoformat() if user.created_at else None,
        "is_self": user.id == viewer.id,
    }



@router.get("/{user_id}/presence")
async def get_user_presence_only(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight presence-only endpoint for periodic polling without re-fetching the full profile."""
    user = None
    if user_id.isdigit():
        user = db.query(User).filter(User.user_number == int(user_id)).first()
    if not user:
        user = db.query(User).filter(User.id == user_id).first()
    if not user:
        # Try by username
        user = db.query(User).filter(func.lower(User.username) == user_id.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"presence": get_user_presence(user), "online": is_user_online(user.id)}
