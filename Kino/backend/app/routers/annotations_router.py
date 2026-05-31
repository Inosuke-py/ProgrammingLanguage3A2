from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Annotation
from app.auth import get_current_user

router = APIRouter(prefix="/annotations", tags=["annotations"])


class CreateAnnotationRequest(BaseModel):
    material_id: str
    page_number: int
    type: str  # "highlight" or "note"
    content: str | None = None
    selected_text: str | None = None
    position: dict | None = None
    color: str = "brand"


class UpdateAnnotationRequest(BaseModel):
    content: str | None = None
    color: str | None = None


@router.post("/")
async def create_annotation(
    request: CreateAnnotationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a highlight or note annotation."""
    annotation = Annotation(
        user_id=current_user.id,
        material_id=request.material_id,
        page_number=request.page_number,
        type=request.type,
        content=request.content,
        selected_text=request.selected_text,
        position=request.position,
        color=request.color,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)

    return {
        "id": annotation.id,
        "page_number": annotation.page_number,
        "type": annotation.type,
        "content": annotation.content,
        "selected_text": annotation.selected_text,
        "position": annotation.position,
        "color": annotation.color,
    }


@router.get("/material/{material_id}")
async def get_annotations(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all annotations for a material."""
    annotations = (
        db.query(Annotation)
        .filter(Annotation.material_id == material_id, Annotation.user_id == current_user.id)
        .order_by(Annotation.page_number, Annotation.created_at)
        .all()
    )
    return [
        {
            "id": a.id,
            "page_number": a.page_number,
            "type": a.type,
            "content": a.content,
            "selected_text": a.selected_text,
            "position": a.position,
            "color": a.color,
            "created_at": a.created_at.isoformat(),
        }
        for a in annotations
    ]


@router.put("/{annotation_id}")
async def update_annotation(
    annotation_id: str,
    request: UpdateAnnotationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an annotation."""
    annotation = (
        db.query(Annotation)
        .filter(Annotation.id == annotation_id, Annotation.user_id == current_user.id)
        .first()
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if request.content is not None:
        annotation.content = request.content
    if request.color is not None:
        annotation.color = request.color

    db.commit()
    return {"ok": True}


@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an annotation."""
    annotation = (
        db.query(Annotation)
        .filter(Annotation.id == annotation_id, Annotation.user_id == current_user.id)
        .first()
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    db.delete(annotation)
    db.commit()
    return {"ok": True}
