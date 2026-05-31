from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel

from app.database import get_db, SessionLocal
from app.models import (
    User, Material, Section, Quiz, Question, Attempt, Answer,
    QuestionPool, AdaptiveSession,
)
from app.auth import get_current_user
from app.rate_limit import limiter

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


# --- XP & Leveling Helpers ---

def xp_needed_for_level(level: int) -> int:
    """XP threshold to advance from `level` to `level + 1`."""
    return level * 100


def calculate_combo_xp(answers_in_order: list[dict]) -> int:
    """
    Calculate total XP with combo multiplier.
    Base: 10 XP per correct answer.
    Combo: 2x after 3 consecutive correct, 3x after 5 consecutive correct.
    """
    total_xp = 0
    consecutive_correct = 0

    for ans in answers_in_order:
        if ans["is_correct"]:
            consecutive_correct += 1
            if consecutive_correct >= 5:
                multiplier = 3
            elif consecutive_correct >= 3:
                multiplier = 2
            else:
                multiplier = 1
            total_xp += 10 * multiplier
        else:
            consecutive_correct = 0

    return total_xp


def apply_xp_and_level(user: User, xp_earned: int):
    """Add XP to user and level up if threshold crossed."""
    user.xp += xp_earned
    # Check for level ups (could be multiple)
    while user.xp >= xp_needed_for_level(user.level):
        user.xp -= xp_needed_for_level(user.level)
        user.level += 1


def update_streak(user: User):
    """Update daily streak based on last_active_date."""
    today = datetime.now(timezone.utc).date()

    if user.last_active_date is None:
        # First ever activity
        user.streak = 1
        user.last_active_date = datetime.now(timezone.utc)
        return

    last_date = user.last_active_date.date() if hasattr(user.last_active_date, 'date') else user.last_active_date

    if last_date == today:
        # Already active today — no change
        return
    elif last_date == today - timedelta(days=1):
        # Active yesterday — streak continues
        user.streak += 1
        user.last_active_date = datetime.now(timezone.utc)
    else:
        # Missed a day — reset
        user.streak = 1
        user.last_active_date = datetime.now(timezone.utc)


# --- Request/Response Models ---

class GenerateQuizRequest(BaseModel):
    material_id: str
    question_count: int = 10
    question_types: list[str] = ["mcq", "true_false"]
    difficulty: str = "mixed"  # "mixed", "easy", "medium", "hard"
    mode: str = "standard"  # "standard", "explain_learn", "adaptive", "survival"
    focus_weak: bool = False


class SubmitAnswerRequest(BaseModel):
    question_id: str
    user_answer: str
    confidence: str | None = None
    time_taken: float | None = None


class SubmitQuizRequest(BaseModel):
    answers: list[SubmitAnswerRequest]


class NextQuestionAnswer(BaseModel):
    question_id: str
    user_answer: str
    confidence: str | None = None
    time_taken: float | None = None


# --- Endpoints ---

