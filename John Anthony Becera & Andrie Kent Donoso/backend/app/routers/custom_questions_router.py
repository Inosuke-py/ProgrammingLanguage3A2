from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Material, QuestionPool
from app.auth import get_current_user

router = APIRouter(prefix="/custom-questions", tags=["custom-questions"])


class CreateCustomQuestionRequest(BaseModel):
    material_id: str
    type: str = "mcq"  # "mcq" or "true_false"
    difficulty: str = "medium"
    content: str
    options: list[str]
    correct_answer: str
    explanation: str = ""


@router.post("/")
async def create_custom_question(
    request: CreateCustomQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a custom user-created question to the pool."""
    material = (
        db.query(Material)
        .filter(Material.id == request.material_id, Material.user_id == current_user.id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if request.correct_answer not in request.options:
        raise HTTPException(status_code=400, detail="correct_answer must be one of the options")

    if request.type not in ("mcq", "true_false"):
        raise HTTPException(status_code=400, detail="type must be mcq or true_false")

    pool_item = QuestionPool(
        material_id=request.material_id,
        section_id=None,
        type=request.type,
        difficulty=request.difficulty,
        content=request.content,
        options=request.options,
        correct_answer=request.correct_answer,
        explanation=request.explanation,
        source_text="[Custom question]",
    )
    db.add(pool_item)
    db.commit()
    db.refresh(pool_item)

    return {
        "id": pool_item.id,
        "content": pool_item.content,
        "type": pool_item.type,
        "difficulty": pool_item.difficulty,
    }


@router.get("/{material_id}")
async def list_custom_questions(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List custom questions for a material."""
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.user_id == current_user.id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    customs = (
        db.query(QuestionPool)
        .filter(QuestionPool.material_id == material_id, QuestionPool.source_text == "[Custom question]")
        .all()
    )
    return [
        {
            "id": q.id,
            "content": q.content,
            "type": q.type,
            "difficulty": q.difficulty,
            "options": q.options,
            "correct_answer": q.correct_answer,
        }
        for q in customs
    ]


@router.delete("/{question_id}")
async def delete_custom_question(
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a custom question."""
    question = db.query(QuestionPool).filter(
        QuestionPool.id == question_id,
        QuestionPool.source_text == "[Custom question]",
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Custom question not found")

    # Verify ownership via material
    material = db.query(Material).filter(
        Material.id == question.material_id,
        Material.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Not found")

    db.delete(question)
    db.commit()
    return {"ok": True}
