"""
Public Challenges (Admin Materials) Router.

Admin users can upload materials and make them public.
Public materials have pre-configured difficulty tiers:
  - Easy: MCQ + True/False, no time pressure
  - Medium: MCQ + Fill in the Blank + Matching, 30s per question
  - Hard: MCQ + Fill in the Blank + Matching + Ordering, 15s per question

Each public material has its own leaderboard.
"""

import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, cast, String
from pydantic import BaseModel
from typing import Optional

from app.config import get_settings
from app.database import get_db
from app.models import User, Material, Section, Quiz, Question, Attempt, Answer, QuestionPool, AdaptiveSession, SurvivalAttempt
from app.auth import get_current_user
from app.services.pdf_parser import parse_pdf
from app.services.pptx_parser import parse_pptx
from app.services.docx_parser import parse_docx
from app.services.doc_converter import convert_to_pdf

router = APIRouter(prefix="/challenges", tags=["challenges"])
settings = get_settings()


# ─── Difficulty Tier Configs ───────────────────────────────────────────────────

DIFFICULTY_TIERS = {
    "easy": {
        "question_types": ["mcq", "true_false"],
        "time_pressure": False,
        "time_per_question": None,
    },
    "medium": {
        "question_types": ["mcq", "fill_blank", "matching"],
        "time_pressure": True,
        "time_per_question": 30,
    },
    "hard": {
        "question_types": ["mcq", "fill_blank", "matching", "ordering"],
        "time_pressure": True,
        "time_per_question": 15,
    },
}


# ─── Helpers ───────────────────────────────────────────────────────────────────

def require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


# ─── Request Models ────────────────────────────────────────────────────────────

class PublishMaterialRequest(BaseModel):
    material_id: str
    description: Optional[str] = None
    category: Optional[str] = None  # "standard", "survival", "timed", "accuracy", "boss"


class UpdatePublicMaterialRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    category: Optional[str] = None
    is_featured: Optional[bool] = None


# ─── Admin Endpoints ───────────────────────────────────────────────────────────

