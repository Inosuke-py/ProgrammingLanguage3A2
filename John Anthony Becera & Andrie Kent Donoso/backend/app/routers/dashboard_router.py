"""Dashboard data aggregation endpoint — Full implementation."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case

from app.database import get_db
from app.models import (
    User, Material, Attempt, Answer, Question, Quiz, QuestionPool,
    UserBadge,
)
from app.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def xp_needed_for_level(level: int) -> int:
    """XP threshold to advance from current level."""
    return level * 100


@router.get("/")
async def get_dashboard_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Aggregate all dashboard data in a single call:
    - User stats (with XP progress)
    - Continue learning
    - Daily goal progress
    - Weak topics
    - Recent activity
    - Materials with mastery
    - AI recommendations
    - Achievements summary
    - Study stats
    """

    # === Continue Learning ===
    last_attempt = (
        db.query(Attempt)
        .filter(Attempt.user_id == current_user.id, Attempt.completed_at.isnot(None))
        .order_by(desc(Attempt.completed_at))
        .first()
    )

    continue_learning = None
    if last_attempt:
        quiz = db.query(Quiz).filter(Quiz.id == last_attempt.quiz_id).first()
        if quiz:
            material = db.query(Material).filter(Material.id == quiz.material_id).first()
            if material:
                material_quizzes = db.query(Quiz).filter(Quiz.material_id == material.id).all()
                quiz_ids = [q.id for q in material_quizzes]
                material_attempts = (
                    db.query(Attempt)
                    .filter(Attempt.user_id == current_user.id, Attempt.quiz_id.in_(quiz_ids), Attempt.completed_at.isnot(None))
                    .all()
                ) if quiz_ids else []

                avg_score = 0
                if material_attempts:
                    scores = [a.score for a in material_attempts if a.score is not None]
                    avg_score = sum(scores) / len(scores) if scores else 0

                continue_learning = {
                    "material_id": material.id,
                    "material_title": material.title,
                    "mastery": round(avg_score, 1),
                    "last_studied": last_attempt.completed_at.isoformat() if last_attempt.completed_at else None,
                    "last_score": round(last_attempt.score, 1) if last_attempt.score is not None else None,
                }

    # === Daily Goal ===
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_answers = (
        db.query(func.count(Answer.id))
        .join(Attempt)
        .filter(Attempt.user_id == current_user.id, Answer.created_at >= today_start)
        .scalar()
    ) or 0

    daily_target = 10
    daily_goal = {
        "questions_today": today_answers,
        "target": daily_target,
        "xp_remaining": max(0, (daily_target - today_answers)) * 10,
        "completed": today_answers >= daily_target,
    }

    # === Weak Topics ===
    wrong_answers = (
        db.query(Question.source_text, func.count(Answer.id).label("miss_count"))
        .join(Answer, Answer.question_id == Question.id)
        .join(Attempt, Attempt.id == Answer.attempt_id)
        .filter(Attempt.user_id == current_user.id, Answer.is_correct == False)
        .group_by(Question.source_text)
        .order_by(desc("miss_count"))
        .limit(8)
        .all()
    )

    weak_topics = []
    for source_text, miss_count in wrong_answers:
        if source_text:
            topic = source_text[:80]
            weak_topics.append({
                "topic": topic,
                "miss_count": miss_count,
            })

    # === Recent Activity ===
    recent_attempts = (
        db.query(Attempt)
        .filter(Attempt.user_id == current_user.id, Attempt.completed_at.isnot(None))
        .order_by(desc(Attempt.completed_at))
        .limit(8)
        .all()
    )

    activity = []
    for attempt in recent_attempts:
        quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
        material = db.query(Material).filter(Material.id == quiz.material_id).first() if quiz else None
        activity.append({
            "type": "quiz_completed",
            "score": round(attempt.score, 1) if attempt.score is not None else 0,
            "correct_count": attempt.correct_count or 0,
            "total_questions": attempt.total_questions,
            "material_title": material.title if material else "Unknown",
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        })

    # === Material Mastery ===
    materials = (
        db.query(Material)
        .filter(Material.user_id == current_user.id)
        .order_by(desc(Material.created_at))
        .all()
    )

    materials_with_mastery = []
    for mat in materials:
        mat_quizzes = db.query(Quiz).filter(Quiz.material_id == mat.id).all()
        quiz_ids = [q.id for q in mat_quizzes]

        mat_attempts = []
        if quiz_ids:
            mat_attempts = (
                db.query(Attempt)
                .filter(Attempt.user_id == current_user.id, Attempt.quiz_id.in_(quiz_ids), Attempt.completed_at.isnot(None))
                .all()
            )

        avg_score = 0
        if mat_attempts:
            scores = [a.score for a in mat_attempts if a.score is not None]
            avg_score = round(sum(scores) / len(scores), 1) if scores else 0

        pool_count = db.query(QuestionPool).filter(QuestionPool.material_id == mat.id).count()

        # Find weak sections for this material
        mat_weak = []
        if quiz_ids:
            mat_wrong = (
                db.query(Question.source_text, func.count(Answer.id))
                .join(Answer, Answer.question_id == Question.id)
                .join(Attempt, Attempt.id == Answer.attempt_id)
                .filter(
                    Attempt.user_id == current_user.id,
                    Answer.is_correct == False,
                    Question.quiz_id.in_(quiz_ids),
                )
                .group_by(Question.source_text)
                .order_by(desc(func.count(Answer.id)))
                .limit(3)
                .all()
            )
            mat_weak = [src[:60] for src, cnt in mat_wrong if src]

        last_attempt_time = None
        if mat_attempts:
            last_a = max(mat_attempts, key=lambda a: a.completed_at or datetime.min.replace(tzinfo=timezone.utc))
            last_attempt_time = last_a.completed_at.isoformat() if last_a.completed_at else None

        materials_with_mastery.append({
            "id": mat.id,
            "title": mat.title,
            "file_type": mat.file_type,
            "page_count": mat.page_count,
            "section_count": len(mat.sections),
            "pool_count": pool_count,
            "mastery": avg_score,
            "attempt_count": len(mat_attempts),
            "last_studied": last_attempt_time,
            "weak_areas": mat_weak,
            "created_at": mat.created_at.isoformat(),
        })

    # === XP Progress ===
    xp_for_next = xp_needed_for_level(current_user.level)
    xp_progress = round((current_user.xp / xp_for_next) * 100, 1) if xp_for_next > 0 else 100

    # === Study Stats ===
    total_attempts = (
        db.query(func.count(Attempt.id))
        .filter(Attempt.user_id == current_user.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0

    total_correct = (
        db.query(func.count(Answer.id))
        .join(Attempt)
        .filter(Attempt.user_id == current_user.id, Answer.is_correct == True)
        .scalar()
    ) or 0

    total_answered = current_user.total_questions_answered or 0
    accuracy = round((total_correct / total_answered) * 100, 1) if total_answered > 0 else 0

    # === Recommendations ===
    recommendations = _generate_recommendations(
        db, current_user, weak_topics, materials_with_mastery, daily_goal, continue_learning
    )

    # === Badges ===
    user_badges = (
        db.query(UserBadge)
        .filter(UserBadge.user_id == current_user.id)
        .order_by(desc(UserBadge.earned_at))
        .limit(5)
        .all()
    )
    badges_list = []
    for ub in user_badges:
        badge = ub.badge  # uses the relationship
        if badge:
            badges_list.append({
                "name": badge.name,
                "description": badge.description,
                "icon": badge.icon,
                "rarity": badge.rarity or "common",
                "earned_at": ub.earned_at.isoformat() if ub.earned_at else None,
            })

    total_badge_count = db.query(UserBadge).filter(UserBadge.user_id == current_user.id).count()

    return {
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "picture": current_user.picture,
            "xp": current_user.xp,
            "xp_for_next_level": xp_for_next,
            "xp_progress": xp_progress,
            "level": current_user.level,
            "streak": current_user.streak,
            "longest_survival": current_user.longest_survival,
            "total_questions_answered": total_answered,
            "accuracy": accuracy,
            "total_quizzes": total_attempts,
            "pinned_badge_key": current_user.pinned_badge_key,
            "role": current_user.role or "user",
        },
        "continue_learning": continue_learning,
        "daily_goal": daily_goal,
        "weak_topics": weak_topics,
        "activity": activity,
        "materials": materials_with_mastery,
        "recommendations": recommendations,
        "badges": {
            "recent": badges_list,
            "total_count": total_badge_count,
        },
    }


def _generate_recommendations(
    db: Session,
    user: User,
    weak_topics: list,
    materials: list,
    daily_goal: dict,
    continue_learning: dict | None,
) -> list:
    """
    Generate smart study recommendations based on user data.
    No AI call needed — rule-based for instant response.
    """
    recs = []

    # 1. If daily goal not complete, suggest taking a quiz
    if not daily_goal["completed"]:
        remaining = daily_goal["target"] - daily_goal["questions_today"]
        recs.append({
            "type": "daily_goal",
            "title": f"Answer {remaining} more questions",
            "description": f"Complete your daily goal to earn {daily_goal['xp_remaining']} XP",
            "action": "quiz",
            "priority": 1,
        })

    # 2. If there are weak topics, recommend retrying them
    if weak_topics:
        top_weak = weak_topics[0]
        recs.append({
            "type": "weak_topic",
            "title": "Review weak areas",
            "description": f"You've missed questions about: {top_weak['topic'][:50]}",
            "action": "focus_weak",
            "priority": 2,
        })

    # 3. If a material has low mastery, suggest studying it
    low_mastery = [m for m in materials if m["mastery"] < 50 and m["attempt_count"] > 0]
    if low_mastery:
        mat = low_mastery[0]
        recs.append({
            "type": "low_mastery",
            "title": f"Improve mastery on {mat['title'][:40]}",
            "description": f"Currently at {mat['mastery']}% — take a focused quiz",
            "action": "quiz",
            "action_data": {"material_id": mat["id"]},
            "priority": 3,
        })

    # 4. If there's a material never studied, suggest starting it
    unstudied = [m for m in materials if m["attempt_count"] == 0 and m["pool_count"] > 0]
    if unstudied:
        mat = unstudied[0]
        recs.append({
            "type": "new_material",
            "title": f"Start studying {mat['title'][:40]}",
            "description": f"{mat['pool_count']} questions ready to test your knowledge",
            "action": "quiz",
            "action_data": {"material_id": mat["id"]},
            "priority": 4,
        })

    # 5. Suggest trying different quiz modes
    if user.total_questions_answered > 20:
        recs.append({
            "type": "try_mode",
            "title": "Try Survival Mode",
            "description": "How many questions can you get right in a row?",
            "action": "survival",
            "priority": 5,
        })

    # 6. Continue where you left off
    if continue_learning and continue_learning["mastery"] < 90:
        recs.append({
            "type": "continue",
            "title": f"Continue {continue_learning['material_title'][:40]}",
            "description": f"{continue_learning['mastery']}% mastered — keep going!",
            "action": "continue",
            "action_data": {"material_id": continue_learning["material_id"]},
            "priority": 0,
        })

    # Sort by priority (lower = more important)
    recs.sort(key=lambda r: r.get("priority", 99))

    return recs[:5]
