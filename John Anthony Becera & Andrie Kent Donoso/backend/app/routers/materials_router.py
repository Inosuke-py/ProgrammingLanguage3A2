import os
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Form, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import get_settings
from app.database import get_db, SessionLocal
from app.models import User, Material, Section, QuestionPool
from app.auth import get_current_user
from app.rate_limit import limiter
from app.services.pdf_parser import parse_pdf
from app.services.pptx_parser import parse_pptx
from app.services.docx_parser import parse_docx
from app.services.doc_converter import convert_to_pdf
from app.services.content_validator import validate_content

router = APIRouter(prefix="/materials", tags=["materials"])
settings = get_settings()


# Upload limits & filename safety
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]")


def _safe_filename(name: str) -> str:
    """Strip path components and unsafe characters from an uploaded filename."""
    # Drop any directory parts the client might inject
    base = os.path.basename(name)
    # Replace anything that isn't alnum, dot, underscore, or hyphen
    cleaned = _FILENAME_SAFE_RE.sub("_", base)
    # Trim length
    cleaned = cleaned[:120]
    return cleaned or "upload.bin"


class MaterialResponse(BaseModel):
    id: str
    title: str
    file_type: str
    page_count: int | None
    processed: bool
    section_count: int
    created_at: str


async def _generate_pool_background(material_id: str):
    """Background task to generate question pool after upload."""
    from app.services.pool_generator import generate_pool_for_material
    db = SessionLocal()
    try:
        count = await generate_pool_for_material(material_id, db, target_count=40)
        # Mark material as pool_ready
        material = db.query(Material).filter(Material.id == material_id).first()
        if material:
            material.processed = True
            db.commit()
        print(f"Pool generated: {count} questions for material {material_id}")
    except Exception as e:
        print(f"Pool generation failed: {e}")
    finally:
        db.close()


