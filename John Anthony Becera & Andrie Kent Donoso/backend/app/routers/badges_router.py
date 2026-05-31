"""Badges & Achievements system with rarity, categories, and progress tracking."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Badge, UserBadge, Material, Attempt, Answer, QuestionPool, Quiz
from app.auth import get_current_user

router = APIRouter(prefix="/badges", tags=["badges"])

# ─── Badge Definitions ─────────────────────────────────────────────────────────
# category: study, accuracy, streaks, speed, survival, social, secret
# rarity: common, rare, epic, legendary, mythic

BADGE_DEFINITIONS = [
    # === STUDY MILESTONES ===
    # Onboarding + early engagement
    {"key": "first_upload", "name": "First Upload", "description": "Upload your first study material", "icon": "upload", "category": "study", "rarity": "common", "target_value": 1},
    {"key": "first_quiz", "name": "First Quiz", "description": "Complete your first quiz", "icon": "play", "category": "study", "rarity": "common", "target_value": 1},

    # Quiz count progression — denser ladder so there's always a next goal
    {"key": "ten_quizzes", "name": "Quiz Regular", "description": "Complete 10 quizzes", "icon": "repeat", "category": "study", "rarity": "common", "target_value": 10},
    {"key": "fifty_quizzes", "name": "Dedicated Learner", "description": "Complete 50 quizzes", "icon": "book", "category": "study", "rarity": "rare", "target_value": 50},
    {"key": "hundred_quizzes", "name": "Century Quizzer", "description": "Complete 100 quizzes", "icon": "book", "category": "study", "rarity": "rare", "target_value": 100},
    {"key": "two_fifty_quizzes", "name": "Quiz Veteran", "description": "Complete 250 quizzes", "icon": "book", "category": "study", "rarity": "epic", "target_value": 250},
    {"key": "five_hundred_quizzes", "name": "Quiz Devotee", "description": "Complete 500 quizzes", "icon": "library", "category": "study", "rarity": "legendary", "target_value": 500},
    {"key": "thousand_quizzes", "name": "Quiz Eternal", "description": "Complete 1,000 quizzes", "icon": "crown", "category": "study", "rarity": "mythic", "target_value": 1000},

    # Total questions answered — extended ladder
    {"key": "century", "name": "Century Club", "description": "Answer 100 questions total", "icon": "target", "category": "study", "rarity": "common", "target_value": 100},
    {"key": "five_hundred", "name": "Knowledge Machine", "description": "Answer 500 questions total", "icon": "brain", "category": "study", "rarity": "rare", "target_value": 500},
    {"key": "thousand", "name": "Grand Scholar", "description": "Answer 1,000 questions total", "icon": "brain", "category": "study", "rarity": "rare", "target_value": 1000},
    {"key": "answers_2500", "name": "Mind Marathoner", "description": "Answer 2,500 questions total", "icon": "brain", "category": "study", "rarity": "epic", "target_value": 2500},
    {"key": "answers_5000", "name": "Living Encyclopedia", "description": "Answer 5,000 questions total", "icon": "library", "category": "study", "rarity": "epic", "target_value": 5000},
    {"key": "answers_10000", "name": "Polymath", "description": "Answer 10,000 questions total", "icon": "crown", "category": "study", "rarity": "legendary", "target_value": 10000},
    {"key": "answers_25000", "name": "Sage", "description": "Answer 25,000 questions total", "icon": "crown", "category": "study", "rarity": "legendary", "target_value": 25000},
    {"key": "answers_50000", "name": "Omniscient", "description": "Answer 50,000 questions total", "icon": "crown", "category": "study", "rarity": "mythic", "target_value": 50000},

    # Material library
    {"key": "five_materials", "name": "Collector", "description": "Upload 5 study materials", "icon": "folder", "category": "study", "rarity": "common", "target_value": 5},
    {"key": "ten_materials", "name": "Library Builder", "description": "Upload 10 study materials", "icon": "library", "category": "study", "rarity": "rare", "target_value": 10},
    {"key": "twenty_five_materials", "name": "Curator", "description": "Upload 25 study materials", "icon": "library", "category": "study", "rarity": "epic", "target_value": 25},
    {"key": "fifty_materials", "name": "Archivist", "description": "Upload 50 study materials", "icon": "library", "category": "study", "rarity": "legendary", "target_value": 50},
    {"key": "hundred_materials", "name": "Living Library", "description": "Upload 100 study materials", "icon": "crown", "category": "study", "rarity": "mythic", "target_value": 100},

    # === ACCURACY ===
    {"key": "perfectionist", "name": "Perfectionist", "description": "Score 100% on a quiz", "icon": "check-circle", "category": "accuracy", "rarity": "common", "target_value": None},

    # Consecutive perfect quizzes — much steeper ladder
    {"key": "three_perfect", "name": "Flawless Streak", "description": "Score 100% on 3 quizzes in a row", "icon": "zap", "category": "accuracy", "rarity": "rare", "target_value": 3},
    {"key": "five_perfect", "name": "Five Flawless", "description": "Score 100% on 5 quizzes in a row", "icon": "zap", "category": "accuracy", "rarity": "epic", "target_value": 5},
    {"key": "ten_perfect", "name": "Pristine Mind", "description": "Score 100% on 10 quizzes in a row", "icon": "zap", "category": "accuracy", "rarity": "legendary", "target_value": 10},
    {"key": "twenty_five_perfect", "name": "Untainted", "description": "Score 100% on 25 quizzes in a row", "icon": "crown", "category": "accuracy", "rarity": "mythic", "target_value": 25},

    # Rolling-average accuracy — bumped requirements
    {"key": "accuracy_80", "name": "Sharp Mind", "description": "Maintain 85%+ accuracy across 30 quizzes", "icon": "crosshair", "category": "accuracy", "rarity": "rare", "target_value": 85},
    {"key": "accuracy_90", "name": "Precision Master", "description": "Maintain 90%+ accuracy across 75 quizzes", "icon": "crosshair", "category": "accuracy", "rarity": "epic", "target_value": 90},
    {"key": "accuracy_95", "name": "Surgical", "description": "Maintain 95%+ accuracy across 150 quizzes", "icon": "award", "category": "accuracy", "rarity": "legendary", "target_value": 95},
    {"key": "accuracy_98", "name": "Infallible", "description": "Maintain 98%+ accuracy across 250 quizzes", "icon": "crown", "category": "accuracy", "rarity": "mythic", "target_value": 98},

    # Mistake-free streaks (across attempts)
    {"key": "no_mistakes_20", "name": "Untouchable", "description": "Answer 20 questions correctly in a row without a single mistake", "icon": "shield", "category": "accuracy", "rarity": "rare", "target_value": 20},
    {"key": "no_mistakes_50", "name": "Sniper", "description": "Answer 50 questions correctly in a row without a single mistake", "icon": "shield", "category": "accuracy", "rarity": "epic", "target_value": 50},
    {"key": "no_mistakes_100", "name": "Untouchable Legend", "description": "Answer 100 questions correctly in a row without a single mistake", "icon": "crown", "category": "accuracy", "rarity": "legendary", "target_value": 100},

    # === STREAKS ===
    {"key": "streak_3", "name": "Getting Started", "description": "Maintain a 3-day streak", "icon": "flame", "category": "streaks", "rarity": "common", "target_value": 3},
    {"key": "streak_7", "name": "Week Warrior", "description": "Maintain a 7-day streak", "icon": "flame", "category": "streaks", "rarity": "common", "target_value": 7},
    {"key": "streak_14", "name": "Dedicated", "description": "Maintain a 14-day streak", "icon": "flame", "category": "streaks", "rarity": "rare", "target_value": 14},
    {"key": "streak_30", "name": "Unbreakable", "description": "Maintain a 30-day streak", "icon": "flame", "category": "streaks", "rarity": "epic", "target_value": 30},
    {"key": "streak_100", "name": "Living Legend", "description": "Maintain a 100-day streak", "icon": "flame", "category": "streaks", "rarity": "legendary", "target_value": 100},
    {"key": "streak_365", "name": "Year of Mastery", "description": "Maintain a 365-day streak", "icon": "crown", "category": "streaks", "rarity": "mythic", "target_value": 365},

    # === SPEED ===
    {"key": "speed_10", "name": "Quick Thinker", "description": "Answer 10 questions correctly under 5 seconds each", "icon": "clock", "category": "speed", "rarity": "common", "target_value": 10},
    {"key": "speed_50", "name": "Snap Reflex", "description": "Answer 50 questions correctly under 5 seconds each", "icon": "clock", "category": "speed", "rarity": "rare", "target_value": 50},
    {"key": "speed_200", "name": "Faster Than Light", "description": "Answer 200 questions correctly under 5 seconds each", "icon": "rocket", "category": "speed", "rarity": "epic", "target_value": 200},
    {"key": "speed_quiz", "name": "Lightning Round", "description": "Complete a timed quiz with 90%+ accuracy", "icon": "bolt", "category": "speed", "rarity": "rare", "target_value": None},
    {"key": "speed_quiz_perfect", "name": "Time Bender", "description": "Complete a timed quiz with 100% accuracy", "icon": "bolt", "category": "speed", "rarity": "legendary", "target_value": None},

    # === SURVIVAL ===
    # Each badge is keyed off the user's all-time `longest_survival`. The ladder
    # is intentionally aggressive — the top few tiers are aspirational endgame.
    {"key": "survivor_10", "name": "Survivor", "description": "Survive 10 questions in a single survival session", "icon": "heart", "category": "survival", "rarity": "common", "target_value": 10},
    {"key": "survivor_25", "name": "Hardened", "description": "Survive 25 questions in a single survival session", "icon": "heart", "category": "survival", "rarity": "common", "target_value": 25},
    {"key": "survivor_50", "name": "Iron Mind", "description": "Survive 50 questions in a single survival session", "icon": "shield", "category": "survival", "rarity": "rare", "target_value": 50},
    {"key": "survivor_100", "name": "Indestructible", "description": "Survive 100 questions in a single survival session", "icon": "shield", "category": "survival", "rarity": "rare", "target_value": 100},
    {"key": "survivor_200", "name": "Unbreakable Will", "description": "Survive 200 questions in a single survival session", "icon": "trophy", "category": "survival", "rarity": "epic", "target_value": 200},
    {"key": "survivor_500", "name": "Last One Standing", "description": "Survive 500 questions in a single survival session", "icon": "trophy", "category": "survival", "rarity": "epic", "target_value": 500},
    {"key": "survivor_1000", "name": "Death Defier", "description": "Survive 1,000 questions in a single survival session", "icon": "crown", "category": "survival", "rarity": "legendary", "target_value": 1000},
    {"key": "survivor_2500", "name": "Eternal Sentinel", "description": "Survive 2,500 questions in a single survival session", "icon": "crown", "category": "survival", "rarity": "legendary", "target_value": 2500},
    {"key": "survivor_5000", "name": "Untouched by Fate", "description": "Survive 5,000 questions in a single survival session", "icon": "crown", "category": "survival", "rarity": "mythic", "target_value": 5000},
    {"key": "survivor_10000", "name": "Mythic Survivor", "description": "Survive 10,000 questions in a single survival session", "icon": "crown", "category": "survival", "rarity": "mythic", "target_value": 10000},

    # === SOCIAL ===
    {"key": "first_battle", "name": "Challenger", "description": "Complete your first battle", "icon": "swords", "category": "social", "rarity": "common", "target_value": 1},
    {"key": "battle_winner", "name": "Champion", "description": "Win a battle", "icon": "crown", "category": "social", "rarity": "rare", "target_value": None},
    {"key": "classroom_join", "name": "Team Player", "description": "Join a classroom", "icon": "users", "category": "social", "rarity": "common", "target_value": 1},

    # === SECRET ===
    {"key": "night_owl", "name": "Night Owl", "description": "Complete a quiz between midnight and 5 AM", "icon": "moon", "category": "secret", "rarity": "rare", "target_value": None},
    {"key": "speed_demon", "name": "Speed Demon", "description": "Answer 10 questions correctly in under 30 seconds total", "icon": "rocket", "category": "secret", "rarity": "epic", "target_value": None},
    {"key": "triple_perfect", "name": "Hat Trick", "description": "Score 100% on three quizzes in a row", "icon": "star", "category": "secret", "rarity": "legendary", "target_value": None},
    {"key": "curious_explorer", "name": "Curious Explorer", "description": "You found the way in before signing up", "icon": "compass", "category": "secret", "rarity": "epic", "target_value": None},
]


def seed_badges(db: Session):
    """Ensure all badge definitions exist in the database."""
    for badge_def in BADGE_DEFINITIONS:
        existing = db.query(Badge).filter(Badge.key == badge_def["key"]).first()
        if not existing:
            badge = Badge(
                key=badge_def["key"],
                name=badge_def["name"],
                description=badge_def["description"],
                icon=badge_def.get("icon"),
                category=badge_def.get("category", "study"),
                rarity=badge_def.get("rarity", "common"),
                target_value=badge_def.get("target_value"),
            )
            db.add(badge)
        else:
            # Update existing badges with new fields
            existing.name = badge_def["name"]
            existing.category = badge_def.get("category", "study")
            existing.rarity = badge_def.get("rarity", "common")
            existing.target_value = badge_def.get("target_value")
            existing.icon = badge_def.get("icon")
            existing.description = badge_def["description"]
    db.commit()


def check_and_award_badge(db: Session, user: User, badge_key: str) -> dict | None:
    """Award a badge if the user doesn't already have it."""
    existing = (
        db.query(UserBadge)
        .filter(UserBadge.user_id == user.id, UserBadge.badge_key == badge_key)
        .first()
    )
    if existing:
        return None

    badge = db.query(Badge).filter(Badge.key == badge_key).first()
    if not badge:
        return None

    user_badge = UserBadge(user_id=user.id, badge_key=badge_key)
    db.add(user_badge)
    db.commit()

    return {"key": badge.key, "name": badge.name, "description": badge.description, "icon": badge.icon, "rarity": badge.rarity}


