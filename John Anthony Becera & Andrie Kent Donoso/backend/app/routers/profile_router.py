"""
Profile system: titles, equipped cosmetics, motto, recent activity feed.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import (
    User, Title, UserTitle, Badge, UserBadge, Attempt, Material, Quiz,
)
from app.auth import get_current_user
from app.services.ws_manager import manager

router = APIRouter(prefix="/profile", tags=["profile"])


# ─── Title catalog ────────────────────────────────────────────────────────────

TITLES_CATALOG = [
    # Onboarding / participation
    {"key": "newcomer", "name": "Newcomer", "description": "Joined the platform.", "rarity": "common"},

    # Quiz-count progression
    {"key": "scholar", "name": "Scholar", "description": "Completed 25 quizzes.", "rarity": "common"},
    {"key": "quiz_slayer", "name": "Quiz Slayer", "description": "Completed 100 quizzes.", "rarity": "rare"},
    {"key": "quiz_devotee", "name": "Quiz Devotee", "description": "Completed 500 quizzes.", "rarity": "epic"},
    {"key": "quiz_eternal", "name": "Quiz Eternal", "description": "Completed 1,000 quizzes.", "rarity": "legendary"},

    # Accuracy
    {"key": "perfectionist", "name": "Perfectionist", "description": "Scored 100% on 10 quizzes.", "rarity": "rare"},
    {"key": "flawless_mind", "name": "Flawless Mind", "description": "Scored 100% on 50 quizzes.", "rarity": "epic"},
    {"key": "untouchable_mind", "name": "Untouchable Mind", "description": "Scored 100% on 200 quizzes.", "rarity": "legendary"},
    {"key": "infallible", "name": "The Infallible", "description": "Maintained 95%+ accuracy across 150 quizzes.", "rarity": "mythic"},

    # Streaks
    {"key": "streak_guardian", "name": "Streak Guardian", "description": "Maintained a 30-day streak.", "rarity": "rare"},
    {"key": "streak_eternal", "name": "Eternal Flame", "description": "Maintained a 100-day streak.", "rarity": "legendary"},
    {"key": "year_of_mastery", "name": "Year of Mastery", "description": "Maintained a 365-day streak.", "rarity": "mythic"},

    # Survival
    {"key": "survival_king", "name": "Survival King", "description": "Survived 100+ in a single survival session.", "rarity": "rare"},
    {"key": "death_defier", "name": "Death Defier", "description": "Survived 1,000+ in a single survival session.", "rarity": "epic"},
    {"key": "untouched_by_fate", "name": "Untouched by Fate", "description": "Survived 5,000+ in a single survival session.", "rarity": "legendary"},
    {"key": "mythic_survivor", "name": "Mythic Survivor", "description": "Survived 10,000+ in a single survival session.", "rarity": "mythic"},

    # Levels
    {"key": "scholar_prime", "name": "Scholar Prime", "description": "Reached level 50.", "rarity": "epic"},
    {"key": "grandmaster", "name": "Grandmaster Learner", "description": "Reached level 100.", "rarity": "legendary"},
    {"key": "transcendent", "name": "Transcendent", "description": "Reached level 200.", "rarity": "mythic"},

    # Leaderboard
    {"key": "quiz_gladiator", "name": "Quiz Gladiator", "description": "Top 10 on the global leaderboard.", "rarity": "legendary"},
    {"key": "global_champion", "name": "Global Champion", "description": "Reached #1 on the global leaderboard.", "rarity": "mythic"},
]


def seed_titles(db: Session):
    """Insert title catalog if not already present, and update existing rows
    so name/description/rarity changes propagate after a deploy."""
    for t in TITLES_CATALOG:
        existing = db.query(Title).filter(Title.key == t["key"]).first()
        if not existing:
            db.add(Title(key=t["key"], name=t["name"], description=t["description"], rarity=t["rarity"]))
        else:
            existing.name = t["name"]
            existing.description = t["description"]
            existing.rarity = t["rarity"]
    db.commit()


def check_and_award_titles(db: Session, user: User) -> list[str]:
    """Award any titles the user newly qualifies for. Returns list of newly-earned title keys."""
    seed_titles(db)  # ensure catalog exists

    earned_keys = {ut.title_key for ut in db.query(UserTitle).filter(UserTitle.user_id == user.id).all()}
    newly_earned = []

    quiz_count = db.query(Attempt).filter(
        Attempt.user_id == user.id, Attempt.completed_at.isnot(None)
    ).count() or 0
    perfect_count = db.query(Attempt).filter(
        Attempt.user_id == user.id, Attempt.score == 100.0, Attempt.completed_at.isnot(None)
    ).count() or 0

    longest_survival = user.longest_survival or 0
    streak = user.streak or 0
    level = user.level or 0

    # Average accuracy across the user's last 150 quizzes — used by the
    # mythic "Infallible" title.
    last_150_scores = (
        db.query(Attempt.score)
        .filter(Attempt.user_id == user.id, Attempt.completed_at.isnot(None), Attempt.score.isnot(None))
        .order_by(Attempt.completed_at.desc())
        .limit(150)
        .all()
    )
    avg_150 = (
        sum(s[0] for s in last_150_scores) / len(last_150_scores)
        if last_150_scores else 0.0
    )

    # Global rank (cheap: just count users with more XP)
    rank = db.query(User).filter(User.xp > user.xp).count() + 1

    qualifications = [
        # Onboarding
        ("newcomer", True),

        # Quiz volume
        ("scholar", quiz_count >= 25),
        ("quiz_slayer", quiz_count >= 100),
        ("quiz_devotee", quiz_count >= 500),
        ("quiz_eternal", quiz_count >= 1000),

        # Accuracy
        ("perfectionist", perfect_count >= 10),
        ("flawless_mind", perfect_count >= 50),
        ("untouchable_mind", perfect_count >= 200),
        ("infallible", quiz_count >= 150 and avg_150 >= 95.0),

        # Streak
        ("streak_guardian", streak >= 30),
        ("streak_eternal", streak >= 100),
        ("year_of_mastery", streak >= 365),

        # Survival
        ("survival_king", longest_survival >= 100),
        ("death_defier", longest_survival >= 1000),
        ("untouched_by_fate", longest_survival >= 5000),
        ("mythic_survivor", longest_survival >= 10000),

        # Level
        ("scholar_prime", level >= 50),
        ("grandmaster", level >= 100),
        ("transcendent", level >= 200),

        # Leaderboard
        ("quiz_gladiator", rank <= 10 and (user.xp or 0) > 0),
        ("global_champion", rank == 1 and (user.xp or 0) > 0),
    ]

    for key, qualified in qualifications:
        if qualified and key not in earned_keys:
            db.add(UserTitle(user_id=user.id, title_key=key))
            newly_earned.append(key)

    if newly_earned:
        db.commit()

    return newly_earned


# ─── Public endpoints ─────────────────────────────────────────────────────────


@router.get("/titles")
async def list_my_titles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all titles the current user has earned + the full catalog with locked status."""
    seed_titles(db)
    # Auto-check on access so users see new titles immediately
    check_and_award_titles(db, current_user)

    earned = db.query(UserTitle).filter(UserTitle.user_id == current_user.id).all()
    earned_keys = {ut.title_key for ut in earned}

    all_titles = db.query(Title).all()
    titles = []
    for t in all_titles:
        titles.append({
            "key": t.key,
            "name": t.name,
            "description": t.description,
            "rarity": t.rarity,
            "earned": t.key in earned_keys,
            "equipped": current_user.equipped_title_key == t.key,
        })

    # Sort: equipped first, then earned, then locked
    rarity_order = {"common": 0, "rare": 1, "epic": 2, "legendary": 3, "mythic": 4}
    titles.sort(key=lambda x: (
        not x["equipped"],
        not x["earned"],
        -rarity_order.get(x["rarity"], 0),
    ))

    return {
        "titles": titles,
        "earned_count": len(earned_keys),
        "total_count": len(all_titles),
        "equipped_title_key": current_user.equipped_title_key,
    }


