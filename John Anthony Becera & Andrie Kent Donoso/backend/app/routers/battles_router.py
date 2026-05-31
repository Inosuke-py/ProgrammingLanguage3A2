from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Material, Quiz, Question, Battle
from app.auth import get_current_user

router = APIRouter(prefix="/battles", tags=["battles"])


class CreateBattleRequest(BaseModel):
    material_id: str
    quiz_id: str


class AnswerRequest(BaseModel):
    question_id: str
    answer: str


@router.post("/create")
async def create_battle(
    req: CreateBattleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a battle (host). Returns battle_id for opponent to join."""
    # Verify material exists
    material = db.query(Material).filter(Material.id == req.material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Verify quiz exists and belongs to the material
    quiz = db.query(Quiz).filter(
        Quiz.id == req.quiz_id,
        Quiz.material_id == req.material_id,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found for this material")

    battle = Battle(
        material_id=req.material_id,
        quiz_id=req.quiz_id,
        host_id=current_user.id,
        status="waiting",
        host_score=0,
        opponent_score=0,
        host_answers=[],
        opponent_answers=[],
    )
    db.add(battle)
    db.commit()
    db.refresh(battle)

    return {
        "id": battle.id,
        "status": battle.status,
        "quiz_id": battle.quiz_id,
        "material_id": battle.material_id,
        "host_id": battle.host_id,
        "created_at": battle.created_at,
    }


@router.post("/{battle_id}/join")
async def join_battle(
    battle_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Opponent joins a battle."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")

    if battle.status != "waiting":
        raise HTTPException(status_code=400, detail="Battle is not waiting for an opponent")

    if battle.host_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot join your own battle")

    battle.opponent_id = current_user.id
    battle.status = "active"
    db.commit()
    db.refresh(battle)

    return {
        "id": battle.id,
        "status": battle.status,
        "host_id": battle.host_id,
        "opponent_id": battle.opponent_id,
        "quiz_id": battle.quiz_id,
    }


@router.get("/{battle_id}")
async def get_battle(
    battle_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get battle status (both players poll this)."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")

    # Get quiz questions
    questions = db.query(Question).filter(
        Question.quiz_id == battle.quiz_id
    ).order_by(Question.order_index).all()

    questions_data = [
        {
            "id": q.id,
            "type": q.type,
            "content": q.content,
            "options": q.options,
            "order_index": q.order_index,
        }
        for q in questions
    ]

    # Get player names
    host = db.query(User).filter(User.id == battle.host_id).first()
    opponent = db.query(User).filter(User.id == battle.opponent_id).first() if battle.opponent_id else None

    return {
        "id": battle.id,
        "status": battle.status,
        "host_id": battle.host_id,
        "host_name": host.name if host else None,
        "opponent_id": battle.opponent_id,
        "opponent_name": opponent.name if opponent else None,
        "host_score": battle.host_score,
        "opponent_score": battle.opponent_score,
        "host_answers_count": len(battle.host_answers or []),
        "opponent_answers_count": len(battle.opponent_answers or []),
        "questions": questions_data,
        "total_questions": len(questions_data),
        "quiz_id": battle.quiz_id,
        "material_id": battle.material_id,
        "created_at": battle.created_at,
        "completed_at": battle.completed_at,
    }


@router.post("/{battle_id}/answer")
async def submit_answer(
    battle_id: str,
    req: AnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit an answer in a battle. Checks who submitted (host or opponent)."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")

    if battle.status != "active":
        raise HTTPException(status_code=400, detail="Battle is not active")

    # Determine if current user is host or opponent
    is_host = current_user.id == battle.host_id
    is_opponent = current_user.id == battle.opponent_id

    if not is_host and not is_opponent:
        raise HTTPException(status_code=403, detail="You are not a participant in this battle")

    # Get the question and check the answer
    question = db.query(Question).filter(
        Question.id == req.question_id,
        Question.quiz_id == battle.quiz_id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found in this battle's quiz")

    is_correct = req.answer == question.correct_answer

    # Build answer record
    answer_record = {
        "question_id": req.question_id,
        "answer": req.answer,
        "is_correct": is_correct,
    }

    # Update the appropriate player's answers and score
    if is_host:
        # Check if already answered this question
        existing_answers = battle.host_answers or []
        if any(a["question_id"] == req.question_id for a in existing_answers):
            raise HTTPException(status_code=400, detail="Already answered this question")
        existing_answers.append(answer_record)
        battle.host_answers = existing_answers
        if is_correct:
            battle.host_score = (battle.host_score or 0) + 1
    else:
        existing_answers = battle.opponent_answers or []
        if any(a["question_id"] == req.question_id for a in existing_answers):
            raise HTTPException(status_code=400, detail="Already answered this question")
        existing_answers.append(answer_record)
        battle.opponent_answers = existing_answers
        if is_correct:
            battle.opponent_score = (battle.opponent_score or 0) + 1

    # Check if battle is complete (both players answered all questions)
    total_questions = db.query(Question).filter(Question.quiz_id == battle.quiz_id).count()
    host_done = len(battle.host_answers or []) >= total_questions
    opponent_done = len(battle.opponent_answers or []) >= total_questions

    if host_done and opponent_done:
        battle.status = "completed"
        battle.completed_at = func.now()

    db.commit()
    db.refresh(battle)

    return {
        "is_correct": is_correct,
        "correct_answer": question.correct_answer,
        "host_score": battle.host_score,
        "opponent_score": battle.opponent_score,
        "status": battle.status,
        "host_answers_count": len(battle.host_answers or []),
        "opponent_answers_count": len(battle.opponent_answers or []),
    }