@router.post("/upload")
@limiter.limit("5/minute")
async def upload_material(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    topic: str | None = Form(None),
    field: str | None = Form(None),
    classroom_id: str | None = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a study material (PDF, PPTX, or DOCX) and parse it into sections."""
    allowed_extensions = (".pdf", ".pptx", ".docx")
    if not file.filename or not file.filename.lower().endswith(allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail="Only PDF, PPTX, and DOCX files are supported",
        )

    # Sanitize filename — strip path traversal and unsafe characters
    safe_name = _safe_filename(file.filename)

    # Determine file type from extension
    ext = safe_name.rsplit(".", 1)[-1].lower()

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)
    upload_dir_abs = os.path.abspath(settings.upload_dir)

    # Save file with size cap (streaming to avoid OOM on large uploads)
    file_path = os.path.join(settings.upload_dir, f"{current_user.id}_{safe_name}")

    # Defense-in-depth: confirm the resolved path stays inside upload_dir
    resolved = os.path.abspath(file_path)
    if not resolved.startswith(upload_dir_abs + os.sep) and resolved != upload_dir_abs:
        raise HTTPException(status_code=400, detail="Invalid filename")

    total_bytes = 0
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)  # 1 MB chunks
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    f.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size is {MAX_UPLOAD_MB}MB.",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        # Clean up partial file on unexpected I/O error
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

    # Create material record
    material_title = title.strip() if title and title.strip() else safe_name.rsplit(".", 1)[0]
    material = Material(
        user_id=current_user.id,
        title=material_title,
        file_path=file_path,
        file_type=ext,
        topic=topic.strip() if topic and topic.strip() else None,
        field=field.strip() if field and field.strip() else None,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Parse file into sections based on type
    # For DOCX/PPTX: convert to PDF first, then parse the PDF
    if ext in ("docx", "pptx"):
        pdf_path = convert_to_pdf(file_path)
        if pdf_path:
            # Use the PDF for both viewing and parsing
            material.file_path = pdf_path
            material.file_type = "pdf"
            sections = parse_pdf(pdf_path)
        else:
            # Fallback: parse the original file directly (less reliable)
            if ext == "pptx":
                sections = parse_pptx(file_path)
            else:
                sections = parse_docx(file_path)
    elif ext == "pdf":
        sections = parse_pdf(file_path)
    else:
        sections = []

    material.page_count = sections[-1]["page_number"] if sections else 0

    # Validate content quality
    is_valid, validation_msg = validate_content(sections)
    if not is_valid:
        # Clean up: remove the saved file and material record
        if os.path.exists(file_path):
            os.remove(file_path)
        db.delete(material)
        db.commit()
        raise HTTPException(status_code=400, detail=validation_msg)

    for i, section_data in enumerate(sections):
        section = Section(
            material_id=material.id,
            title=section_data.get("title"),
            content=section_data["content"],
            page_number=section_data.get("page_number"),
            order_index=i,
        )
        db.add(section)

    material.processed = True
    db.commit()
    db.refresh(material)

    # Trigger background pool generation (only for personal materials, not classroom uploads)
    if not classroom_id:
        background_tasks.add_task(_generate_pool_background, material.id)

    # Check and award upload badges
    from app.routers.badges_router import check_upload_badges
    badges_earned = check_upload_badges(db, current_user)

    return {
        "id": material.id,
        "title": material.title,
        "page_count": material.page_count,
        "section_count": len(sections),
        "pool_status": "generating",
        "badges_earned": badges_earned,
    }


@router.get("/")
async def list_materials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all materials for the current user."""
    materials = (
        db.query(Material)
        .filter(Material.user_id == current_user.id)
        .order_by(Material.created_at.desc())
        .all()
    )
    return [
        {
            "id": m.id,
            "title": m.title,
            "file_type": m.file_type,
            "page_count": m.page_count,
            "processed": m.processed,
            "section_count": len(m.sections),
            "pool_count": db.query(QuestionPool).filter(QuestionPool.material_id == m.id).count(),
            "created_at": m.created_at.isoformat(),
        }
        for m in materials
    ]


@router.get("/{material_id}/pool-stats")
async def get_pool_stats(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get pool question counts per difficulty for a material."""
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.user_id == current_user.id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    from sqlalchemy import func as sqlfunc

    counts = (
        db.query(QuestionPool.difficulty, sqlfunc.count(QuestionPool.id))
        .filter(QuestionPool.material_id == material_id)
        .group_by(QuestionPool.difficulty)
        .all()
    )

    stats = {"easy": 0, "medium": 0, "hard": 0}
    for difficulty, count in counts:
        if difficulty in stats:
            stats[difficulty] = count

    total = sum(stats.values())

    return {
        "material_id": material_id,
        "total": total,
        "easy": stats["easy"],
        "medium": stats["medium"],
        "hard": stats["hard"],
    }


@router.get("/{material_id}")
async def get_material(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a material with its sections."""
    # Check ownership first
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.user_id == current_user.id)
        .first()
    )
    # If not owned, check if shared with user
    if not material:
        from app.models import SharedMaterial
        shared = db.query(SharedMaterial).filter(
            SharedMaterial.material_id == material_id,
            (SharedMaterial.shared_with_id == current_user.id) | (SharedMaterial.shared_with_email == current_user.email),
        ).first()
        if shared:
            material = db.query(Material).filter(Material.id == material_id).first()
    # Also allow if material is public
    if not material:
        material = db.query(Material).filter(Material.id == material_id, Material.is_public == True).first()
    # Also allow if material is assigned to a classroom the user is in
    if not material:
        from app.models import ClassroomAssignment, ClassroomStudent, Classroom
        # Check if user is a student in any classroom that has this material
        classroom_access = (
            db.query(ClassroomAssignment)
            .join(ClassroomStudent, ClassroomStudent.classroom_id == ClassroomAssignment.classroom_id)
            .filter(
                ClassroomAssignment.material_id == material_id,
                ClassroomStudent.student_id == current_user.id,
            )
            .first()
        )
        if not classroom_access:
            # Also check if user is the teacher of a classroom with this material
            classroom_access = (
                db.query(ClassroomAssignment)
                .join(Classroom, Classroom.id == ClassroomAssignment.classroom_id)
                .filter(
                    ClassroomAssignment.material_id == material_id,
                    Classroom.teacher_id == current_user.id,
                )
                .first()
            )
        if classroom_access:
            material = db.query(Material).filter(Material.id == material_id).first()

    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    return {
        "id": material.id,
        "title": material.title,
        "file_type": material.file_type,
        "page_count": material.page_count,
        "processed": material.processed,
        "last_read_page": material.last_read_page or 1,
        "created_at": material.created_at.isoformat(),
        "sections": [
            {
                "id": s.id,
                "title": s.title,
                "content": s.content,
                "page_number": s.page_number,
                "order_index": s.order_index,
            }
            for s in sorted(material.sections, key=lambda s: s.order_index)
        ],
    }


@router.put("/{material_id}/reading-progress")
async def update_reading_progress(
    material_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the user's reading progress (current page) for a material."""
    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.user_id == current_user.id)
        .first()
    )
    if not material:
        # For shared/public materials, just acknowledge without saving
        from app.models import SharedMaterial
        shared = db.query(SharedMaterial).filter(
            SharedMaterial.material_id == material_id,
            (SharedMaterial.shared_with_id == current_user.id) | (SharedMaterial.shared_with_email == current_user.email),
        ).first()
        public = db.query(Material).filter(Material.id == material_id, Material.is_public == True).first()
        if shared or public:
            return {"ok": True, "page": body.get("page", 1)}
        raise HTTPException(status_code=404, detail="Material not found")

    page = body.get("page", 1)
    if isinstance(page, int) and page >= 1:
        material.last_read_page = page
        db.commit()

    return {"ok": True, "page": material.last_read_page}