def _award_threshold_badges(
    db: Session,
    user: User,
    value: int,
    badge_keys_with_thresholds: list[tuple[str, int]],
    earned_keys: set | None = None,
) -> list[dict]:
    """Helper: award every badge in the list whose threshold the value clears.

    Each entry is (badge_key, threshold). Idempotent — already-earned badges
    are silently skipped by `check_and_award_badge`.
    """
    out = []
    for key, threshold in badge_keys_with_thresholds:
        if value >= threshold and (earned_keys is None or key not in earned_keys):
            b = check_and_award_badge(db, user, key)
            if b:
                out.append(b)
    return out


def check_quiz_badges(
    db: Session,
    user: User,
    score: float,
    total_questions_answered: int,
    attempt: "Attempt | None" = None,
    quiz: "Quiz | None" = None,
) -> list[dict]:
    """Check and award badges after quiz submission.

    `attempt` and `quiz` are optional for backward compatibility. They unlock
    the speed and accuracy badges that need per-answer or per-quiz context.
    """
    newly_earned = []

    # first_quiz
    badge = check_and_award_badge(db, user, "first_quiz")
    if badge:
        newly_earned.append(badge)

    # perfectionist — scored 100%
    if score == 100.0:
        badge = check_and_award_badge(db, user, "perfectionist")
        if badge:
            newly_earned.append(badge)

    # ── Streak badges ────────────────────────────────────────────────────
    newly_earned += _award_threshold_badges(db, user, user.streak or 0, [
        ("streak_3", 3),
        ("streak_7", 7),
        ("streak_14", 14),
        ("streak_30", 30),
        ("streak_100", 100),
        ("streak_365", 365),
    ])

    # ── Total questions answered ────────────────────────────────────────
    newly_earned += _award_threshold_badges(db, user, total_questions_answered, [
        ("century", 100),
        ("five_hundred", 500),
        ("thousand", 1000),
        ("answers_2500", 2500),
        ("answers_5000", 5000),
        ("answers_10000", 10000),
        ("answers_25000", 25000),
        ("answers_50000", 50000),
    ])

    # ── Quiz count milestones ───────────────────────────────────────────
    quiz_count = (
        db.query(func.count(Attempt.id))
        .filter(Attempt.user_id == user.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0
    newly_earned += _award_threshold_badges(db, user, quiz_count, [
        ("ten_quizzes", 10),
        ("fifty_quizzes", 50),
        ("hundred_quizzes", 100),
        ("two_fifty_quizzes", 250),
        ("five_hundred_quizzes", 500),
        ("thousand_quizzes", 1000),
    ])

    # Night owl — quiz completed between midnight and 5 AM UTC
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if now.hour >= 0 and now.hour < 5:
        badge = check_and_award_badge(db, user, "night_owl")
        if badge:
            newly_earned.append(badge)

    # ── Consecutive perfect quizzes ──────────────────────────────────────
    # Walks back through the user's last completed attempts and counts how
    # many in a row scored 100%. Awards every tier the streak passes through.
    if score == 100.0:
        last_attempts = (
            db.query(Attempt.score)
            .filter(Attempt.user_id == user.id, Attempt.completed_at.isnot(None), Attempt.score.isnot(None))
            .order_by(Attempt.completed_at.desc())
            .limit(30)
            .all()
        )
        perfect_streak = 0
        for (s,) in last_attempts:
            if s == 100.0:
                perfect_streak += 1
            else:
                break
        newly_earned += _award_threshold_badges(db, user, perfect_streak, [
            ("three_perfect", 3),
            ("five_perfect", 5),
            ("ten_perfect", 10),
            ("twenty_five_perfect", 25),
        ])
        # Secret legendary fires at the 3-in-a-row mark
        if perfect_streak >= 3:
            b = check_and_award_badge(db, user, "triple_perfect")
            if b:
                newly_earned.append(b)

    # ── Rolling-average accuracy ────────────────────────────────────────
    # Each accuracy badge demands a higher quiz volume AND a higher avg.
    accuracy_tiers = [
        ("accuracy_80", 30, 85.0),
        ("accuracy_90", 75, 90.0),
        ("accuracy_95", 150, 95.0),
        ("accuracy_98", 250, 98.0),
    ]
    for key, min_quizzes, min_avg in accuracy_tiers:
        if quiz_count < min_quizzes:
            continue
        scores_window = (
            db.query(Attempt.score)
            .filter(Attempt.user_id == user.id, Attempt.completed_at.isnot(None), Attempt.score.isnot(None))
            .order_by(Attempt.completed_at.desc())
            .limit(min_quizzes)
            .all()
        )
        if not scores_window:
            continue
        avg = sum(s[0] for s in scores_window) / len(scores_window)
        if avg >= min_avg:
            b = check_and_award_badge(db, user, key)
            if b:
                newly_earned.append(b)

    # ── Mistake-free streaks across recent answers ──────────────────────
    # Scans the user's most recent 120 answers (cap to keep this cheap) for
    # the longest pure-correct streak, then awards the matching tier.
    recent_answers = (
        db.query(Answer.is_correct)
        .join(Attempt, Attempt.id == Answer.attempt_id)
        .filter(Attempt.user_id == user.id)
        .order_by(Answer.created_at.desc())
        .limit(120)
        .all()
    )
    longest_correct_streak = 0
    cur = 0
    for (is_correct,) in recent_answers:
        if is_correct:
            cur += 1
            longest_correct_streak = max(longest_correct_streak, cur)
        else:
            cur = 0
    newly_earned += _award_threshold_badges(db, user, longest_correct_streak, [
        ("no_mistakes_20", 20),
        ("no_mistakes_50", 50),
        ("no_mistakes_100", 100),
    ])

    # ── Speed badges (need attempt context) ──────────────────────────────
    if attempt is not None:
        # speed_10 / speed_50 / speed_200: cumulative count of correct answers under 5 seconds
        fast_correct = (
            db.query(func.count(Answer.id))
            .join(Attempt, Attempt.id == Answer.attempt_id)
            .filter(
                Attempt.user_id == user.id,
                Answer.is_correct == True,
                Answer.time_taken.isnot(None),
                Answer.time_taken < 5.0,
            )
            .scalar()
        ) or 0
        newly_earned += _award_threshold_badges(db, user, fast_correct, [
            ("speed_10", 10),
            ("speed_50", 50),
            ("speed_200", 200),
        ])

        # speed_demon (secret): 10 consecutive correct answers from this attempt
        # whose total time_taken < 30s
        attempt_answers = (
            db.query(Answer)
            .filter(Answer.attempt_id == attempt.id)
            .order_by(Answer.created_at)
            .all()
        )
        if len(attempt_answers) >= 10:
            for i in range(len(attempt_answers) - 9):
                window = attempt_answers[i:i + 10]
                if all(a.is_correct for a in window):
                    total_time = sum((a.time_taken or 0) for a in window)
                    if 0 < total_time < 30:
                        badge = check_and_award_badge(db, user, "speed_demon")
                        if badge:
                            newly_earned.append(badge)
                        break

        # speed_quiz / speed_quiz_perfect: timed quiz with strong score
        if quiz is not None and quiz.config and quiz.config.get("time_pressure"):
            if score >= 90:
                b = check_and_award_badge(db, user, "speed_quiz")
                if b:
                    newly_earned.append(b)
            if score == 100.0:
                b = check_and_award_badge(db, user, "speed_quiz_perfect")
                if b:
                    newly_earned.append(b)

    return newly_earned


def check_survival_badges(db: Session, user: User) -> list[dict]:
    """Award survival-tier badges based on the user's longest run.

    Called from the survival game-over branch in `quiz_router` after
    `user.longest_survival` has been updated.
    """
    longest = user.longest_survival or 0
    return _award_threshold_badges(db, user, longest, [
        ("survivor_10", 10),
        ("survivor_25", 25),
        ("survivor_50", 50),
        ("survivor_100", 100),
        ("survivor_200", 200),
        ("survivor_500", 500),
        ("survivor_1000", 1000),
        ("survivor_2500", 2500),
        ("survivor_5000", 5000),
        ("survivor_10000", 10000),
    ])


def check_upload_badges(db: Session, user: User) -> list[dict]:
    """Check and award badges after material upload."""
    newly_earned = []

    badge = check_and_award_badge(db, user, "first_upload")
    if badge:
        newly_earned.append(badge)

    # Material count badges — full ladder up to mythic
    material_count = db.query(Material).filter(Material.user_id == user.id).count()
    newly_earned += _award_threshold_badges(db, user, material_count, [
        ("five_materials", 5),
        ("ten_materials", 10),
        ("twenty_five_materials", 25),
        ("fifty_materials", 50),
        ("hundred_materials", 100),
    ])

    return newly_earned


def _get_badge_progress(db: Session, user: User, badge: Badge) -> dict:
    """Calculate progress toward a specific badge.

    DEPRECATED for the list endpoint: use _compute_progress_context instead
    to avoid N+1 queries. This single-badge version is kept for any callers
    that still need it.
    """
    return _progress_for(badge, _compute_progress_context(db, user))


def _compute_progress_context(db: Session, user: User) -> dict:
    """Run all the count queries the badges page needs in one pass.

    Returns a small dict the per-badge formula can read in O(1) without
    hitting the DB again. Cuts the badges endpoint from ~30 queries to ~3.
    """
    material_count = db.query(func.count(Material.id)).filter(Material.user_id == user.id).scalar() or 0
    quiz_count = (
        db.query(func.count(Attempt.id))
        .filter(Attempt.user_id == user.id, Attempt.completed_at.isnot(None))
        .scalar()
    ) or 0
    return {
        "material_count": int(material_count),
        "quiz_count": int(quiz_count),
        "total_answered": int(user.total_questions_answered or 0),
        "streak": int(user.streak or 0),
        "longest_survival": int(user.longest_survival or 0),
    }


def _progress_for(badge: Badge, ctx: dict) -> dict:
    """Compute one badge's progress dict from the precomputed context."""
    key = badge.key
    target = badge.target_value
    current = 0

    # Material count
    if key in ("first_upload", "five_materials", "ten_materials",
               "twenty_five_materials", "fifty_materials", "hundred_materials"):
        current = ctx["material_count"]
    # Quiz count
    elif key in ("first_quiz", "ten_quizzes", "fifty_quizzes",
                 "hundred_quizzes", "two_fifty_quizzes",
                 "five_hundred_quizzes", "thousand_quizzes"):
        current = ctx["quiz_count"]
    # Total questions answered
    elif key in ("century", "five_hundred", "thousand",
                 "answers_2500", "answers_5000", "answers_10000",
                 "answers_25000", "answers_50000"):
        current = ctx["total_answered"]
    # Daily streak
    elif key in ("streak_3", "streak_7", "streak_14", "streak_30",
                 "streak_100", "streak_365"):
        current = ctx["streak"]
    # Survival ladder
    elif key in ("survivor_10", "survivor_25", "survivor_50",
                 "survivor_100", "survivor_200", "survivor_500",
                 "survivor_1000", "survivor_2500", "survivor_5000",
                 "survivor_10000"):
        current = ctx["longest_survival"]

    if target and target > 0:
        progress = min(round((current / target) * 100, 1), 100)
        return {"current": current, "target": target, "percent": progress}
    return {"current": 0, "target": None, "percent": 0}


@router.get("/")
async def list_badges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all badges with user's earned status, rarity, category, and progress."""
    # Only seed if the catalog is missing entries (saves a write transaction
    # and the per-row insert checks on every request).
    catalog_count = db.query(func.count(Badge.id)).scalar() or 0
    if catalog_count < len(BADGE_DEFINITIONS):
        seed_badges(db)

    all_badges = db.query(Badge).all()
    user_badge_keys = set(
        ub.badge_key for ub in db.query(UserBadge).filter(UserBadge.user_id == current_user.id).all()
    )

    # Compute every counter the progress logic needs in 2-3 SQL queries up front,
    # then evaluate progress for each unearned badge in pure Python (O(1) each).
    ctx = _compute_progress_context(db, current_user)

    badges_data = []
    for b in all_badges:
        earned = b.key in user_badge_keys
        progress = None
        if not earned:
            progress = _progress_for(b, ctx)

        badges_data.append({
            "key": b.key,
            "name": b.name,
            "description": b.description,
            "icon": b.icon,
            "category": b.category or "study",
            "rarity": b.rarity or "common",
            "earned": earned,
            "progress": progress,
        })

    # Sort: earned first, then by rarity (mythic first)
    rarity_order = {"mythic": 0, "legendary": 1, "epic": 2, "rare": 3, "common": 4}
    badges_data.sort(key=lambda x: (0 if x["earned"] else 1, rarity_order.get(x["rarity"], 5)))

    return badges_data


class PinBadgeRequest(BaseModel):
    badge_key: str | None = None  # None to unpin


@router.put("/pin")
async def pin_badge(
    req: PinBadgeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pin a badge as your showcase badge, or unpin (set to None)."""
    if req.badge_key:
        # Verify user has earned this badge
        user_badge = (
            db.query(UserBadge)
            .filter(UserBadge.user_id == current_user.id, UserBadge.badge_key == req.badge_key)
            .first()
        )
        if not user_badge:
            raise HTTPException(status_code=400, detail="You haven't earned this badge yet")

    current_user.pinned_badge_key = req.badge_key
    db.commit()

    return {"pinned_badge_key": current_user.pinned_badge_key}


@router.get("/pinned")
async def get_pinned_badge(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the user's currently pinned badge."""
    if not current_user.pinned_badge_key:
        return {"pinned": None}

    badge = db.query(Badge).filter(Badge.key == current_user.pinned_badge_key).first()
    if not badge:
        return {"pinned": None}

    return {
        "pinned": {
            "key": badge.key,
            "name": badge.name,
            "icon": badge.icon,
            "rarity": badge.rarity,
        }
    }