class EquipTitleRequest(BaseModel):
    title_key: Optional[str]  # None to unequip


@router.post("/equip-title")
async def equip_title(
    req: EquipTitleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Equip a title the user has earned, or unequip with title_key=null."""
    if req.title_key is None:
        current_user.equipped_title_key = None
        db.commit()
        return {"ok": True, "equipped_title_key": None}

    # Verify they have the title
    has_title = db.query(UserTitle).filter(
        UserTitle.user_id == current_user.id,
        UserTitle.title_key == req.title_key,
    ).first()
    if not has_title:
        raise HTTPException(status_code=400, detail="You haven't earned this title yet")

    current_user.equipped_title_key = req.title_key
    db.commit()
    return {"ok": True, "equipped_title_key": req.title_key}


class UpdateMottoRequest(BaseModel):
    motto: Optional[str]  # None or empty to clear


@router.post("/motto")
async def update_motto(
    req: UpdateMottoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set or clear the user's profile motto."""
    motto = (req.motto or "").strip()
    if len(motto) > 80:
        raise HTTPException(status_code=400, detail="Motto must be 80 characters or fewer")
    current_user.motto = motto if motto else None
    db.commit()
    return {"ok": True, "motto": current_user.motto}


# ─── Public profile data builders (used by users_router) ─────────────────────


def get_user_aura_tier(level: int) -> str:
    """Map level to an aura tier name. Drives profile glow/border colour on the frontend."""
    if level >= 50: return "legendary"
    if level >= 25: return "diamond"
    if level >= 15: return "gold"
    if level >= 8: return "silver"
    return "bronze"


def get_badge_rarity_pct(db: Session, badge_key: str) -> float:
    """Return % of users who own a given badge (0-100)."""
    total_users = db.query(User).count() or 1
    owners = db.query(UserBadge).filter(UserBadge.badge_key == badge_key).count()
    return round((owners / total_users) * 100, 1)


def get_user_recent_activity(db: Session, user_id: str, limit: int = 10) -> list[dict]:
    """Build a recent activity feed for a user from quiz attempts, badges, and materials."""
    items = []

    attempts = (
        db.query(Attempt)
        .filter(Attempt.user_id == user_id, Attempt.completed_at.isnot(None))
        .order_by(desc(Attempt.completed_at))
        .limit(15)
        .all()
    )
    for a in attempts:
        quiz = db.query(Quiz).filter(Quiz.id == a.quiz_id).first()
        is_classroom = bool(quiz and quiz.config and quiz.config.get("classroom_quiz"))
        items.append({
            "type": "quiz_completed",
            "title": quiz.title if quiz else "a quiz",
            "score": a.score,
            "classroom_quiz": is_classroom,
            "at": a.completed_at.isoformat() if a.completed_at else None,
        })

    badges = (
        db.query(UserBadge)
        .filter(UserBadge.user_id == user_id)
        .order_by(desc(UserBadge.earned_at))
        .limit(8)
        .all()
    )
    for ub in badges:
        b = db.query(Badge).filter(Badge.key == ub.badge_key).first()
        items.append({
            "type": "badge_earned",
            "title": b.name if b else ub.badge_key,
            "rarity": b.rarity if b else "common",
            "at": ub.earned_at.isoformat() if ub.earned_at else None,
        })

    materials = (
        db.query(Material)
        .filter(Material.user_id == user_id)
        .order_by(desc(Material.created_at))
        .limit(5)
        .all()
    )
    for m in materials:
        items.append({
            "type": "material_uploaded",
            "title": m.title,
            "at": m.created_at.isoformat() if m.created_at else None,
        })

    items.sort(key=lambda x: x["at"] or "", reverse=True)
    return items[:limit]


def get_user_better_than(db: Session, user: User) -> int:
    """Return the percentile of users this user beats by XP. 0..99."""
    total = db.query(User).count() or 1
    if total <= 1:
        return 0
    fewer = db.query(User).filter(User.xp < user.xp).count()
    pct = int((fewer / (total - 1)) * 100)
    return max(0, min(99, pct))


def is_user_online(user_id: str) -> bool:
    """Check if the user has an active WebSocket connection."""
    return manager.is_online(user_id)


def get_user_presence(user: User) -> dict:
    """Compute presence state for a user: online | idle | offline.

    - online: heartbeat within last 60 seconds, or has active WS connection
    - idle: heartbeat between 60 seconds and 4 minutes ago
    - offline: no heartbeat for 4+ minutes (or never)
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    if not user.last_active_at:
        return {"status": "offline", "last_active_at": None, "seconds_ago": None}

    delta = (now - user.last_active_at).total_seconds()

    # WS connection always means online
    if manager.is_online(user.id):
        return {"status": "online", "last_active_at": user.last_active_at.isoformat(), "seconds_ago": int(delta)}

    if delta < 60:
        status = "online"
    elif delta < 240:
        status = "idle"
    else:
        status = "offline"

    return {
        "status": status,
        "last_active_at": user.last_active_at.isoformat(),
        "seconds_ago": int(delta),
    }



# ─── Username editing ─────────────────────────────────────────────────────────


import re as _re

USERNAME_PATTERN = _re.compile(r"^[a-zA-Z0-9._\-!?]+$")


class UpdateUsernameRequest(BaseModel):
    username: str


@router.post("/username")
async def update_username(
    req: UpdateUsernameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the user's @username. Allowed: letters, numbers, . _ - ! ?"""
    candidate = (req.username or "").strip().lstrip("@")

    # Validation
    if len(candidate) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(candidate) > 24:
        raise HTTPException(status_code=400, detail="Username must be 24 characters or fewer")
    if not USERNAME_PATTERN.match(candidate):
        raise HTTPException(
            status_code=400,
            detail="Only letters, numbers, and . _ - ! ? are allowed",
        )

    # Reserved patterns — normalize by stripping non-alphanumeric chars before
    # checking, so "admin!" or "support?" can't slip past.
    normalized = _re.sub(r"[^a-z0-9]", "", candidate.lower())
    if normalized in {"admin", "moderator", "kino", "system", "support", "official",
                       "root", "api", "auth", "login", "logout", "help"}:
        raise HTTPException(status_code=400, detail="That username is reserved")

    # Uniqueness (case-insensitive)
    existing = (
        db.query(User)
        .filter(func.lower(User.username) == candidate.lower(), User.id != current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Username is already taken")

    current_user.username = candidate
    db.commit()
    db.refresh(current_user)

    return {"ok": True, "username": current_user.username}