@router.delete("/{material_id}")
async def delete_material(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a material, its file, pool questions, and related quizzes.

    Refuses to delete (returns 409) if the material is currently assigned to
    one or more classrooms — the user must remove it from each classroom first.
    """
    from app.models import (
        ClassroomAssignment, SharedMaterial, Annotation, Flashcard, Classroom,
    )
    from sqlalchemy.exc import IntegrityError

    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.user_id == current_user.id)
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Block deletion when this material is still assigned to any classroom.
    # Surface the classroom names so the user knows where to remove it from.
    blocking_assignments = (
        db.query(ClassroomAssignment, Classroom)
        .join(Classroom, Classroom.id == ClassroomAssignment.classroom_id)
        .filter(ClassroomAssignment.material_id == material_id)
        .all()
    )
    if blocking_assignments:
        classroom_names = sorted({c.name for _, c in blocking_assignments})
        if len(classroom_names) == 1:
            msg = (
                f"This material is being used in classroom \"{classroom_names[0]}\". "
                "Remove it from the classroom before deleting."
            )
        else:
            shown = ", ".join(f'"{n}"' for n in classroom_names[:3])
            extra = f" and {len(classroom_names) - 3} more" if len(classroom_names) > 3 else ""
            msg = (
                f"This material is being used in {len(classroom_names)} classrooms ({shown}{extra}). "
                "Remove it from each classroom before deleting."
            )
        raise HTTPException(
            status_code=409,
            detail={
                "message": msg,
                "code": "material_in_classrooms",
                "classrooms": [
                    {"id": c.id, "name": c.name} for _, c in blocking_assignments
                ],
            },
        )

    # Safe to delete: clean up dependent rows that don't have CASCADE configured.
    db.query(QuestionPool).filter(QuestionPool.material_id == material_id).delete(synchronize_session=False)
    db.query(Annotation).filter(Annotation.material_id == material_id).delete(synchronize_session=False)
    db.query(Flashcard).filter(Flashcard.material_id == material_id).delete(synchronize_session=False)
    db.query(SharedMaterial).filter(SharedMaterial.material_id == material_id).delete(synchronize_session=False)

    # Remove file
    if material.file_path and os.path.exists(material.file_path):
        try:
            os.remove(material.file_path)
        except OSError:
            pass

    try:
        db.delete(material)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This material is still referenced elsewhere. Remove dependent items first.",
                "code": "material_has_dependencies",
            },
        )

    return {"ok": True}


@router.get("/{material_id}/file")
async def get_material_file(
    material_id: str,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    """Serve the PDF file for viewing."""
    from fastapi.responses import Response
    from jose import jwt, JWTError

    # Authenticate via query param token
    if not token:
        raise HTTPException(status_code=401, detail="Token required")

    try:
        from app.config import get_settings
        settings = get_settings()
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    material = (
        db.query(Material)
        .filter(Material.id == material_id, Material.user_id == user_id)
        .first()
    )
    # Also allow if shared with this user or public
    if not material:
        from app.models import SharedMaterial
        shared = db.query(SharedMaterial).filter(
            SharedMaterial.material_id == material_id,
            (SharedMaterial.shared_with_id == user_id),
        ).first()
        if shared:
            material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        material = db.query(Material).filter(Material.id == material_id, Material.is_public == True).first()
    # Also allow if material is in a classroom the user belongs to
    if not material:
        from app.models import ClassroomAssignment, ClassroomStudent, Classroom
        classroom_access = (
            db.query(ClassroomAssignment)
            .join(ClassroomStudent, ClassroomStudent.classroom_id == ClassroomAssignment.classroom_id)
            .filter(
                ClassroomAssignment.material_id == material_id,
                ClassroomStudent.student_id == user_id,
            )
            .first()
        )
        if not classroom_access:
            classroom_access = (
                db.query(ClassroomAssignment)
                .join(Classroom, Classroom.id == ClassroomAssignment.classroom_id)
                .filter(
                    ClassroomAssignment.material_id == material_id,
                    Classroom.teacher_id == user_id,
                )
                .first()
            )
        if classroom_access:
            material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    file_path = os.path.abspath(material.file_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    with open(file_path, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type="application/pdf",
    )
