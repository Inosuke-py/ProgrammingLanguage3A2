"""
Admin Panel Router.
Provides dashboard stats, question review queue, and platform configuration.
Only accessible to users with role="admin".
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import (
    User, Material, Quiz, Attempt, Answer, QuestionPool,
    UserBadge, Section, Question,
)
from app.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(user: User):
    if user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Admin access required")


# ─── Dashboard Stats ───────────────────────────────────────────────────────────

@router.get("/dashboard")
async def admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin dashboard with platform-wide stats."""
    require_admin(current_user)

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_materials = db.query(func.count(Material.id)).scalar() or 0
    total_quizzes_taken = (
        db.query(func.count(Attempt.id))
        .filter(Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0
    total_questions_generated = db.query(func.count(QuestionPool.id)).scalar() or 0

    # Active users (last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    active_users_week = (
        db.query(func.count(func.distinct(Attempt.user_id)))
        .filter(Attempt.started_at >= week_ago)
        .scalar()
    ) or 0

    # Today's stats
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    quizzes_today = (
        db.query(func.count(Attempt.id))
        .filter(Attempt.completed_at >= today_start)
        .scalar()
    ) or 0
    questions_answered_today = (
        db.query(func.count(Answer.id))
        .filter(Answer.created_at >= today_start)
        .scalar()
    ) or 0

    # Pool health: materials below cap
    pool_health = []
    public_materials = db.query(Material).filter(Material.is_public == True).all()
    for mat in public_materials:
        pool_count = db.query(func.count(QuestionPool.id)).filter(
            QuestionPool.material_id == mat.id
        ).scalar() or 0
        pool_health.append({
            "id": mat.id,
            "title": mat.title,
            "pool_count": pool_count,
            "pool_cap": 150,
            "is_healthy": pool_count >= 100,
        })

    # Recent signups
    recent_users = (
        db.query(User)
        .order_by(desc(User.created_at))
        .limit(5)
        .all()
    )

    return {
        "stats": {
            "total_users": total_users,
            "total_materials": total_materials,
            "total_quizzes_taken": total_quizzes_taken,
            "total_questions_generated": total_questions_generated,
            "active_users_week": active_users_week,
            "quizzes_today": quizzes_today,
            "questions_answered_today": questions_answered_today,
        },
        "pool_health": pool_health,
        "recent_users": [
            {"id": u.id, "name": u.name, "email": u.email, "picture": u.picture, "created_at": u.created_at.isoformat() if u.created_at else None}
            for u in recent_users
        ],
    }


# ─── Question Review Queue ─────────────────────────────────────────────────────

@router.get("/questions")
async def get_question_queue(
    material_id: Optional[str] = None,
    difficulty: Optional[str] = None,
    flagged_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get questions for review. Newest first. Filter by flagged for moderation."""
    require_admin(current_user)

    query = db.query(QuestionPool)
    if material_id:
        query = query.filter(QuestionPool.material_id == material_id)
    if difficulty:
        query = query.filter(QuestionPool.difficulty == difficulty)
    if flagged_only:
        query = query.filter(QuestionPool.flagged == True)

    total = query.count()
    flagged_count = db.query(func.count(QuestionPool.id)).filter(QuestionPool.flagged == True).scalar() or 0
    questions = query.order_by(desc(QuestionPool.created_at)).offset(offset).limit(limit).all()

    result = []
    for q in questions:
        material = db.query(Material).filter(Material.id == q.material_id).first()
        result.append({
            "id": q.id,
            "material_id": q.material_id,
            "material_title": material.title if material else "Unknown",
            "type": q.type,
            "difficulty": q.difficulty,
            "content": q.content,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
            "source_text": q.source_text,
            "times_used": q.times_used,
            "quality_score": q.quality_score,
            "flagged": q.flagged,
            "created_at": q.created_at.isoformat() if q.created_at else None,
        })

    return {"questions": result, "total": total, "flagged_count": flagged_count}


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a question from the pool."""
    require_admin(current_user)

    question = db.query(QuestionPool).filter(QuestionPool.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    db.delete(question)
    db.commit()
    return {"ok": True}


class UpdateQuestionRequest(BaseModel):
    content: Optional[str] = None
    options: Optional[list] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    difficulty: Optional[str] = None
    type: Optional[str] = None


@router.put("/questions/{question_id}")
async def update_question(
    question_id: str,
    req: UpdateQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a question in the pool."""
    require_admin(current_user)

    question = db.query(QuestionPool).filter(QuestionPool.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if req.content is not None:
        question.content = req.content
    if req.options is not None:
        question.options = req.options
    if req.correct_answer is not None:
        if req.correct_answer not in (req.options or question.options):
            raise HTTPException(status_code=400, detail="correct_answer must match one of the options")
        question.correct_answer = req.correct_answer
    if req.explanation is not None:
        question.explanation = req.explanation
    if req.difficulty is not None:
        if req.difficulty not in ("easy", "medium", "hard"):
            raise HTTPException(status_code=400, detail="Invalid difficulty")
        question.difficulty = req.difficulty
    if req.type is not None:
        if req.type not in ("mcq", "true_false", "fill_blank", "matching", "ordering"):
            raise HTTPException(status_code=400, detail="Invalid type")
        question.type = req.type

    db.commit()
    return {"ok": True}


# ─── XP/Reward Configuration ──────────────────────────────────────────────────

# In-memory config (persists until server restart; could be moved to DB later)
_xp_config = {
    "easy": {"per_correct": 10, "perfect_bonus": 50},
    "medium": {"per_correct": 15, "perfect_bonus": 100},
    "hard": {"per_correct": 25, "perfect_bonus": 200},
}


def get_xp_config() -> dict:
    """Get current XP reward config (used by challenges router)."""
    return _xp_config.copy()


@router.get("/xp-config")
async def get_xp_rewards(
    current_user: User = Depends(get_current_user),
):
    """Get current XP reward configuration."""
    require_admin(current_user)
    return _xp_config


class XPConfigUpdate(BaseModel):
    easy_per_correct: Optional[int] = None
    easy_perfect_bonus: Optional[int] = None
    medium_per_correct: Optional[int] = None
    medium_perfect_bonus: Optional[int] = None
    hard_per_correct: Optional[int] = None
    hard_perfect_bonus: Optional[int] = None


@router.put("/xp-config")
async def update_xp_rewards(
    req: XPConfigUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update XP reward configuration."""
    require_admin(current_user)

    if req.easy_per_correct is not None:
        _xp_config["easy"]["per_correct"] = req.easy_per_correct
    if req.easy_perfect_bonus is not None:
        _xp_config["easy"]["perfect_bonus"] = req.easy_perfect_bonus
    if req.medium_per_correct is not None:
        _xp_config["medium"]["per_correct"] = req.medium_per_correct
    if req.medium_perfect_bonus is not None:
        _xp_config["medium"]["perfect_bonus"] = req.medium_perfect_bonus
    if req.hard_per_correct is not None:
        _xp_config["hard"]["per_correct"] = req.hard_per_correct
    if req.hard_perfect_bonus is not None:
        _xp_config["hard"]["perfect_bonus"] = req.hard_perfect_bonus

    return _xp_config


# ─── User Management ───────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all users with stats."""
    require_admin(current_user)

    total = db.query(func.count(User.id)).scalar() or 0
    users = db.query(User).order_by(desc(User.created_at)).offset(offset).limit(limit).all()

    result = []
    for u in users:
        quiz_count = (
            db.query(func.count(Attempt.id))
            .filter(Attempt.user_id == u.id, Attempt.completed_at.isnot(None))
            .scalar()
        ) or 0
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "picture": u.picture,
            "role": u.role,
            "xp": u.xp,
            "level": u.level,
            "streak": u.streak,
            "total_questions_answered": u.total_questions_answered,
            "quiz_count": quiz_count,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return {"users": result, "total": total}


class UpdateUserRoleRequest(BaseModel):
    role: str  # "user" or "admin"


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    req: UpdateUserRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a user's role."""
    require_admin(current_user)

    if req.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = req.role
    db.commit()
    return {"ok": True, "user_id": user_id, "new_role": req.role}


# ─── Challenge Management ──────────────────────────────────────────────────────

@router.get("/challenges")
async def list_challenges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all challenge materials with pool stats per difficulty."""
    require_admin(current_user)

    challenges = (
        db.query(Material)
        .filter(Material.challenge_category.isnot(None))
        .order_by(desc(Material.created_at))
        .all()
    )

    result = []
    for mat in challenges:
        # Pool stats per difficulty
        pool_easy = db.query(func.count(QuestionPool.id)).filter(
            QuestionPool.material_id == mat.id, QuestionPool.difficulty == "easy"
        ).scalar() or 0
        pool_medium = db.query(func.count(QuestionPool.id)).filter(
            QuestionPool.material_id == mat.id, QuestionPool.difficulty == "medium"
        ).scalar() or 0
        pool_hard = db.query(func.count(QuestionPool.id)).filter(
            QuestionPool.material_id == mat.id, QuestionPool.difficulty == "hard"
        ).scalar() or 0
        pool_total = pool_easy + pool_medium + pool_hard

        result.append({
            "id": mat.id,
            "title": mat.title,
            "description": mat.description,
            "challenge_category": mat.challenge_category,
            "is_featured": mat.is_featured,
            "is_public": mat.is_public,
            "scheduled_at": mat.scheduled_at.isoformat() if mat.scheduled_at else None,
            "expires_at": mat.expires_at.isoformat() if mat.expires_at else None,
            "pool_stats": {
                "total": pool_total,
                "easy": pool_easy,
                "medium": pool_medium,
                "hard": pool_hard,
            },
            "created_at": mat.created_at.isoformat() if mat.created_at else None,
        })

    return {"challenges": result, "total": len(result)}


class UpdateChallengeRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    challenge_category: Optional[str] = None
    is_featured: Optional[bool] = None
    scheduled_at: Optional[str] = None  # ISO datetime string or null
    expires_at: Optional[str] = None  # ISO datetime string or null


@router.put("/challenges/{challenge_id}")
async def update_challenge(
    challenge_id: str,
    req: UpdateChallengeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update challenge fields (title, description, category, featured, schedule)."""
    require_admin(current_user)

    material = db.query(Material).filter(Material.id == challenge_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if material.challenge_category is None:
        raise HTTPException(status_code=400, detail="Material is not a challenge")

    valid_categories = ("standard", "survival", "timed", "accuracy", "boss")

    if req.title is not None:
        material.title = req.title
    if req.description is not None:
        material.description = req.description
    if req.challenge_category is not None:
        if req.challenge_category not in valid_categories:
            raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}")
        material.challenge_category = req.challenge_category
    if req.is_featured is not None:
        material.is_featured = req.is_featured
    if req.scheduled_at is not None:
        try:
            material.scheduled_at = datetime.fromisoformat(req.scheduled_at) if req.scheduled_at else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scheduled_at datetime format")
    elif req.scheduled_at is None and "scheduled_at" in (req.model_fields_set or set()):
        material.scheduled_at = None
    if req.expires_at is not None:
        try:
            material.expires_at = datetime.fromisoformat(req.expires_at) if req.expires_at else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at datetime format")
    elif req.expires_at is None and "expires_at" in (req.model_fields_set or set()):
        material.expires_at = None

    db.commit()
    return {"ok": True, "id": challenge_id}


# ─── Pool Worker Status ────────────────────────────────────────────────────────

@router.get("/pool-status")
async def get_pool_worker_status(
    current_user: User = Depends(get_current_user),
):
    """Get the current pool worker queue status."""
    require_admin(current_user)

    from app.services.pool_worker import get_queue_status
    return get_queue_status()


# ─── User Activity / Audit Log ─────────────────────────────────────────────────

@router.get("/users/{user_id}/activity")
async def get_user_activity(
    user_id: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a user's recent activity for admin audit."""
    require_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Recent quiz attempts
    attempts = (
        db.query(Attempt)
        .filter(Attempt.user_id == user_id, Attempt.completed_at.isnot(None))
        .order_by(desc(Attempt.completed_at))
        .limit(limit)
        .all()
    )

    activity = []
    for a in attempts:
        quiz = db.query(Quiz).filter(Quiz.id == a.quiz_id).first()
        material = db.query(Material).filter(Material.id == quiz.material_id).first() if quiz else None
        activity.append({
            "type": "quiz_completed",
            "attempt_id": a.id,
            "quiz_title": quiz.title if quiz else "Unknown",
            "material_title": material.title if material else "Unknown",
            "score": a.score,
            "correct_count": a.correct_count,
            "total_questions": a.total_questions,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        })

    # Recent materials uploaded
    materials = (
        db.query(Material)
        .filter(Material.user_id == user_id)
        .order_by(desc(Material.created_at))
        .limit(10)
        .all()
    )
    for m in materials:
        activity.append({
            "type": "material_uploaded",
            "material_id": m.id,
            "material_title": m.title,
            "file_type": m.file_type,
            "completed_at": m.created_at.isoformat() if m.created_at else None,
        })

    # Recent badges earned
    badges = (
        db.query(UserBadge)
        .filter(UserBadge.user_id == user_id)
        .order_by(desc(UserBadge.earned_at))
        .limit(10)
        .all()
    )
    for b in badges:
        activity.append({
            "type": "badge_earned",
            "badge_key": b.badge_key,
            "completed_at": b.earned_at.isoformat() if b.earned_at else None,
        })

    # Sort all by date
    activity.sort(key=lambda x: x.get("completed_at") or "", reverse=True)

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "picture": user.picture,
            "role": user.role,
            "xp": user.xp,
            "level": user.level,
            "streak": user.streak,
            "total_questions_answered": user.total_questions_answered,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_active_date": user.last_active_date.isoformat() if user.last_active_date else None,
        },
        "activity": activity[:limit],
    }


class ModerateUserRequest(BaseModel):
    action: str  # "reset_xp", "reset_streak", "ban", "unban", "promote", "demote", "warn", "make_mod"
    value: Optional[int] = None  # For XP penalty amount
    reason: Optional[str] = None  # For warnings


@router.post("/users/{user_id}/moderate")
async def moderate_user(
    user_id: str,
    req: ModerateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin moderation actions on a user."""
    require_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot moderate yourself")

    # Moderators can't promote/demote/ban admins
    if current_user.role == "moderator" and user.role == "admin":
        raise HTTPException(status_code=403, detail="Moderators cannot moderate admins")

    if req.action == "reset_xp":
        user.xp = 0
        user.level = 1
    elif req.action == "reset_streak":
        user.streak = 0
    elif req.action == "xp_penalty":
        penalty = req.value or 100
        user.xp = max(0, user.xp - penalty)
    elif req.action == "promote":
        # Only admins can promote to admin
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can promote users")
        user.role = "admin"
    elif req.action == "make_mod":
        # Only admins can assign moderator role
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can assign moderator role")
        user.role = "moderator"
    elif req.action == "demote":
        # Only admins can demote
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can demote users")
        user.role = "user"
    elif req.action == "ban":
        user.role = "banned"
    elif req.action == "unban":
        if user.role == "banned":
            user.role = "user"
    elif req.action == "warn":
        # Send a warning notification to the user
        if not req.reason:
            raise HTTPException(status_code=400, detail="Warning requires a reason")
        from app.services.notify import notify_user
        await notify_user(
            db, user_id,
            type="warning",
            title="You have received a warning",
            body=req.reason,
            link=None,
            meta={"from": current_user.name, "reason": req.reason},
        )
        db.commit()
        return {"ok": True, "action": "warn", "user_id": user_id, "new_role": user.role, "new_xp": user.xp}
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}")

    db.commit()
    return {"ok": True, "action": req.action, "user_id": user_id, "new_role": user.role, "new_xp": user.xp}


# ─── Analytics ─────────────────────────────────────────────────────────────────


@router.get("/analytics")
async def get_analytics(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Platform analytics for admin dashboard charts.
    Returns time-series + aggregate breakdowns suitable for visualization.
    """
    require_admin(current_user)

    now = datetime.now(timezone.utc)
    days = max(7, min(days, 90))  # clamp 7..90
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Daily activity series ────────────────────────────────────────────────
    # Build the date scaffold so missing days show 0 instead of being skipped.
    scaffold = []
    for i in range(days):
        d = (start + timedelta(days=i)).date()
        scaffold.append(d.isoformat())

    # Daily quiz attempts
    quiz_rows = (
        db.query(
            func.date(Attempt.completed_at).label("d"),
            func.count(Attempt.id).label("n"),
        )
        .filter(Attempt.completed_at >= start, Attempt.completed_at.isnot(None))
        .group_by(func.date(Attempt.completed_at))
        .all()
    )
    quiz_by_day = {str(r.d): r.n for r in quiz_rows}

    # Daily signups
    signup_rows = (
        db.query(
            func.date(User.created_at).label("d"),
            func.count(User.id).label("n"),
        )
        .filter(User.created_at >= start)
        .group_by(func.date(User.created_at))
        .all()
    )
    signup_by_day = {str(r.d): r.n for r in signup_rows}

    # Daily questions answered (engagement)
    answer_rows = (
        db.query(
            func.date(Answer.created_at).label("d"),
            func.count(Answer.id).label("n"),
        )
        .filter(Answer.created_at >= start)
        .group_by(func.date(Answer.created_at))
        .all()
    )
    answer_by_day = {str(r.d): r.n for r in answer_rows}

    # Daily active users
    dau_rows = (
        db.query(
            func.date(Attempt.started_at).label("d"),
            func.count(func.distinct(Attempt.user_id)).label("n"),
        )
        .filter(Attempt.started_at >= start)
        .group_by(func.date(Attempt.started_at))
        .all()
    )
    dau_by_day = {str(r.d): r.n for r in dau_rows}

    daily = [
        {
            "date": d,
            "quizzes": int(quiz_by_day.get(d, 0)),
            "signups": int(signup_by_day.get(d, 0)),
            "answers": int(answer_by_day.get(d, 0)),
            "active_users": int(dau_by_day.get(d, 0)),
        }
        for d in scaffold
    ]

    # ── Score distribution (last 30 days completed attempts) ────────────────
    score_start = now - timedelta(days=30)
    score_attempts = (
        db.query(Attempt.score)
        .filter(
            Attempt.completed_at.isnot(None),
            Attempt.completed_at >= score_start,
            Attempt.score.isnot(None),
        )
        .all()
    )
    # Buckets: 0-19, 20-39, 40-59, 60-79, 80-100
    buckets = [0, 0, 0, 0, 0]
    for (s,) in score_attempts:
        if s is None:
            continue
        idx = min(int(s // 20), 4)
        buckets[idx] += 1
    score_distribution = [
        {"range": "0-19", "count": buckets[0]},
        {"range": "20-39", "count": buckets[1]},
        {"range": "40-59", "count": buckets[2]},
        {"range": "60-79", "count": buckets[3]},
        {"range": "80-100", "count": buckets[4]},
    ]

    # ── Question type & difficulty splits (whole pool) ──────────────────────
    type_rows = (
        db.query(QuestionPool.type, func.count(QuestionPool.id))
        .group_by(QuestionPool.type)
        .all()
    )
    diff_rows = (
        db.query(QuestionPool.difficulty, func.count(QuestionPool.id))
        .group_by(QuestionPool.difficulty)
        .all()
    )
    type_split = [{"label": t or "unknown", "count": int(n)} for t, n in type_rows]
    difficulty_split = [{"label": d or "unknown", "count": int(n)} for d, n in diff_rows]

    # ── Top materials by attempts (last 30 days) ────────────────────────────
    top_rows = (
        db.query(
            Material.id,
            Material.title,
            Material.challenge_category,
            func.count(Attempt.id).label("attempts"),
        )
        .join(Quiz, Quiz.material_id == Material.id)
        .join(Attempt, Attempt.quiz_id == Quiz.id)
        .filter(Attempt.completed_at >= score_start)
        .group_by(Material.id, Material.title, Material.challenge_category)
        .order_by(desc("attempts"))
        .limit(8)
        .all()
    )
    top_materials = [
        {
            "id": r.id,
            "title": r.title,
            "category": r.challenge_category,
            "attempts": int(r.attempts),
        }
        for r in top_rows
    ]

    # ── Hourly activity heatmap (last 7 days, 24 buckets) ───────────────────
    week_start = now - timedelta(days=7)
    hourly_rows = (
        db.query(
            func.extract("hour", Answer.created_at).label("h"),
            func.count(Answer.id).label("n"),
        )
        .filter(Answer.created_at >= week_start)
        .group_by(func.extract("hour", Answer.created_at))
        .all()
    )
    hourly_buckets = [0] * 24
    for r in hourly_rows:
        if r.h is None:
            continue
        h = int(r.h)
        if 0 <= h < 24:
            hourly_buckets[h] = int(r.n)
    hourly_activity = [{"hour": h, "count": hourly_buckets[h]} for h in range(24)]

    # ── Accuracy & summary metrics ──────────────────────────────────────────
    total_correct = (
        db.query(func.count(Answer.id))
        .filter(Answer.is_correct == True, Answer.created_at >= score_start)
        .scalar()
    ) or 0
    total_answers_30d = (
        db.query(func.count(Answer.id))
        .filter(Answer.created_at >= score_start)
        .scalar()
    ) or 0
    avg_accuracy = round((total_correct / total_answers_30d * 100), 1) if total_answers_30d else 0.0

    avg_score_30d = (
        db.query(func.avg(Attempt.score))
        .filter(Attempt.completed_at.isnot(None), Attempt.completed_at >= score_start)
        .scalar()
    )
    avg_score_30d = round(float(avg_score_30d), 1) if avg_score_30d else 0.0

    # Engagement: total quiz time estimate (based on time_taken)
    total_seconds = (
        db.query(func.sum(Answer.time_taken))
        .filter(Answer.created_at >= score_start, Answer.time_taken.isnot(None))
        .scalar()
    ) or 0.0
    total_study_minutes = round(float(total_seconds) / 60, 0)

    return {
        "range_days": days,
        "daily": daily,
        "score_distribution": score_distribution,
        "type_split": type_split,
        "difficulty_split": difficulty_split,
        "top_materials": top_materials,
        "hourly_activity": hourly_activity,
        "summary_30d": {
            "avg_score": avg_score_30d,
            "avg_accuracy": avg_accuracy,
            "total_answers": total_answers_30d,
            "total_study_minutes": int(total_study_minutes),
        },
    }