@router.post("/admin/publish")
async def publish_material(
    req: PublishMaterialRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin publishes one of their materials as a public challenge."""
    require_admin(current_user)

    material = db.query(Material).filter(
        Material.id == req.material_id,
        Material.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Check pool readiness
    pool_count = db.query(QuestionPool).filter(QuestionPool.material_id == material.id).count()
    if pool_count < 20:
        raise HTTPException(
            status_code=400,
            detail=f"Material needs at least 20 questions in pool before publishing. Currently: {pool_count}",
        )

    material.is_public = True
    if req.description:
        material.description = req.description
    if req.category:
        material.challenge_category = req.category

    db.commit()
    db.refresh(material)

    return {
        "id": material.id,
        "title": material.title,
        "description": material.description,
        "is_public": material.is_public,
        "pool_count": pool_count,
    }


@router.put("/admin/{material_id}")
async def update_public_material(
    material_id: str,
    req: UpdatePublicMaterialRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin updates a public material's details."""
    require_admin(current_user)

    material = db.query(Material).filter(
        Material.id == material_id,
        Material.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if req.title is not None:
        material.title = req.title
    if req.description is not None:
        material.description = req.description
    if req.is_public is not None:
        material.is_public = req.is_public
    if req.category is not None:
        material.challenge_category = req.category
    if req.is_featured is not None:
        material.is_featured = req.is_featured

    db.commit()
    db.refresh(material)

    return {
        "id": material.id,
        "title": material.title,
        "description": material.description,
        "is_public": material.is_public,
    }


@router.get("/admin/materials")
async def list_admin_materials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin sees all their materials with public status."""
    require_admin(current_user)

    materials = (
        db.query(Material)
        .filter(Material.user_id == current_user.id)
        .order_by(desc(Material.created_at))
        .all()
    )

    result = []
    for m in materials:
        pool_count = db.query(QuestionPool).filter(QuestionPool.material_id == m.id).count()
        result.append({
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "is_public": m.is_public,
            "page_count": m.page_count,
            "pool_count": pool_count,
            "created_at": m.created_at.isoformat(),
        })

    return result


# ─── XP Reward Config (by difficulty) ──────────────────────────────────────────

XP_REWARDS = {
    "easy": {"per_correct": 10, "perfect_bonus": 50},
    "medium": {"per_correct": 15, "perfect_bonus": 100},
    "hard": {"per_correct": 25, "perfect_bonus": 200},
}


# ─── Challenge Categories ──────────────────────────────────────────────────────

CHALLENGE_CATEGORIES = ["standard", "survival", "timed", "accuracy", "boss"]


# ─── Public Endpoints (all users) ─────────────────────────────────────────────

@router.get("/featured")
async def get_featured_challenge(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current featured challenge (admin-pinned or weekly rotation)."""
    # First check for admin-pinned featured
    featured = (
        db.query(Material)
        .filter(Material.is_public == True, Material.is_featured == True)
        .first()
    )

    # Fallback: weekly rotation based on current week number
    if not featured:
        public_materials = (
            db.query(Material)
            .filter(Material.is_public == True)
            .order_by(Material.created_at)
            .all()
        )
        if public_materials:
            from datetime import date
            week_number = date.today().isocalendar()[1]
            featured = public_materials[week_number % len(public_materials)]

    if not featured:
        return None

    # Build enriched response
    pool_stats = {}
    for diff in ["easy", "medium", "hard"]:
        count = db.query(QuestionPool).filter(
            QuestionPool.material_id == featured.id,
            QuestionPool.difficulty == diff,
        ).count()
        pool_stats[diff] = count

    total_attempts = (
        db.query(func.count(Attempt.id))
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(Quiz.material_id == featured.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0

    unique_players = (
        db.query(func.count(func.distinct(Attempt.user_id)))
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(Quiz.material_id == featured.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0

    # Completion rate for hard
    hard_attempts = (
        db.query(Attempt)
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(
            Quiz.material_id == featured.id,
            cast(Quiz.config["difficulty"], String) == "hard",
            Attempt.completed_at.isnot(None),
        )
        .all()
    )
    hard_completion_rate = None
    if hard_attempts:
        passed = sum(1 for a in hard_attempts if a.score and a.score >= 70)
        hard_completion_rate = round((passed / len(hard_attempts)) * 100, 1)

    uploader = db.query(User).filter(User.id == featured.user_id).first()

    return {
        "id": featured.id,
        "title": featured.title,
        "description": featured.description,
        "category": featured.challenge_category or "standard",
        "uploader": uploader.name if uploader else "Unknown",
        "pool_stats": pool_stats,
        "total_attempts": total_attempts,
        "unique_players": unique_players,
        "hard_completion_rate": hard_completion_rate,
        "xp_rewards": XP_REWARDS,
    }

@router.get("/stats")
async def get_personal_challenge_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's personal challenge statistics."""
    # All challenge attempts (quizzes with config.challenge = true)
    challenge_attempts = (
        db.query(Attempt)
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(
            Attempt.user_id == current_user.id,
            Attempt.completed_at.isnot(None),
            cast(Quiz.config["challenge"], String) == "true",
        )
        .all()
    )

    total_completed = len(challenge_attempts)
    total_attempts_count = (
        db.query(func.count(Attempt.id))
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(
            Attempt.user_id == current_user.id,
            cast(Quiz.config["challenge"], String) == "true",
        )
        .scalar()
    ) or 0

    best_score = 0.0
    hardest_cleared = None
    total_perfect = 0

    for attempt in challenge_attempts:
        if attempt.score and attempt.score > best_score:
            best_score = attempt.score

        if attempt.score == 100.0:
            total_perfect += 1

        # Determine difficulty from quiz config
        quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
        if quiz and quiz.config:
            diff = quiz.config.get("difficulty")
            if diff:
                diff_rank = {"easy": 1, "medium": 2, "hard": 3}
                current_rank = diff_rank.get(diff, 0)
                hardest_rank = diff_rank.get(hardest_cleared, 0)
                if current_rank > hardest_rank:
                    hardest_cleared = diff

    # Unique challenges completed (distinct material_ids)
    unique_challenges = set()
    for attempt in challenge_attempts:
        quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
        if quiz:
            unique_challenges.add(quiz.material_id)

    return {
        "challenges_completed": len(unique_challenges),
        "total_attempts": total_attempts_count,
        "best_score": round(best_score, 1),
        "hardest_cleared": hardest_cleared,
        "total_perfect": total_perfect,
    }


@router.get("/")
async def list_public_challenges(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all public challenge materials with enriched stats for the UI."""
    query = db.query(Material).filter(Material.is_public == True)

    # Filter by category if provided
    if category and category in CHALLENGE_CATEGORIES:
        query = query.filter(Material.challenge_category == category)

    materials = query.order_by(desc(Material.created_at)).all()

    result = []
    for m in materials:
        # Get pool stats per difficulty
        pool_stats = {}
        for diff in ["easy", "medium", "hard"]:
            count = db.query(QuestionPool).filter(
                QuestionPool.material_id == m.id,
                QuestionPool.difficulty == diff,
            ).count()
            pool_stats[diff] = count

        # Get total attempts on this challenge
        total_attempts = (
            db.query(func.count(Attempt.id))
            .join(Quiz, Quiz.id == Attempt.quiz_id)
            .filter(Quiz.material_id == m.id, Attempt.completed_at.isnot(None))
            .scalar()
        ) or 0

        # Unique players who attempted
        unique_players = (
            db.query(func.count(func.distinct(Attempt.user_id)))
            .join(Quiz, Quiz.id == Attempt.quiz_id)
            .filter(Quiz.material_id == m.id, Attempt.completed_at.isnot(None))
            .scalar()
        ) or 0

        # Completion stats per difficulty (% who scored >= 70%)
        completion_rates = {}
        avg_scores = {}
        for diff in ["easy", "medium", "hard"]:
            diff_attempts = (
                db.query(Attempt)
                .join(Quiz, Quiz.id == Attempt.quiz_id)
                .filter(
                    Quiz.material_id == m.id,
                    cast(Quiz.config["difficulty"], String) == diff,
                    Attempt.completed_at.isnot(None),
                )
                .all()
            )
            if diff_attempts:
                passed = sum(1 for a in diff_attempts if a.score and a.score >= 70)
                completion_rates[diff] = round((passed / len(diff_attempts)) * 100, 1)
                scores = [a.score for a in diff_attempts if a.score is not None]
                avg_scores[diff] = round(sum(scores) / len(scores), 1) if scores else 0
            else:
                completion_rates[diff] = None
                avg_scores[diff] = None

        # "Almost there" — user's last incomplete attempt on this challenge
        almost_there = None
        last_incomplete = (
            db.query(Attempt)
            .join(Quiz, Quiz.id == Attempt.quiz_id)
            .filter(
                Quiz.material_id == m.id,
                Attempt.user_id == current_user.id,
                Attempt.completed_at.is_(None),
            )
            .order_by(desc(Attempt.started_at))
            .first()
        )
        if last_incomplete:
            # Count how many answers the user gave
            answers_given = (
                db.query(func.count(Answer.id))
                .filter(Answer.attempt_id == last_incomplete.id)
                .scalar()
            ) or 0
            if answers_given > 0:
                almost_there = {
                    "questions_answered": answers_given,
                    "total_questions": last_incomplete.total_questions,
                }

        # Get the uploader's name
        uploader = db.query(User).filter(User.id == m.user_id).first()

        result.append({
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "category": m.challenge_category or "standard",
            "page_count": m.page_count,
            "uploader": uploader.name if uploader else "Unknown",
            "pool_stats": pool_stats,
            "total_attempts": total_attempts,
            "unique_players": unique_players,
            "completion_rates": completion_rates,
            "avg_scores": avg_scores,
            "xp_rewards": XP_REWARDS,
            "almost_there": almost_there,
            "created_at": m.created_at.isoformat(),
        })

    return result


@router.get("/{material_id}")
async def get_challenge_detail(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details of a public challenge including difficulty tiers and user's best scores."""
    material = db.query(Material).filter(
        Material.id == material_id,
        Material.is_public == True,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Challenge not found")

    uploader = db.query(User).filter(User.id == material.user_id).first()

    # Pool stats
    pool_stats = {}
    for diff in ["easy", "medium", "hard"]:
        count = db.query(QuestionPool).filter(
            QuestionPool.material_id == material.id,
            QuestionPool.difficulty == diff,
        ).count()
        pool_stats[diff] = count

    # User's best scores per difficulty
    user_scores = {}
    for diff in ["easy", "medium", "hard"]:
        best = (
            db.query(func.max(Attempt.score))
            .join(Quiz, Quiz.id == Attempt.quiz_id)
            .filter(
                Quiz.material_id == material.id,
                Attempt.user_id == current_user.id,
                Attempt.completed_at.isnot(None),
                cast(Quiz.config["difficulty"], String) == diff,
            )
            .scalar()
        )
        user_scores[diff] = round(best, 1) if best else None

    # Completion rates and avg scores per difficulty
    completion_rates = {}
    avg_scores = {}
    for diff in ["easy", "medium", "hard"]:
        diff_attempts = (
            db.query(Attempt)
            .join(Quiz, Quiz.id == Attempt.quiz_id)
            .filter(
                Quiz.material_id == material.id,
                cast(Quiz.config["difficulty"], String) == diff,
                Attempt.completed_at.isnot(None),
            )
            .all()
        )
        if diff_attempts:
            passed = sum(1 for a in diff_attempts if a.score and a.score >= 70)
            completion_rates[diff] = round((passed / len(diff_attempts)) * 100, 1)
            scores = [a.score for a in diff_attempts if a.score is not None]
            avg_scores[diff] = round(sum(scores) / len(scores), 1) if scores else 0
        else:
            completion_rates[diff] = None
            avg_scores[diff] = None

    # Total attempts and unique players
    total_attempts = (
        db.query(func.count(Attempt.id))
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(Quiz.material_id == material.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0

    unique_players = (
        db.query(func.count(func.distinct(Attempt.user_id)))
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(Quiz.material_id == material.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0

    return {
        "id": material.id,
        "title": material.title,
        "description": material.description,
        "category": material.challenge_category or "standard",
        "page_count": material.page_count,
        "uploader": uploader.name if uploader else "Unknown",
        "pool_stats": pool_stats,
        "user_scores": user_scores,
        "completion_rates": completion_rates,
        "avg_scores": avg_scores,
        "total_attempts": total_attempts,
        "unique_players": unique_players,
        "xp_rewards": XP_REWARDS,
        "tiers": DIFFICULTY_TIERS,
        "rival": _get_rival_for_challenge(db, current_user, material.id),
    }


def _get_rival_for_challenge(db: Session, current_user: User, material_id: str) -> dict | None:
    """Find the person just above the current user on this challenge's leaderboard."""
    # Get all completed challenge attempts for this material
    attempts = (
        db.query(Attempt)
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(
            Quiz.material_id == material_id,
            cast(Quiz.config["challenge"], String) == "true",
            Attempt.completed_at.isnot(None),
        )
        .all()
    )

    # Group by user, take best score
    user_best: dict = {}
    for attempt in attempts:
        uid = attempt.user_id
        if uid not in user_best or (attempt.score or 0) > (user_best[uid] or 0):
            user_best[uid] = attempt.score or 0

    if current_user.id not in user_best:
        return None

    my_score = user_best[current_user.id]

    # Find users with scores just above mine
    rivals = [(uid, score) for uid, score in user_best.items() if score > my_score and uid != current_user.id]
    if not rivals:
        return None

    # Closest rival (smallest gap)
    rivals.sort(key=lambda x: x[1])
    rival_id, rival_score = rivals[0]
    rival_user = db.query(User).filter(User.id == rival_id).first()
    if not rival_user:
        return None

    return {
        "name": rival_user.name,
        "picture": rival_user.picture,
        "score": round(rival_score, 1),
        "gap": round(rival_score - my_score, 1),
    }


@router.post("/{material_id}/start")
async def start_challenge_quiz(
    material_id: str,
    difficulty: str = "easy",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a challenge quiz at a specific difficulty tier."""
    if difficulty not in DIFFICULTY_TIERS:
        raise HTTPException(status_code=400, detail="Invalid difficulty. Use: easy, medium, hard")

    material = db.query(Material).filter(
        Material.id == material_id,
        Material.is_public == True,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Challenge not found")

    tier = DIFFICULTY_TIERS[difficulty]

    # Pull questions from pool matching this difficulty
    pool_questions = (
        db.query(QuestionPool)
        .filter(
            QuestionPool.material_id == material_id,
            QuestionPool.difficulty == difficulty,
        )
        .order_by(QuestionPool.times_used, QuestionPool.created_at)
        .all()
    )

    # Filter by allowed types for this tier
    pool_questions = [q for q in pool_questions if q.type in tier["question_types"]]

    if len(pool_questions) < 5:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough {difficulty} questions available for this challenge yet.",
        )

    # Select 10 questions (or fewer if not enough)
    selected = pool_questions[:10]

    # Create quiz
    quiz = Quiz(
        material_id=material.id,
        user_id=current_user.id,
        title=f"Challenge: {material.title} ({difficulty.capitalize()})",
        question_count=len(selected),
        config={
            "difficulty": difficulty,
            "question_types": tier["question_types"],
            "time_pressure": tier["time_pressure"],
            "time_per_question": tier["time_per_question"],
            "mode": "standard",
            "challenge": True,
        },
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    # Create question records
    for i, pool_q in enumerate(selected):
        question = Question(
            quiz_id=quiz.id,
            section_id=pool_q.section_id,
            type=pool_q.type,
            content=pool_q.content,
            options=pool_q.options,
            correct_answer=pool_q.correct_answer,
            explanation=pool_q.explanation or "",
            source_text=pool_q.source_text or "",
            order_index=i,
        )
        db.add(question)
        pool_q.times_used += 1

    db.commit()

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "question_count": quiz.question_count,
        "difficulty": difficulty,
        "time_pressure": tier["time_pressure"],
        "time_per_question": tier["time_per_question"],
    }


@router.get("/{material_id}/leaderboard")
async def get_challenge_leaderboard(
    material_id: str,
    difficulty: str = "easy",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get leaderboard for a specific challenge and difficulty."""
    if difficulty not in DIFFICULTY_TIERS:
        raise HTTPException(status_code=400, detail="Invalid difficulty")

    material = db.query(Material).filter(
        Material.id == material_id,
        Material.is_public == True,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Challenge not found")

    # Get all completed attempts for this material + difficulty
    attempts = (
        db.query(Attempt)
        .join(Quiz, Quiz.id == Attempt.quiz_id)
        .filter(
            Quiz.material_id == material_id,
            cast(Quiz.config["difficulty"], String) == difficulty,
            Attempt.completed_at.isnot(None),
        )
        .all()
    )

    # Group by user, take best score
    user_best: dict = {}
    for attempt in attempts:
        uid = attempt.user_id
        if uid not in user_best or (attempt.score or 0) > (user_best[uid]["score"] or 0):
            user_best[uid] = {
                "user_id": uid,
                "score": attempt.score,
                "correct_count": attempt.correct_count,
                "total_questions": attempt.total_questions,
                "completed_at": attempt.completed_at,
            }

    # Build leaderboard
    leaderboard = []
    for uid, data in user_best.items():
        user = db.query(User).filter(User.id == uid).first()
        if user:
            leaderboard.append({
                "user_id": user.id,
                "name": user.name,
                "picture": user.picture,
                "score": round(data["score"], 1) if data["score"] else 0,
                "correct_count": data["correct_count"],
                "total_questions": data["total_questions"],
                "completed_at": data["completed_at"].isoformat() if data["completed_at"] else None,
            })

    # Sort by score descending
    leaderboard.sort(key=lambda x: x["score"], reverse=True)

    # Add ranks
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    return {
        "material_id": material_id,
        "material_title": material.title,
        "difficulty": difficulty,
        "leaderboard": leaderboard[:50],  # Top 50
    }



# ─── Survival Mode ────────────────────────────────────────────────────────────
# Survival is the fourth tier alongside Easy/Medium/Hard. Users get 3 hearts
# and answer endlessly until they run out. Capped at 3 attempts per UTC day,
# shared across ALL challenges so it stays special.

SURVIVAL_DAILY_LIMIT = 3


def _utc_today_start():
    """Return today's UTC midnight as an aware datetime."""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/survival/status")
async def get_survival_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """How many survival runs the current user has left today, plus reset time."""
    today_start = _utc_today_start()
    used = (
        db.query(func.count(SurvivalAttempt.id))
        .filter(
            SurvivalAttempt.user_id == current_user.id,
            SurvivalAttempt.started_at >= today_start,
        )
        .scalar()
    ) or 0

    # Reset is the next UTC midnight
    next_midnight = today_start + timedelta(days=1)

    return {
        "attempts_used": int(used),
        "attempts_remaining": max(0, SURVIVAL_DAILY_LIMIT - int(used)),
        "daily_limit": SURVIVAL_DAILY_LIMIT,
        "resets_at": next_midnight.isoformat(),
        "longest_survival": current_user.longest_survival or 0,
    }


@router.post("/{material_id}/start-survival")
async def start_survival_run(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a survival run for a public challenge.

    Rules:
    - 3 attempts per user per UTC day across all challenges
    - Each run = 3 hearts, lose one per wrong answer
    - Endless questions, mixed difficulty
    - Tracked in survival_attempts table
    """
    today_start = _utc_today_start()
    used_today = (
        db.query(func.count(SurvivalAttempt.id))
        .filter(
            SurvivalAttempt.user_id == current_user.id,
            SurvivalAttempt.started_at >= today_start,
        )
        .scalar()
    ) or 0

    if used_today >= SURVIVAL_DAILY_LIMIT:
        next_midnight = today_start + timedelta(days=1)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "survival_limit_reached",
                "message": (
                    f"You've used all {SURVIVAL_DAILY_LIMIT} survival runs today. "
                    "Come back tomorrow."
                ),
                "resets_at": next_midnight.isoformat(),
            },
        )

    # Material must be a public challenge
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.is_public == True)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Challenge not found")

    if not material.processed:
        raise HTTPException(
            status_code=400,
            detail="Challenge isn't ready yet. Try again in a moment.",
        )

    # Survival uses an ISOLATED, on-demand-generated question set so that
    # questions in standard mode never overlap with what users see in survival.
    # We generate ~15 fresh questions up front; replenishment happens during the run.
    from app.services.pool_worker import generate_survival_questions

    fresh = await generate_survival_questions(material_id, db, count=15)

    if len(fresh) < 5:
        raise HTTPException(
            status_code=503,
            detail=(
                "We couldn't generate enough survival questions right now. "
                "Please try again in a moment."
            ),
        )

    # Create the quiz (mode='survival' so /next-question handles it)
    quiz = Quiz(
        material_id=material.id,
        user_id=current_user.id,
        title=f"Survival: {material.title}",
        question_count=len(fresh),
        config={
            "difficulty": "mixed",
            "question_types": ["mcq", "true_false", "fill_blank"],
            "time_pressure": True,
            "time_per_question": 20,
            "mode": "survival",
            "challenge": True,
        },
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    # Create question records (these stay attached to this quiz only)
    for i, q in enumerate(fresh):
        question = Question(
            quiz_id=quiz.id,
            section_id=None,
            type=q["type"],
            content=q["content"],
            options=q["options"],
            correct_answer=q["correct_answer"],
            explanation=q.get("explanation", ""),
            source_text=q.get("source_text", ""),
            order_index=i,
        )
        db.add(question)

    # Create the AdaptiveSession (3 hearts)
    session = AdaptiveSession(
        quiz_id=quiz.id,
        user_id=current_user.id,
        current_index=0,
        consecutive_correct=0,
        consecutive_wrong=0,
        current_difficulty="medium",
        is_active=True,
        survival_count=0,
        hearts_remaining=3,
    )
    db.add(session)

    # Create the daily-limit row
    sa = SurvivalAttempt(
        user_id=current_user.id,
        material_id=material.id,
        quiz_id=quiz.id,
        difficulty="mixed",
        questions_survived=0,
        status="active",
    )
    db.add(sa)

    # Create the Attempt row (parent of all answers)
    attempt = Attempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        total_questions=0,  # unknown in survival, updated on game over
        correct_count=0,
    )
    db.add(attempt)

    db.commit()
    db.refresh(quiz)

    # Re-query the first question from our newly created Question rows
    first_question = (
        db.query(Question)
        .filter(Question.quiz_id == quiz.id)
        .order_by(Question.order_index)
        .first()
    )

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "hearts_remaining": 3,
        "survival_count": 0,
        "attempts_remaining_today": SURVIVAL_DAILY_LIMIT - used_today - 1,
        "first_question": {
            "id": first_question.id,
            "content": first_question.content,
            "options": first_question.options,
            "type": first_question.type,
            "order_index": first_question.order_index,
        } if first_question else None,
    }
