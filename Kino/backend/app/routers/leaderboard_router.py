"""Leaderboard system with multiple ranking types."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models import User, Attempt, Answer, Classroom, ClassroomStudent
from app.auth import get_current_user

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _build_entry(user: User, rank: int, extra: dict | None = None) -> dict:
    """Build a leaderboard entry dict."""
    entry = {
        "rank": rank,
        "user_id": user.id,
        "username": user.username,
        "user_number": user.user_number,
        "name": user.name,
        "picture": user.picture,
        "xp": user.xp,
        "level": user.level,
        "streak": user.streak,
        "pinned_badge_key": user.pinned_badge_key,
    }
    if extra:
        entry.update(extra)
    return entry


@router.get("/global")
async def global_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top 50 users by total XP. Includes user's own position and closest rival."""
    users = db.query(User).order_by(User.xp.desc()).limit(50).all()

    entries = [_build_entry(u, idx + 1) for idx, u in enumerate(users)]

    # Find current user's rank if not in top 50
    user_rank = None
    rival = None
    for i, e in enumerate(entries):
        if e["user_id"] == current_user.id:
            user_rank = e["rank"]
            # Rival is the person one rank above
            if i > 0:
                rival = {
                    "name": entries[i - 1]["name"],
                    "xp_gap": entries[i - 1]["xp"] - e["xp"],
                }
            elif len(entries) > 1:
                # You're #1: show the person chasing you
                rival = {
                    "name": entries[1]["name"],
                    "xp_gap": e["xp"] - entries[1]["xp"],
                    "behind": True,
                }
            break

    if user_rank is None:
        # Count users with more XP to determine rank
        rank_count = db.query(func.count(User.id)).filter(User.xp > current_user.xp).scalar() or 0
        user_rank = rank_count + 1
        # Find the person just above
        above = db.query(User).filter(User.xp > current_user.xp).order_by(User.xp.asc()).first()
        if above:
            rival = {"name": above.name, "xp_gap": above.xp - current_user.xp}

    return {
        "entries": entries,
        "your_rank": user_rank,
        "your_xp": current_user.xp,
        "rival": rival,
    }


@router.get("/weekly")
async def weekly_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top 50 users by XP earned this week (based on answers created this week)."""
    week_start = datetime.now(timezone.utc) - timedelta(days=7)

    # Count correct answers per user this week as proxy for weekly XP
    weekly_stats = (
        db.query(
            Attempt.user_id,
            func.count(Answer.id).label("answers_this_week"),
        )
        .join(Answer, Answer.attempt_id == Attempt.id)
        .filter(Answer.created_at >= week_start)
        .group_by(Attempt.user_id)
        .order_by(desc("answers_this_week"))
        .limit(50)
        .all()
    )

    entries = []
    for rank, (user_id, answer_count) in enumerate(weekly_stats, 1):
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            entries.append(_build_entry(user, rank, {"weekly_answers": answer_count, "weekly_xp": answer_count * 10}))

    # Current user's weekly position
    my_weekly = (
        db.query(func.count(Answer.id))
        .join(Attempt)
        .filter(Attempt.user_id == current_user.id, Answer.created_at >= week_start)
        .scalar()
    ) or 0

    # Current user's weekly position and rival
    user_rank = None
    rival = None
    for i, e in enumerate(entries):
        if e["user_id"] == current_user.id:
            user_rank = e["rank"]
            if i > 0:
                rival = {"name": entries[i - 1]["name"], "xp_gap": (entries[i - 1].get("weekly_xp") or 0) - (e.get("weekly_xp") or 0)}
            elif len(entries) > 1:
                rival = {"name": entries[1]["name"], "xp_gap": (e.get("weekly_xp") or 0) - (entries[1].get("weekly_xp") or 0), "behind": True}
            break

    if user_rank is None:
        # Count how many have more weekly answers
        higher_count = sum(1 for _, ac in weekly_stats if ac > my_weekly)
        user_rank = higher_count + 1

    return {
        "entries": entries,
        "your_rank": user_rank,
        "rival": rival,
        "your_weekly_xp": my_weekly * 10,
        "your_weekly_answers": my_weekly,
    }


@router.get("/accuracy")
async def accuracy_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top 50 users by accuracy (min 20 questions answered)."""
    # Get users with their accuracy
    stats = (
        db.query(
            Attempt.user_id,
            func.sum(Attempt.correct_count).label("total_correct"),
            func.sum(Attempt.total_questions).label("total_questions"),
        )
        .filter(Attempt.completed_at.isnot(None))
        .group_by(Attempt.user_id)
        .having(func.sum(Attempt.total_questions) >= 20)
        .all()
    )

    # Calculate accuracy and sort
    user_accuracies = []
    for user_id, total_correct, total_questions in stats:
        if total_questions and total_questions > 0:
            accuracy = round((total_correct / total_questions) * 100, 1)
            user_accuracies.append((user_id, accuracy, total_questions))

    user_accuracies.sort(key=lambda x: x[1], reverse=True)

    entries = []
    for rank, (user_id, accuracy, total_q) in enumerate(user_accuracies[:50], 1):
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            entries.append(_build_entry(user, rank, {"accuracy": accuracy, "total_questions": total_q}))

    # Find current user's rank and rival
    user_rank = None
    rival = None
    for i, e in enumerate(entries):
        if e["user_id"] == current_user.id:
            user_rank = e["rank"]
            if i > 0:
                rival = {"name": entries[i - 1]["name"], "xp_gap": (entries[i - 1].get("accuracy") or 0) - (e.get("accuracy") or 0)}
            elif len(entries) > 1:
                rival = {"name": entries[1]["name"], "xp_gap": (e.get("accuracy") or 0) - (entries[1].get("accuracy") or 0), "behind": True}
            break

    return {"entries": entries, "your_rank": user_rank, "rival": rival}


@router.get("/survival")
async def survival_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top 50 users by longest survival streak."""
    users = (
        db.query(User)
        .filter(User.longest_survival > 0)
        .order_by(User.longest_survival.desc())
        .limit(50)
        .all()
    )

    entries = [
        _build_entry(u, idx + 1, {"longest_survival": u.longest_survival})
        for idx, u in enumerate(users)
    ]

    # Find current user's rank and rival
    user_rank = None
    rival = None
    for i, e in enumerate(entries):
        if e["user_id"] == current_user.id:
            user_rank = e["rank"]
            if i > 0:
                rival = {"name": entries[i - 1]["name"], "xp_gap": (entries[i - 1].get("longest_survival") or 0) - (e.get("longest_survival") or 0)}
            elif len(entries) > 1:
                rival = {"name": entries[1]["name"], "xp_gap": (e.get("longest_survival") or 0) - (entries[1].get("longest_survival") or 0), "behind": True}
            break

    return {"entries": entries, "your_rank": user_rank, "rival": rival}


@router.get("/classroom/{classroom_id}")
async def classroom_leaderboard(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Leaderboard within a classroom."""
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    is_teacher = classroom.teacher_id == current_user.id
    is_student = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id,
        ClassroomStudent.student_id == current_user.id,
    ).first()

    if not is_teacher and not is_student:
        raise HTTPException(status_code=403, detail="Not a member of this classroom")

    student_entries = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id
    ).all()
    student_ids = [s.student_id for s in student_entries]

    if not student_ids:
        return {"entries": []}

    students = db.query(User).filter(
        User.id.in_(student_ids)
    ).order_by(User.xp.desc()).all()

    return {
        "entries": [_build_entry(u, idx + 1) for idx, u in enumerate(students)]
    }