@router.post("/generate")
@limiter.limit("20/minute")
async def generate_quiz(
    request: Request,
    body: GenerateQuizRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a quiz by pulling from the pre-generated question pool."""
    material = (
        db.query(Material)
        .filter(Material.id == body.material_id, Material.user_id == current_user.id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if not material.processed:
        raise HTTPException(status_code=400, detail="Material not yet processed")

    # Get questions the user has already answered
    user_answers = (
        db.query(Answer.question_id)
        .join(Attempt)
        .filter(Attempt.user_id == current_user.id)
        .all()
    )
    answered_contents = set()
    wrong_contents = set()
    for (qid,) in user_answers:
        q = db.query(Question).filter(Question.id == qid).first()
        if q:
            answered_contents.add(q.content)
            wrong_answer = db.query(Answer).filter(
                Answer.question_id == qid, Answer.is_correct == False
            ).first()
            if wrong_answer and q.source_text:
                wrong_contents.add(q.source_text[:50])

    # Pull from pool, preferring unseen questions
    pool_query = db.query(QuestionPool).filter(QuestionPool.material_id == body.material_id)

    # Filter by difficulty if not mixed
    if body.difficulty != "mixed":
        pool_query = pool_query.filter(QuestionPool.difficulty == body.difficulty)

    pool_questions = pool_query.order_by(QuestionPool.times_used, QuestionPool.created_at).all()

    # Filter by type if specified
    if body.question_types:
        pool_questions = [q for q in pool_questions if q.type in body.question_types]

    # Prefer questions the user hasn't seen
    unseen = [q for q in pool_questions if q.content not in answered_contents]
    seen = [q for q in pool_questions if q.content in answered_contents]

    # If focus_weak is enabled, prioritize questions from weak areas
    if getattr(body, 'focus_weak', False) and wrong_contents:
        weak_unseen = [q for q in unseen if q.source_text and any(w in q.source_text for w in wrong_contents)]
        other_unseen = [q for q in unseen if q not in weak_unseen]
        selected = weak_unseen[:body.question_count]
        if len(selected) < body.question_count:
            selected.extend(other_unseen[:body.question_count - len(selected)])
    else:
        selected = unseen[:body.question_count]

    if len(selected) < body.question_count:
        remaining = body.question_count - len(selected)
        selected.extend(seen[:remaining])

    # Deduplicate within the quiz
    def is_similar(a: str, b: str) -> bool:
        words_a = set(a.lower().split())
        words_b = set(b.lower().split())
        if not words_a or not words_b:
            return False
        overlap = len(words_a & words_b) / min(len(words_a), len(words_b))
        return overlap > 0.8

    deduped = []
    for q in selected:
        if not any(is_similar(q.content, existing.content) for existing in deduped):
            deduped.append(q)
    selected = deduped[:body.question_count]

    if not selected:
        total_pool = db.query(QuestionPool).filter(QuestionPool.material_id == body.material_id).count()
        if total_pool > 0:
            pool_fallback = (
                db.query(QuestionPool)
                .filter(QuestionPool.material_id == body.material_id)
                .order_by(QuestionPool.times_used)
                .limit(body.question_count)
                .all()
            )
            if pool_fallback:
                selected = pool_fallback
            else:
                raise HTTPException(
                    status_code=400,
                    detail="No questions match your filters. Try selecting different question types or difficulty.",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="Question pool is still generating. Wait a moment and try again.",
            )

    # For adaptive mode, ensure we get questions across difficulties
    if body.mode == "adaptive":
        # Pull extra questions at each difficulty level for adaptive selection
        easy_pool = [q for q in pool_questions if q.difficulty == "easy" and q.content not in answered_contents]
        medium_pool = [q for q in pool_questions if q.difficulty == "medium" and q.content not in answered_contents]
        hard_pool = [q for q in pool_questions if q.difficulty == "hard" and q.content not in answered_contents]

        # Build a larger pool: take up to question_count from each difficulty
        adaptive_pool = []
        adaptive_pool.extend(easy_pool[:body.question_count])
        adaptive_pool.extend(medium_pool[:body.question_count])
        adaptive_pool.extend(hard_pool[:body.question_count])

        # Dedup
        adaptive_deduped = []
        for q in adaptive_pool:
            if not any(is_similar(q.content, existing.content) for existing in adaptive_deduped):
                adaptive_deduped.append(q)

        if adaptive_deduped:
            selected = adaptive_deduped[:body.question_count * 3]  # Store extra for adaptive picking

    # Convert pool items to question data
    selected_data = [
        {
            "type": q.type,
            "content": q.content,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation or "",
            "source_text": q.source_text or "",
            "difficulty": q.difficulty or "medium",
        }
        for q in selected
    ]
    # Increment times_used
    for q in selected:
        q.times_used += 1
    db.commit()

    # Create quiz record
    quiz = Quiz(
        material_id=material.id,
        user_id=current_user.id,
        title=f"Quiz: {material.title}",
        question_count=len(selected_data) if body.mode != "adaptive" else body.question_count,
        config={
            "question_types": body.question_types,
            "requested_count": body.question_count,
            "difficulty": body.difficulty,
            "mode": body.mode,
        },
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    # Create question records
    for i, q_data in enumerate(selected_data):
        question = Question(
            quiz_id=quiz.id,
            section_id=None,
            type=q_data["type"],
            content=q_data["content"],
            options=q_data["options"],
            correct_answer=q_data["correct_answer"],
            explanation=q_data.get("explanation", ""),
            source_text=q_data.get("source_text", ""),
            order_index=i,
        )
        db.add(question)

    db.commit()

    # For adaptive/survival modes, create an AdaptiveSession
    if body.mode in ("adaptive", "survival"):
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
        db.commit()

    # Replenish pool in background if running low
    remaining_pool = (
        db.query(QuestionPool)
        .filter(QuestionPool.material_id == body.material_id)
        .count()
    )
    if remaining_pool < 20:
        async def _replenish():
            from app.services.pool_generator import replenish_pool
            rdb = SessionLocal()
            try:
                await replenish_pool(body.material_id, rdb, count=20)
            finally:
                rdb.close()
        background_tasks.add_task(_replenish)

    return {"id": quiz.id, "title": quiz.title, "question_count": quiz.question_count, "mode": body.mode}


@router.get("/{quiz_id}")
async def get_quiz(
    quiz_id: str,
    include_answers: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a quiz with its questions. Optionally include correct answers for explain mode."""
    quiz = (
        db.query(Quiz)
        .filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
        .first()
    )
    # Also allow if user has an attempt on this quiz (classroom quizzes started by student)
    if not quiz:
        has_attempt = db.query(Attempt).filter(
            Attempt.quiz_id == quiz_id,
            Attempt.user_id == current_user.id,
        ).first()
        if has_attempt:
            quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    mode = quiz.config.get("mode", "standard") if quiz.config else "standard"

    # For adaptive/survival mode, only return the first question
    if mode in ("adaptive", "survival"):
        session = (
            db.query(AdaptiveSession)
            .filter(AdaptiveSession.quiz_id == quiz_id, AdaptiveSession.user_id == current_user.id)
            .first()
        )
        questions = sorted(quiz.questions, key=lambda q: q.order_index)

        if session and session.current_index < len(questions):
            # Return current question only
            q = questions[session.current_index]
            item = {
                "id": q.id,
                "type": q.type,
                "content": q.content,
                "options": q.options,
                "order_index": q.order_index,
            }
            if include_answers:
                item["correct_answer"] = q.correct_answer
                item["explanation"] = q.explanation or ""
                item["source_text"] = q.source_text or ""

            return {
                "id": quiz.id,
                "title": quiz.title,
                "material_id": quiz.material_id,
                "question_count": quiz.question_count,
                "mode": mode,
                "current_index": session.current_index,
                "is_active": session.is_active,
                "survival_count": session.survival_count,
                "hearts_remaining": session.hearts_remaining,
                "consecutive_correct": session.consecutive_correct,
                "questions": [item],
            }

    questions = sorted(quiz.questions, key=lambda q: q.order_index)

    question_list = []
    for q in questions:
        item = {
            "id": q.id,
            "type": q.type,
            "content": q.content,
            "options": q.options,
            "order_index": q.order_index,
        }
        if include_answers:
            item["correct_answer"] = q.correct_answer
            item["explanation"] = q.explanation or ""
            item["source_text"] = q.source_text or ""
        question_list.append(item)

    return {
        "id": quiz.id,
        "title": quiz.title,
        "material_id": quiz.material_id,
        "question_count": quiz.question_count,
        "mode": mode,
        "questions": question_list,
    }


@router.post("/{quiz_id}/next-question")
async def next_question(
    quiz_id: str,
    request: NextQuestionAnswer,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit answer for current question and get the next one.
    Used for adaptive and survival modes.
    """
    quiz = (
        db.query(Quiz)
        .filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
        .first()
    )
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    mode = quiz.config.get("mode", "standard") if quiz.config else "standard"
    if mode not in ("adaptive", "survival"):
        raise HTTPException(status_code=400, detail="This endpoint is only for adaptive/survival modes")

    session = (
        db.query(AdaptiveSession)
        .filter(AdaptiveSession.quiz_id == quiz_id, AdaptiveSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="No active session found")

    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session ended (game over)")

    # Get current question and check answer
    questions = sorted(quiz.questions, key=lambda q: q.order_index)
    if session.current_index >= len(questions):
        raise HTTPException(status_code=400, detail="No more questions available")

    current_q = questions[session.current_index]

    # Verify the submitted question_id matches current question
    if request.question_id != current_q.id:
        raise HTTPException(status_code=400, detail="Question ID does not match current question")

    is_correct = request.user_answer == current_q.correct_answer

    # Create or get attempt for this session
    attempt = (
        db.query(Attempt)
        .filter(Attempt.quiz_id == quiz.id, Attempt.user_id == current_user.id, Attempt.completed_at == None)
        .first()
    )
    if not attempt:
        attempt = Attempt(
            quiz_id=quiz.id,
            user_id=current_user.id,
            total_questions=quiz.question_count,
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)

    # Record the answer
    answer = Answer(
        attempt_id=attempt.id,
        question_id=current_q.id,
        user_answer=request.user_answer,
        is_correct=is_correct,
        confidence=request.confidence,
        time_taken=request.time_taken,
    )
    db.add(answer)

    # Update session state
    if is_correct:
        session.consecutive_correct += 1
        session.consecutive_wrong = 0
        session.survival_count += 1
    else:
        session.consecutive_correct = 0
        session.consecutive_wrong += 1
        # In survival mode, lose a heart on every wrong answer
        if mode == "survival":
            session.hearts_remaining = max(0, (session.hearts_remaining or 3) - 1)

    # --- SURVIVAL MODE: end when hearts hit 0 ---
    if mode == "survival" and session.hearts_remaining <= 0:
        session.is_active = False
        # Update user's longest survival record
        if session.survival_count > current_user.longest_survival:
            current_user.longest_survival = session.survival_count
        # Finalize attempt
        attempt.correct_count = session.survival_count
        attempt.score = (session.survival_count / max(session.current_index + 1, 1)) * 100
        attempt.completed_at = func.now()
        # Award XP for survival run
        xp_earned = calculate_combo_xp([
            {"is_correct": True} for _ in range(session.survival_count)
        ] + [{"is_correct": False}])
        apply_xp_and_level(current_user, xp_earned)
        update_streak(current_user)
        current_user.total_questions_answered += session.current_index + 1

        # Mark the SurvivalAttempt row complete and store the survived count
        from app.models import SurvivalAttempt
        sa = (
            db.query(SurvivalAttempt)
            .filter(SurvivalAttempt.quiz_id == quiz.id, SurvivalAttempt.user_id == current_user.id)
            .first()
        )
        if sa:
            sa.questions_survived = session.survival_count
            sa.status = "completed"
            sa.ended_at = func.now()

        # Award survival-tier badges based on the new longest_survival
        from app.routers.badges_router import check_survival_badges
        survival_badges = check_survival_badges(db, current_user)

        db.commit()

        return {
            "is_correct": is_correct,
            "correct_answer": current_q.correct_answer,
            "explanation": current_q.explanation,
            "source_text": current_q.source_text,
            "game_over": True,
            "survival_count": session.survival_count,
            "hearts_remaining": 0,
            "longest_survival": current_user.longest_survival,
            "xp_earned": xp_earned,
            "badges_earned": survival_badges,
            "next_question": None,
        }

    # --- ADAPTIVE MODE: adjust difficulty ---
    if mode == "adaptive":
        if session.consecutive_correct >= 3:
            # Increase difficulty
            if session.current_difficulty == "easy":
                session.current_difficulty = "medium"
            elif session.current_difficulty == "medium":
                session.current_difficulty = "hard"
        elif session.consecutive_wrong >= 2:
            # Decrease difficulty
            if session.current_difficulty == "hard":
                session.current_difficulty = "medium"
            elif session.current_difficulty == "medium":
                session.current_difficulty = "easy"

    # Advance to next question
    session.current_index += 1

    # SURVIVAL MODE: When we run out of questions, generate fresh ones on-demand.
    # We never pull from QuestionPool here — survival questions stay isolated so
    # standard mode users never encounter a question that was made for someone's run.
    # The run only ends when hearts hit 0 (handled above) — never by exhausting questions.
    if mode == "survival" and session.current_index >= len(questions):
        from app.services.pool_worker import generate_survival_questions
        from app.models import Question as QuestionModel

        used_contents = {q.content for q in questions}
        fresh = await generate_survival_questions(
            quiz.material_id, db, count=10, exclude_contents=used_contents,
        )

        if fresh:
            for i, fq in enumerate(fresh):
                new_q = QuestionModel(
                    quiz_id=quiz.id,
                    section_id=None,
                    type=fq["type"],
                    content=fq["content"],
                    options=fq["options"],
                    correct_answer=fq["correct_answer"],
                    explanation=fq.get("explanation", ""),
                    source_text=fq.get("source_text", ""),
                    order_index=len(questions) + i,
                )
                db.add(new_q)
            db.commit()
            # Re-read so the rest of this handler sees the new rows
            questions = (
                db.query(Question)
                .filter(Question.quiz_id == quiz.id)
                .order_by(Question.order_index)
                .all()
            )

        # If AI failed to produce anything usable, end the run gracefully
        if session.current_index >= len(questions):
            session.is_active = False
            if session.survival_count > current_user.longest_survival:
                current_user.longest_survival = session.survival_count
            attempt.correct_count = session.survival_count
            attempt.score = (session.survival_count / max(session.current_index, 1)) * 100
            attempt.completed_at = func.now()
            xp_earned = calculate_combo_xp([{"is_correct": True} for _ in range(session.survival_count)])
            apply_xp_and_level(current_user, xp_earned)
            update_streak(current_user)
            current_user.total_questions_answered += session.current_index

            from app.models import SurvivalAttempt
            sa = (
                db.query(SurvivalAttempt)
                .filter(SurvivalAttempt.quiz_id == quiz.id, SurvivalAttempt.user_id == current_user.id)
                .first()
            )
            if sa:
                sa.questions_survived = session.survival_count
                sa.status = "completed"
                sa.ended_at = func.now()

            # Award survival-tier badges before commit
            from app.routers.badges_router import check_survival_badges
            survival_badges = check_survival_badges(db, current_user)

            db.commit()

            return {
                "is_correct": is_correct,
                "correct_answer": current_q.correct_answer,
                "explanation": current_q.explanation,
                "source_text": current_q.source_text,
                "game_over": True,
                "pool_exhausted": True,
                "survival_count": session.survival_count,
                "hearts_remaining": session.hearts_remaining,
                "longest_survival": current_user.longest_survival,
                "xp_earned": xp_earned,
                "badges_earned": survival_badges,
                "next_question": None,
            }

    # Check if quiz is complete (non-survival modes)
    if session.current_index >= len(questions):
        # Quiz finished — finalize
        session.is_active = False
        correct_count = db.query(Answer).filter(
            Answer.attempt_id == attempt.id, Answer.is_correct == True
        ).count()
        attempt.correct_count = correct_count
        attempt.score = (correct_count / max(session.current_index, 1)) * 100
        attempt.completed_at = func.now()

        # Calculate combo XP
        all_answers = db.query(Answer).filter(Answer.attempt_id == attempt.id).order_by(Answer.created_at).all()
        answers_ordered = [{"is_correct": a.is_correct} for a in all_answers]
        xp_earned = calculate_combo_xp(answers_ordered)
        apply_xp_and_level(current_user, xp_earned)
        update_streak(current_user)
        current_user.total_questions_answered += session.current_index

        # Badge checks
        from app.routers.badges_router import check_quiz_badges
        badges_earned = check_quiz_badges(
            db, current_user, attempt.score, current_user.total_questions_answered,
            attempt=attempt, quiz=quiz,
        )

        db.commit()

        return {
            "is_correct": is_correct,
            "correct_answer": current_q.correct_answer,
            "explanation": current_q.explanation,
            "source_text": current_q.source_text,
            "game_over": False,
            "quiz_complete": True,
            "score": attempt.score,
            "correct_count": correct_count,
            "total_questions": session.current_index,
            "xp_earned": xp_earned,
            "badges_earned": badges_earned,
            "next_question": None,
        }

    # Find the next question (for adaptive: try to match difficulty)
    next_q = None
    if mode == "adaptive":
        # Try to find a question at the target difficulty from remaining questions
        remaining = questions[session.current_index:]
        # Prefer questions matching current difficulty
        # We stored difficulty in source_text is not reliable. Let's check the pool difficulty
        # Questions were stored without difficulty column, so we look at the pool
        for q in remaining:
            pool_match = db.query(QuestionPool).filter(
                QuestionPool.content == q.content,
                QuestionPool.difficulty == session.current_difficulty,
            ).first()
            if pool_match:
                next_q = q
                break
        # If no match, just use the next in order
        if not next_q:
            next_q = questions[session.current_index]
    else:
        next_q = questions[session.current_index]

    # If adaptive picked a different question, swap order indices
    if next_q and next_q.order_index != session.current_index:
        # Swap positions in the question list
        target_q = questions[session.current_index]
        old_idx = next_q.order_index
        next_q.order_index = session.current_index
        target_q.order_index = old_idx

    db.commit()

    return {
        "is_correct": is_correct,
        "correct_answer": current_q.correct_answer,
        "explanation": current_q.explanation,
        "source_text": current_q.source_text,
        "game_over": False,
        "quiz_complete": False,
        "current_difficulty": session.current_difficulty if mode == "adaptive" else None,
        "consecutive_correct": session.consecutive_correct,
        "survival_count": session.survival_count if mode == "survival" else None,
        "hearts_remaining": session.hearts_remaining if mode == "survival" else None,
        "next_question": {
            "id": next_q.id,
            "type": next_q.type,
            "content": next_q.content,
            "options": next_q.options,
            "order_index": next_q.order_index,
        } if next_q else None,
    }


@router.post("/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: str,
    request: SubmitQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit answers for a quiz and get results (standard/explain_learn modes)."""
    quiz = (
        db.query(Quiz)
        .filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
        .first()
    )
    # Also allow if user has an attempt (classroom quiz)
    if not quiz:
        has_attempt = db.query(Attempt).filter(
            Attempt.quiz_id == quiz_id,
            Attempt.user_id == current_user.id,
        ).first()
        if has_attempt:
            quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Create attempt
    attempt = Attempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        total_questions=quiz.question_count,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # Process answers in order (for combo calculation)
    correct_count = 0
    results = []
    answers_ordered = []

    for answer_data in request.answers:
        question = db.query(Question).filter(Question.id == answer_data.question_id).first()
        if not question:
            continue

        is_correct = answer_data.user_answer == question.correct_answer
        if is_correct:
            correct_count += 1

        answer = Answer(
            attempt_id=attempt.id,
            question_id=question.id,
            user_answer=answer_data.user_answer,
            is_correct=is_correct,
            confidence=answer_data.confidence,
            time_taken=answer_data.time_taken,
        )
        db.add(answer)

        answers_ordered.append({"is_correct": is_correct})

        results.append({
            "question_id": question.id,
            "content": question.content,
            "user_answer": answer_data.user_answer,
            "correct_answer": question.correct_answer,
            "is_correct": is_correct,
            "explanation": question.explanation,
            "source_text": question.source_text,
        })

    # Update attempt score
    attempt.correct_count = correct_count
    attempt.score = (correct_count / quiz.question_count) * 100 if quiz.question_count > 0 else 0
    attempt.completed_at = func.now()

    # Update ClassroomQuizAttempt if this is a classroom quiz
    if quiz.config and quiz.config.get("classroom_quiz"):
        from app.models import ClassroomQuizAttempt
        cqa = db.query(ClassroomQuizAttempt).filter(
            ClassroomQuizAttempt.attempt_id == attempt.id
        ).first()
        if cqa:
            cqa.completed_at = func.now()

    # Calculate XP with combo multiplier
    xp_earned = calculate_combo_xp(answers_ordered)

    # Apply XP and check for level up
    old_level = current_user.level
    apply_xp_and_level(current_user, xp_earned)
    leveled_up = current_user.level > old_level

    # Update streak
    update_streak(current_user)

    # Update total questions answered
    current_user.total_questions_answered += len(request.answers)

    # Check and award badges
    from app.routers.badges_router import check_quiz_badges
    is_classroom_quiz = bool(quiz.config and quiz.config.get("classroom_quiz"))

    # For classroom quizzes: still award badges in DB but don't reveal to student yet
    # Badges will be shown when teacher reveals results
    badges_earned = check_quiz_badges(
        db, current_user, attempt.score, current_user.total_questions_answered,
        attempt=attempt, quiz=quiz,
    )

    # Check and award titles (always, regardless of classroom quiz)
    from app.routers.profile_router import check_and_award_titles
    check_and_award_titles(db, current_user)

    db.commit()

    # Resolve classroom_id for classroom quizzes
    classroom_id = None
    if is_classroom_quiz:
        from app.models import ClassroomQuiz as CQ
        cq_record = db.query(CQ).filter(CQ.quiz_id == quiz.id).first()
        if cq_record:
            classroom_id = cq_record.classroom_id

    # Emit real-time event via WebSocket
    try:
        from app.services.events import emit_quiz_completed, emit_badge_earned
        await emit_quiz_completed(current_user.id, current_user.name, classroom_id, attempt.score, quiz.title)
        # Don't broadcast badge events for classroom quizzes (avoids spoiling performance)
        if not is_classroom_quiz:
            for badge in badges_earned:
                await emit_badge_earned(current_user.id, current_user.name, badge["name"], badge.get("rarity", "common"), classroom_id)
    except Exception:
        pass  # Don't fail the request if WS broadcast fails

    return {
        "attempt_id": attempt.id,
        "score": attempt.score,
        "correct_count": correct_count,
        "total_questions": quiz.question_count,
        "xp_earned": xp_earned,
        "level": current_user.level,
        "leveled_up": leveled_up,
        "streak": current_user.streak,
        "badges_earned": [] if is_classroom_quiz else badges_earned,
        "material_id": quiz.material_id,
        "is_classroom_quiz": is_classroom_quiz,
        "classroom_id": classroom_id,
        "results": results,
    }


@router.get("/")
async def list_quizzes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all quizzes for the current user."""
    quizzes = (
        db.query(Quiz)
        .filter(Quiz.user_id == current_user.id)
        .order_by(Quiz.created_at.desc())
        .all()
    )
    return [
        {
            "id": q.id,
            "title": q.title,
            "material_id": q.material_id,
            "question_count": q.question_count,
            "mode": q.config.get("mode", "standard") if q.config else "standard",
            "created_at": q.created_at.isoformat(),
        }
        for q in quizzes
    ]
