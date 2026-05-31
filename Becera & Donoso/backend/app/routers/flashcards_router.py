from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Material, Quiz, Question, Flashcard
from app.auth import get_current_user

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


class ConvertQuizRequest(BaseModel):
    quiz_id: str


class ReviewFlashcardRequest(BaseModel):
    quality: int  # 0-5 scale (0=forgot, 3=correct with effort, 5=easy)


@router.post("/convert")
async def convert_quiz_to_flashcards(
    request: ConvertQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert a quiz's questions into flashcards for spaced repetition."""
    quiz = (
        db.query(Quiz)
        .filter(Quiz.id == request.quiz_id, Quiz.user_id == current_user.id)
        .first()
    )
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = db.query(Question).filter(Question.quiz_id == quiz.id).all()
    created = 0

    for q in questions:
        # Check if flashcard already exists for this content
        existing = db.query(Flashcard).filter(
            Flashcard.user_id == current_user.id,
            Flashcard.front == q.content,
        ).first()
        if existing:
            continue

        flashcard = Flashcard(
            user_id=current_user.id,
            material_id=quiz.material_id,
            front=q.content,
            back=f"{q.correct_answer}\n\n{q.explanation or ''}".strip(),
            difficulty=q.type,
        )
        db.add(flashcard)
        created += 1

    db.commit()
    return {"created": created, "total": len(questions)}


@router.get("/")
async def list_flashcards(
    material_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List flashcards, optionally filtered by material."""
    query = db.query(Flashcard).filter(Flashcard.user_id == current_user.id)
    if material_id:
        query = query.filter(Flashcard.material_id == material_id)
    cards = query.order_by(Flashcard.next_review).all()
    return [
        {
            "id": f.id,
            "front": f.front,
            "back": f.back,
            "difficulty": f.difficulty,
            "interval_days": f.interval_days,
            "next_review": f.next_review.isoformat() if f.next_review else None,
            "review_count": f.review_count,
        }
        for f in cards
    ]


@router.get("/due")
async def get_due_flashcards(
    material_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get flashcards due for review (next_review <= now)."""
    now = datetime.now(timezone.utc)
    query = (
        db.query(Flashcard)
        .filter(Flashcard.user_id == current_user.id, Flashcard.next_review <= now)
    )
    if material_id:
        query = query.filter(Flashcard.material_id == material_id)
    cards = query.order_by(Flashcard.next_review).limit(20).all()
    return [
        {
            "id": f.id,
            "front": f.front,
            "back": f.back,
            "review_count": f.review_count,
        }
        for f in cards
    ]


@router.post("/{flashcard_id}/review")
async def review_flashcard(
    flashcard_id: str,
    request: ReviewFlashcardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a review for a flashcard using SM-2 algorithm."""
    card = (
        db.query(Flashcard)
        .filter(Flashcard.id == flashcard_id, Flashcard.user_id == current_user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    quality = max(0, min(5, request.quality))

    # SM-2 algorithm
    if quality < 3:
        # Failed: reset interval
        card.interval_days = 1
    else:
        if card.review_count == 0:
            card.interval_days = 1
        elif card.review_count == 1:
            card.interval_days = 6
        else:
            card.interval_days = round(card.interval_days * card.ease_factor)

    # Update ease factor
    card.ease_factor = max(1.3, card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    card.review_count += 1
    card.next_review = datetime.now(timezone.utc) + timedelta(days=card.interval_days)

    db.commit()

    return {
        "next_review": card.next_review.isoformat(),
        "interval_days": card.interval_days,
        "ease_factor": round(card.ease_factor, 2),
    }


@router.delete("/{flashcard_id}")
async def delete_flashcard(
    flashcard_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a flashcard."""
    card = (
        db.query(Flashcard)
        .filter(Flashcard.id == flashcard_id, Flashcard.user_id == current_user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    db.delete(card)
    db.commit()
    return {"ok": True}
