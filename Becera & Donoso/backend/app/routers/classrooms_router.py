import random
import string
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import (
    User, Material, Classroom, ClassroomStudent, ClassroomAssignment,
    ClassroomQuiz, ClassroomQuizAttempt,
    Attempt, Quiz, Question, QuestionPool, Answer,
)
from app.auth import get_current_user

router = APIRouter(prefix="/classrooms", tags=["classrooms"])


# ===== Helpers =====

def generate_join_code(db: Session) -> str:
    """Generate a unique 6-character join code."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        existing = db.query(Classroom).filter(Classroom.join_code == code).first()
        if not existing:
            return code


def generate_invite_token(db: Session) -> str:
    """Generate a unique 12-character invite link token."""
    while True:
        token = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
        existing = db.query(Classroom).filter(Classroom.invite_link_token == token).first()
        if not existing:
            return token


def get_classroom_or_404(db: Session, classroom_id: str) -> Classroom:
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return classroom


def require_teacher(classroom: Classroom, user: User):
    if classroom.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="Only the teacher can perform this action")


def require_student_or_teacher(classroom: Classroom, user: User, db: Session):
    if classroom.teacher_id == user.id:
        return "teacher"
    enrollment = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom.id,
        ClassroomStudent.student_id == user.id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not a member of this classroom")
    return "student"


# ===== Request Models =====

class CreateClassroomRequest(BaseModel):
    name: str
    is_public: bool = False


class JoinClassroomRequest(BaseModel):
    code: Optional[str] = None
    token: Optional[str] = None
    classroom_id: Optional[str] = None  # For joining public classrooms directly


class AddMaterialRequest(BaseModel):
    material_id: str


class CreateClassroomQuizRequest(BaseModel):
    title: str
    material_id: str
    question_count: int = 10
    difficulty: str = "mixed"  # "easy", "medium", "hard", "mixed"
    question_types: list[str] = ["mcq", "true_false"]
    time_pressure: bool = False
    time_per_question: Optional[int] = None  # seconds
    expires_at: Optional[str] = None  # ISO datetime string
    # ── Source scoping ───────────────────────────────────────────────────────
    # Teachers can narrow the AI's source material to a page range or specific
    # sections. If both are unset, the whole material is used (current behavior).
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    section_ids: Optional[list[str]] = None


class UpdateClassroomQuizRequest(BaseModel):
    title: Optional[str] = None
    expires_at: Optional[str] = None  # ISO datetime string or null
    is_published: Optional[bool] = None


class EditQuestionRequest(BaseModel):
    content: Optional[str] = None
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None


class InviteByEmailRequest(BaseModel):
    email: str


# ===== Teacher Endpoints =====

@router.post("/")
async def create_classroom(
    req: CreateClassroomRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher creates a classroom with a generated join code and invite link token."""
    join_code = generate_join_code(db)
    invite_token = generate_invite_token(db)

    classroom = Classroom(
        teacher_id=current_user.id,
        name=req.name,
        join_code=join_code,
        invite_link_token=invite_token,
        is_public=req.is_public,
    )
    db.add(classroom)
    db.commit()
    db.refresh(classroom)

    return {
        "id": classroom.id,
        "name": classroom.name,
        "join_code": classroom.join_code,
        "invite_link_token": classroom.invite_link_token,
        "invite_link": f"/classrooms/join?token={classroom.invite_link_token}",
        "teacher_id": classroom.teacher_id,
        "created_at": classroom.created_at,
    }


@router.get("/aggregate-stats")
async def get_classroom_aggregate_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get aggregate stats across all user's classrooms for the hero section."""
    from app.services.ws_manager import manager
    from app.models import ClassroomActivity
    from datetime import timedelta

    # Get all classrooms the user is part of
    taught_list = db.query(Classroom).filter(Classroom.teacher_id == current_user.id).all()
    enrollments_list = db.query(ClassroomStudent).filter(ClassroomStudent.student_id == current_user.id).all()
    joined_ids_list = [e.classroom_id for e in enrollments_list]
    all_classroom_ids = [c.id for c in taught_list] + joined_ids_list

    if not all_classroom_ids:
        return {
            "total_classrooms": 0,
            "total_students": 0,
            "total_online": 0,
            "quizzes_this_week": 0,
            "online_per_classroom": {},
        }

    # Total students across all classrooms
    total_students = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id.in_(all_classroom_ids)
    ).count()

    # Online counts per classroom
    online_per_classroom = {}
    total_online = 0
    for cid in all_classroom_ids:
        count = manager.get_room_online_count(cid)
        online_per_classroom[cid] = count
        total_online += count

    # Quizzes completed this week across all classrooms
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    quizzes_this_week = 0
    for cid in all_classroom_ids:
        cq_list = db.query(ClassroomQuiz).filter(ClassroomQuiz.classroom_id == cid).all()
        for cq in cq_list:
            count = db.query(ClassroomQuizAttempt).filter(
                ClassroomQuizAttempt.classroom_quiz_id == cq.id,
                ClassroomQuizAttempt.completed_at >= week_ago,
            ).count()
            quizzes_this_week += count

    return {
        "total_classrooms": len(all_classroom_ids),
        "total_students": total_students,
        "total_online": total_online,
        "quizzes_this_week": quizzes_this_week,
        "online_per_classroom": online_per_classroom,
    }


@router.get("/{classroom_id}")
async def get_classroom_detail(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get classroom detail with enriched stats for Phase 1 UI."""
    classroom = get_classroom_or_404(db, classroom_id)
    role = require_student_or_teacher(classroom, current_user, db)

    # Students with enriched data
    students_entries = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id
    ).all()
    students = []
    total_classroom_xp = 0
    for entry in students_entries:
        student = db.query(User).filter(User.id == entry.student_id).first()
        if student:
            # Count quizzes completed in this classroom
            student_quiz_count = 0
            classroom_quizzes_all = db.query(ClassroomQuiz).filter(
                ClassroomQuiz.classroom_id == classroom_id
            ).all()
            for cq in classroom_quizzes_all:
                count = db.query(ClassroomQuizAttempt).filter(
                    ClassroomQuizAttempt.classroom_quiz_id == cq.id,
                    ClassroomQuizAttempt.student_id == student.id,
                    ClassroomQuizAttempt.completed_at.isnot(None),
                ).count()
                student_quiz_count += count

            total_classroom_xp += student.xp
            students.append({
                "id": student.id,
                "name": student.name,
                "email": student.email,
                "picture": student.picture,
                "xp": student.xp,
                "level": student.level,
                "streak": student.streak,
                "quiz_count": student_quiz_count,
                "joined_at": entry.joined_at.isoformat() if entry.joined_at else None,
            })

    # Sort students by XP descending
    students.sort(key=lambda s: s["xp"], reverse=True)

    # Materials with pool stats
    assignments = db.query(ClassroomAssignment).filter(
        ClassroomAssignment.classroom_id == classroom_id
    ).all()
    materials = []
    for a in assignments:
        mat = db.query(Material).filter(Material.id == a.material_id).first()
        if mat:
            pool_count = db.query(QuestionPool).filter(QuestionPool.material_id == mat.id).count()
            section_count = len(mat.sections) if mat.sections else 0
            materials.append({
                "id": mat.id,
                "title": mat.title,
                "file_type": mat.file_type,
                "page_count": mat.page_count,
                "section_count": section_count,
                "pool_count": pool_count,
                "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            })

    # Quizzes with completion stats
    classroom_quizzes = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.classroom_id == classroom_id
    ).order_by(ClassroomQuiz.created_at.desc()).all()
    quizzes = []
    total_completions = 0
    all_scores = []
    for cq in classroom_quizzes:
        # Count completions and avg score for this quiz
        attempts = db.query(ClassroomQuizAttempt).filter(
            ClassroomQuizAttempt.classroom_quiz_id == cq.id,
            ClassroomQuizAttempt.completed_at.isnot(None),
        ).all()
        completion_count = len(attempts)
        total_completions += completion_count
        quiz_scores = []
        for cqa in attempts:
            attempt = db.query(Attempt).filter(Attempt.id == cqa.attempt_id).first()
            if attempt and attempt.score is not None:
                quiz_scores.append(attempt.score)
                all_scores.append(attempt.score)

        avg_score = round(sum(quiz_scores) / len(quiz_scores), 1) if quiz_scores else None

        # Check if current user has already attempted this quiz (started or completed)
        # Classroom quizzes are one-take-only, so any attempt means it's done
        my_attempt = db.query(ClassroomQuizAttempt).filter(
            ClassroomQuizAttempt.classroom_quiz_id == cq.id,
            ClassroomQuizAttempt.student_id == current_user.id,
        ).first()

        quizzes.append({
            "id": cq.id,
            "title": cq.title,
            "config": cq.config,
            "is_published": cq.is_published,
            "expires_at": cq.expires_at.isoformat() if cq.expires_at else None,
            "created_at": cq.created_at.isoformat() if cq.created_at else None,
            "completion_count": completion_count,
            "student_count": len(students),
            "avg_score": avg_score,
            "my_completed": my_attempt is not None,
        })

    # Classroom-wide stats
    avg_accuracy = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0

    teacher = db.query(User).filter(User.id == classroom.teacher_id).first()

    return {
        "id": classroom.id,
        "name": classroom.name,
        "join_code": classroom.join_code if role == "teacher" else None,
        "invite_link_token": classroom.invite_link_token if role == "teacher" else None,
        "teacher": {"id": teacher.id, "name": teacher.name, "picture": teacher.picture} if teacher else None,
        "role": role,
        "student_count": len(students),
        "students": students,
        "materials": materials,
        "quizzes": quizzes,
        "stats": {
            "total_xp": total_classroom_xp,
            "total_completions": total_completions,
            "avg_accuracy": avg_accuracy,
            "total_materials": len(materials),
            "total_quizzes": len(quizzes),
            "classroom_level": classroom.level,
            "classroom_xp": classroom.xp,
            "classroom_xp_for_next": classroom_xp_for_level(classroom.level),
        },
        "created_at": classroom.created_at.isoformat() if classroom.created_at else None,
    }


@router.post("/{classroom_id}/materials")
async def add_material(
    classroom_id: str,
    req: AddMaterialRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher adds a material to the classroom."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    material = db.query(Material).filter(Material.id == req.material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Check if already assigned
    existing = db.query(ClassroomAssignment).filter(
        ClassroomAssignment.classroom_id == classroom_id,
        ClassroomAssignment.material_id == req.material_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Material already added to this classroom")

    assignment = ClassroomAssignment(
        classroom_id=classroom_id,
        material_id=req.material_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "id": assignment.id,
        "classroom_id": assignment.classroom_id,
        "material_id": assignment.material_id,
        "material_title": material.title,
        "assigned_at": assignment.assigned_at,
    }


@router.get("/{classroom_id}/materials/{material_id}/sections")
async def list_classroom_material_sections(
    classroom_id: str,
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Slim section list for the quiz creation UI.

    Returns just enough metadata to populate the page-range and section-picker
    controls — no heavy `content` payload. Teacher-only since it's a quiz
    setup helper.
    """
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    # Confirm the material is actually attached to this classroom
    assignment = (
        db.query(ClassroomAssignment)
        .filter(
            ClassroomAssignment.classroom_id == classroom_id,
            ClassroomAssignment.material_id == material_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Material not attached to this classroom")

    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    sections = sorted(material.sections, key=lambda s: s.order_index)

    return {
        "material_id": material.id,
        "title": material.title,
        "file_type": material.file_type,
        "page_count": material.page_count,
        "sections": [
            {
                "id": s.id,
                "title": s.title,
                "page_number": s.page_number,
                "order_index": s.order_index,
                # Quick preview so teachers can recognize a section without opening the file
                "preview": (s.content or "")[:120].strip(),
            }
            for s in sections
        ],
    }


@router.post("/{classroom_id}/quizzes")
async def create_classroom_quiz(
    classroom_id: str,
    req: CreateClassroomQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher creates a quiz with freshly AI-generated questions based on selected types."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    # Verify material exists and is processed
    material = db.query(Material).filter(Material.id == req.material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    if not material.processed:
        raise HTTPException(status_code=400, detail="Material not yet processed")

    # Build material text for AI
    sections = sorted(material.sections, key=lambda s: s.order_index)
    if not sections:
        raise HTTPException(status_code=400, detail="Material has no content sections")

    # ── Apply source scope ─────────────────────────────────────────────────
    # The teacher may scope the AI's source to either specific sections OR a
    # page range. They can't do both — if both are sent, section_ids wins
    # because it's the more explicit choice.
    scope_label: Optional[str] = None  # human-readable, stored on the config

    if req.section_ids:
        section_id_set = set(req.section_ids)
        scoped_sections = [s for s in sections if s.id in section_id_set]
        if not scoped_sections:
            raise HTTPException(
                status_code=400,
                detail="None of the selected sections were found in this material.",
            )
        sections = scoped_sections
        if len(scoped_sections) == 1:
            s0 = scoped_sections[0]
            scope_label = f"Section: {s0.title or f'Page {s0.page_number}'}"
        else:
            scope_label = f"{len(scoped_sections)} sections"
    elif req.page_start is not None or req.page_end is not None:
        page_start = req.page_start if req.page_start is not None else 1
        page_end = req.page_end if req.page_end is not None else (material.page_count or 99999)
        if page_start > page_end:
            raise HTTPException(
                status_code=400,
                detail=f"Page start ({page_start}) cannot be greater than page end ({page_end}).",
            )
        scoped_sections = [
            s for s in sections
            if s.page_number is not None and page_start <= s.page_number <= page_end
        ]
        if not scoped_sections:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No content found between pages {page_start} and {page_end}. "
                    "Try widening the range."
                ),
            )
        sections = scoped_sections
        scope_label = (
            f"Pages {page_start}-{page_end}" if page_start != page_end
            else f"Page {page_start}"
        )

    material_text = ""
    for section in sections:
        chunk = section.content[:800]
        header = section.title or f"Page {section.page_number}"
        material_text += f"\n\n--- {header} ---\n{chunk}"
        if len(material_text) > 5000:
            break

    if not material_text.strip():
        raise HTTPException(
            status_code=400,
            detail="The selected scope has no readable content. Try a different range or section.",
        )

    # Build type descriptions for the prompt
    type_descriptions = {
        "mcq": 'MCQ: {"type":"mcq","content":"question?","options":["A","B","C","D"],"correct_answer":"A","explanation":"why"}',
        "true_false": 'True/False: {"type":"true_false","content":"statement.","options":["True","False"],"correct_answer":"True","explanation":"why"}',
        "fill_blank": 'Fill Blank: {"type":"fill_blank","content":"The ___ does X.","options":["answer","wrong1","wrong2","wrong3"],"correct_answer":"answer","explanation":"why"}',
        "matching": 'Matching: {"type":"matching","content":"Match terms","options":["Term1 - Def1","Term2 - Def2","Term3 - Def3","Term4 - Def4"],"correct_answer":"Term1 - Def1","explanation":"correct pairings"}',
        "ordering": 'Ordering: {"type":"ordering","content":"Arrange in order","options":["Step 1","Step 2","Step 3","Step 4"],"correct_answer":"Step 1","explanation":"sequence as listed"}',
    }

    selected_type_descs = "\n".join(type_descriptions[t] for t in req.question_types if t in type_descriptions)
    difficulty_desc = {
        "easy": "Easy: recall facts and definitions directly from the text",
        "medium": "Medium: understand relationships and apply concepts",
        "hard": "Hard: analyze, evaluate, and synthesize multiple ideas",
        "mixed": "Mix of easy, medium, and hard questions",
    }.get(req.difficulty, "Mixed difficulty")

    # Build strict type instruction
    type_names = ", ".join(req.question_types)
    over_generate = req.question_count + 5  # Ask for extra to account for validation failures

    prompt = f"""Generate exactly {over_generate} quiz questions from this study material.

CRITICAL: You MUST ONLY use these question types: {type_names}
Do NOT generate any other type. Every single question must be one of: {type_names}

Respond with a JSON object: {{"questions": [...]}}

Allowed formats:
{selected_type_descs}

Rules:
- EVERY question type field MUST be one of: {type_names}
- correct_answer MUST exactly match one of the options (character for character)
- {difficulty_desc}
- Each question tests a different concept from the material
- Questions must be directly answerable from the material provided
- Do NOT use "mcq" type unless it is in the allowed list above

STUDY MATERIAL:
{material_text.strip()}

Respond with ONLY the JSON object. Start with {{ immediately."""

    # Call AI
    from app.services.ai_client import generate_json
    result = await generate_json(prompt, temperature=0.7, max_tokens=8000)

    if not result:
        raise HTTPException(status_code=503, detail="AI generation failed. Please try again in a moment.")

    questions_data = result if isinstance(result, list) else result.get("questions", []) if isinstance(result, dict) else []

    if not questions_data:
        raise HTTPException(status_code=503, detail="AI returned no questions. Please try again.")

    # Validate and create quiz
    quiz = Quiz(
        material_id=material.id,
        user_id=current_user.id,
        title=req.title,
        question_count=req.question_count,
        config={
            "question_types": req.question_types,
            "difficulty": req.difficulty,
            "time_pressure": req.time_pressure,
            "time_per_question": req.time_per_question,
            "classroom_quiz": True,
            "generated_fresh": True,
        },
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    # Validate and store questions
    stored = 0
    for i, q in enumerate(questions_data):
        if stored >= req.question_count:
            break

        content = q.get("content") or q.get("question") or ""
        options = q.get("options") or []
        correct = q.get("correct_answer") or q.get("answer") or ""

        if not content or not options or not correct:
            continue
        if correct not in options:
            # Try to match by stripping whitespace
            stripped = [o.strip() for o in options]
            if correct.strip() in stripped:
                correct = options[stripped.index(correct.strip())]
            else:
                continue

        qtype = q.get("type", "mcq")
        if qtype not in ("mcq", "true_false", "fill_blank", "matching", "ordering"):
            qtype = "true_false" if len(options) == 2 else "mcq"

        # Strict type filter: reject questions not matching selected types
        if qtype not in req.question_types:
            continue

        question = Question(
            quiz_id=quiz.id,
            section_id=None,
            type=qtype,
            content=content,
            options=options,
            correct_answer=correct,
            explanation=q.get("explanation", ""),
            source_text=q.get("source_text", ""),
            order_index=stored,
        )
        db.add(question)
        stored += 1

    # Update actual question count
    quiz.question_count = stored
    db.commit()

    if stored == 0:
        db.delete(quiz)
        db.commit()
        raise HTTPException(status_code=503, detail="AI generated questions but none passed validation. Please try again.")

    # Parse expires_at
    expires_at = None
    if req.expires_at:
        try:
            expires_at = datetime.fromisoformat(req.expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format. Use ISO 8601.")

    # Create ClassroomQuiz
    classroom_quiz = ClassroomQuiz(
        classroom_id=classroom_id,
        quiz_id=quiz.id,
        title=req.title,
        created_by=current_user.id,
        config={
            "question_count": stored,
            "difficulty": req.difficulty,
            "types": req.question_types,
            "time_pressure": req.time_pressure,
            "time_per_question": req.time_per_question,
            # Source scoping — surfaced in the UI so teachers + students know
            # which part of the material the questions came from.
            "page_start": req.page_start,
            "page_end": req.page_end,
            "section_ids": req.section_ids,
            "scope_label": scope_label,
        },
        expires_at=expires_at,
        is_published=False,
    )
    db.add(classroom_quiz)
    db.commit()
    db.refresh(classroom_quiz)

    # Broadcast quiz created event via WebSocket
    try:
        from app.services.ws_manager import manager
        await manager.broadcast_to_room(classroom_id, "quiz_created", {
            "quiz_id": classroom_quiz.id,
            "title": classroom_quiz.title,
        })
    except Exception:
        pass

    return {
        "id": classroom_quiz.id,
        "quiz_id": quiz.id,
        "title": classroom_quiz.title,
        "question_count": stored,
        "config": classroom_quiz.config,
        "expires_at": classroom_quiz.expires_at,
        "is_published": classroom_quiz.is_published,
        "created_at": classroom_quiz.created_at,
    }


@router.get("/{classroom_id}/quizzes/{quiz_id}")
async def get_classroom_quiz_detail(
    classroom_id: str,
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher gets quiz with all questions and answers for review."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    classroom_quiz = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.id == quiz_id,
        ClassroomQuiz.classroom_id == classroom_id,
    ).first()
    if not classroom_quiz:
        raise HTTPException(status_code=404, detail="Classroom quiz not found")

    # Get the underlying quiz with questions
    quiz = db.query(Quiz).filter(Quiz.id == classroom_quiz.quiz_id).first()
    questions = sorted(quiz.questions, key=lambda q: q.order_index) if quiz else []

    question_list = []
    for q in questions:
        question_list.append({
            "id": q.id,
            "type": q.type,
            "content": q.content,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
            "source_text": q.source_text,
            "order_index": q.order_index,
        })

    return {
        "id": classroom_quiz.id,
        "quiz_id": classroom_quiz.quiz_id,
        "title": classroom_quiz.title,
        "config": classroom_quiz.config,
        "is_published": classroom_quiz.is_published,
        "expires_at": classroom_quiz.expires_at,
        "created_at": classroom_quiz.created_at,
        "questions": question_list,
    }


@router.get("/{classroom_id}/quizzes/{quiz_id}/results")
async def get_classroom_quiz_results(
    classroom_id: str,
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher views all student submissions for a classroom quiz with detailed answers."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    classroom_quiz = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.id == quiz_id,
        ClassroomQuiz.classroom_id == classroom_id,
    ).first()
    if not classroom_quiz:
        raise HTTPException(status_code=404, detail="Classroom quiz not found")

    # Get the underlying quiz with questions
    quiz = db.query(Quiz).filter(Quiz.id == classroom_quiz.quiz_id).first()
    questions = sorted(quiz.questions, key=lambda q: q.order_index) if quiz else []

    # Get all student attempts (only completed ones, one per student)
    cq_attempts = db.query(ClassroomQuizAttempt).filter(
        ClassroomQuizAttempt.classroom_quiz_id == classroom_quiz.id,
        ClassroomQuizAttempt.completed_at.isnot(None),
    ).all()

    # Deduplicate: keep only the latest attempt per student
    student_latest: dict = {}
    for cqa in cq_attempts:
        sid = cqa.student_id
        if sid not in student_latest or (cqa.completed_at and (not student_latest[sid].completed_at or cqa.completed_at > student_latest[sid].completed_at)):
            student_latest[sid] = cqa

    students_results = []
    for cqa in student_latest.values():
        student = db.query(User).filter(User.id == cqa.student_id).first()
        attempt = db.query(Attempt).filter(Attempt.id == cqa.attempt_id).first()
        if not student or not attempt:
            continue

        # Get student's answers
        from app.models import Answer as AnswerModel
        answers = db.query(AnswerModel).filter(AnswerModel.attempt_id == attempt.id).all()
        answer_map = {a.question_id: a for a in answers}

        student_answers = []
        for q in questions:
            ans = answer_map.get(q.id)
            student_answers.append({
                "question_id": q.id,
                "question_content": q.content,
                "question_type": q.type,
                "options": q.options,
                "correct_answer": q.correct_answer,
                "student_answer": ans.user_answer if ans else None,
                "is_correct": ans.is_correct if ans else None,
                "time_taken": ans.time_taken if ans else None,
            })

        students_results.append({
            "student_id": student.id,
            "student_name": student.name,
            "student_picture": student.picture,
            "score": attempt.score,
            "correct_count": attempt.correct_count,
            "total_questions": attempt.total_questions,
            "completed_at": cqa.completed_at.isoformat() if cqa.completed_at else None,
            "answers": student_answers,
        })

    # Sort by score descending
    students_results.sort(key=lambda x: x["score"] or 0, reverse=True)

    return {
        "quiz_title": classroom_quiz.title,
        "config": classroom_quiz.config,
        "total_students": len(db.query(ClassroomStudent).filter(ClassroomStudent.classroom_id == classroom_id).all()),
        "submitted_count": len(students_results),
        "questions": [{"id": q.id, "content": q.content, "type": q.type, "correct_answer": q.correct_answer} for q in questions],
        "students": students_results,
    }


@router.put("/{classroom_id}/quizzes/{quiz_id}")
async def update_classroom_quiz(
    classroom_id: str,
    quiz_id: str,
    req: UpdateClassroomQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Modify quiz: edit title, change expiry, publish/unpublish."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    classroom_quiz = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.id == quiz_id,
        ClassroomQuiz.classroom_id == classroom_id,
    ).first()
    if not classroom_quiz:
        raise HTTPException(status_code=404, detail="Classroom quiz not found")

    if req.title is not None:
        classroom_quiz.title = req.title

    if req.expires_at is not None:
        try:
            classroom_quiz.expires_at = datetime.fromisoformat(req.expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format. Use ISO 8601.")

    if req.is_published is not None:
        classroom_quiz.is_published = req.is_published

    db.commit()
    db.refresh(classroom_quiz)

    # Broadcast via WebSocket when quiz is published
    if req.is_published:
        try:
            from app.services.ws_manager import manager
            await manager.broadcast_to_room(classroom_id, "quiz_published", {
                "quiz_id": classroom_quiz.id,
                "title": classroom_quiz.title,
            })
        except Exception:
            pass

        # Create persistent notifications for students
        try:
            from app.services.notify import notify_classroom
            await notify_classroom(
                db, classroom_id,
                type="quiz_published",
                title=f"New quiz: {classroom_quiz.title}",
                body=f"A new quiz is available in {classroom.name}. Complete it before it expires.",
                link=f"/classrooms/{classroom_id}",
                meta={"classroom_id": classroom_id, "quiz_id": classroom_quiz.id},
                exclude_user=current_user.id,
            )
        except Exception:
            pass

    return {
        "id": classroom_quiz.id,
        "title": classroom_quiz.title,
        "is_published": classroom_quiz.is_published,
        "expires_at": classroom_quiz.expires_at,
    }


@router.put("/{classroom_id}/quizzes/{quiz_id}/questions/{question_id}")
async def edit_quiz_question(
    classroom_id: str,
    quiz_id: str,
    question_id: str,
    req: EditQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a specific question in a classroom quiz."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    classroom_quiz = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.id == quiz_id,
        ClassroomQuiz.classroom_id == classroom_id,
    ).first()
    if not classroom_quiz:
        raise HTTPException(status_code=404, detail="Classroom quiz not found")

    question = db.query(Question).filter(
        Question.id == question_id,
        Question.quiz_id == classroom_quiz.quiz_id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found in this quiz")

    if req.content is not None:
        question.content = req.content
    if req.options is not None:
        question.options = req.options
    if req.correct_answer is not None:
        question.correct_answer = req.correct_answer
    if req.explanation is not None:
        question.explanation = req.explanation

    db.commit()
    db.refresh(question)

    return {
        "id": question.id,
        "content": question.content,
        "options": question.options,
        "correct_answer": question.correct_answer,
        "explanation": question.explanation,
    }


@router.post("/{classroom_id}/invite")
async def invite_by_email(
    classroom_id: str,
    req: InviteByEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher invites a student by email. If user exists, auto-add to classroom."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    # Look up user by email
    invited_user = db.query(User).filter(User.email == req.email).first()

    if not invited_user:
        return {
            "status": "pending",
            "message": f"No account found for {req.email}. They will be able to join using the invite link or code.",
            "invite_link": f"/classrooms/join?token={classroom.invite_link_token}",
            "join_code": classroom.join_code,
        }

    # Check if already enrolled
    existing = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id,
        ClassroomStudent.student_id == invited_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student already in this classroom")

    if invited_user.id == classroom.teacher_id:
        raise HTTPException(status_code=400, detail="Cannot invite yourself to your own classroom")

    # Auto-add the student
    student_entry = ClassroomStudent(
        classroom_id=classroom_id,
        student_id=invited_user.id,
    )
    db.add(student_entry)
    db.commit()

    return {
        "status": "added",
        "message": f"{invited_user.name} has been added to the classroom.",
        "student": {
            "id": invited_user.id,
            "name": invited_user.name,
            "email": invited_user.email,
        },
    }


@router.get("/{classroom_id}/leaderboard")
async def get_classroom_leaderboard(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Classroom leaderboard: students ranked by correct answers from classroom quizzes."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_student_or_teacher(classroom, current_user, db)

    # Get all classroom quiz IDs for this classroom
    classroom_quizzes = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.classroom_id == classroom_id
    ).all()

    # Get all attempts linked to classroom quizzes
    leaderboard = []
    students_entries = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id
    ).all()

    for entry in students_entries:
        student = db.query(User).filter(User.id == entry.student_id).first()
        if not student:
            continue

        total_correct = 0
        total_questions = 0
        attempt_count = 0

        for cq in classroom_quizzes:
            cq_attempts = db.query(ClassroomQuizAttempt).filter(
                ClassroomQuizAttempt.classroom_quiz_id == cq.id,
                ClassroomQuizAttempt.student_id == student.id,
                ClassroomQuizAttempt.completed_at.isnot(None),
            ).all()

            for cqa in cq_attempts:
                attempt = db.query(Attempt).filter(Attempt.id == cqa.attempt_id).first()
                if attempt:
                    total_correct += attempt.correct_count or 0
                    total_questions += attempt.total_questions or 0
                    attempt_count += 1

        leaderboard.append({
            "student_id": student.id,
            "student_name": student.name,
            "total_correct": total_correct,
            "total_questions": total_questions,
            "attempt_count": attempt_count,
            "accuracy": round((total_correct / total_questions * 100), 1) if total_questions > 0 else 0,
        })

    # Sort by total_correct descending
    leaderboard.sort(key=lambda x: x["total_correct"], reverse=True)

    # Add rank
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    return {
        "classroom_id": classroom_id,
        "classroom_name": classroom.name,
        "leaderboard": leaderboard,
    }


@router.get("/{classroom_id}/progress")
async def get_classroom_progress(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher sees all students' attempts on classroom quizzes."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    students_entries = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id
    ).all()

    classroom_quizzes = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.classroom_id == classroom_id
    ).all()

    students_progress = []
    for entry in students_entries:
        student = db.query(User).filter(User.id == entry.student_id).first()
        if not student:
            continue

        student_attempts = []
        for cq in classroom_quizzes:
            cq_attempts = db.query(ClassroomQuizAttempt).filter(
                ClassroomQuizAttempt.classroom_quiz_id == cq.id,
                ClassroomQuizAttempt.student_id == student.id,
            ).all()

            for cqa in cq_attempts:
                attempt = db.query(Attempt).filter(Attempt.id == cqa.attempt_id).first()
                if attempt:
                    student_attempts.append({
                        "classroom_quiz_id": cq.id,
                        "classroom_quiz_title": cq.title,
                        "attempt_id": attempt.id,
                        "score": attempt.score,
                        "correct_count": attempt.correct_count,
                        "total_questions": attempt.total_questions,
                        "started_at": cqa.started_at,
                        "completed_at": cqa.completed_at,
                    })

        students_progress.append({
            "student_id": student.id,
            "student_name": student.name,
            "student_email": student.email,
            "attempts": student_attempts,
            "total_attempts": len(student_attempts),
            "average_score": (
                round(sum(a["score"] for a in student_attempts if a["score"] is not None) / len(student_attempts), 1)
                if student_attempts else 0
            ),
        })

    return {
        "classroom_id": classroom_id,
        "classroom_name": classroom.name,
        "quiz_count": len(classroom_quizzes),
        "students": students_progress,
    }


# ===== Student Endpoints =====

@router.post("/join")
async def join_classroom(
    req: JoinClassroomRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Student joins a classroom via join code, invite link token, or directly (public)."""
    if not req.code and not req.token and not req.classroom_id:
        raise HTTPException(status_code=400, detail="Provide 'code', 'token', or 'classroom_id' to join")

    classroom = None
    if req.classroom_id:
        classroom = db.query(Classroom).filter(Classroom.id == req.classroom_id).first()
        if classroom and not classroom.is_public:
            raise HTTPException(status_code=403, detail="This classroom is private. Use a join code or invite link.")
    elif req.code:
        classroom = db.query(Classroom).filter(
            Classroom.join_code == req.code.upper()
        ).first()
    elif req.token:
        classroom = db.query(Classroom).filter(
            Classroom.invite_link_token == req.token
        ).first()

    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found with that code or token")

    # Cannot join own classroom
    if classroom.teacher_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot join your own classroom as a student")

    # Check if already joined
    existing = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom.id,
        ClassroomStudent.student_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already joined this classroom")

    student_entry = ClassroomStudent(
        classroom_id=classroom.id,
        student_id=current_user.id,
    )
    db.add(student_entry)
    db.commit()

    # Award the Team Player social badge (idempotent — only fires the first time)
    badge_earned = None
    try:
        from app.routers.badges_router import check_and_award_badge
        badge_earned = check_and_award_badge(db, current_user, "classroom_join")
    except Exception:
        # Never let badge bookkeeping block a join
        badge_earned = None

    return {
        "id": classroom.id,
        "name": classroom.name,
        "teacher_id": classroom.teacher_id,
        "message": "Successfully joined the classroom",
        "badges_earned": [badge_earned] if badge_earned else [],
    }


@router.get("/{classroom_id}/student-view")
async def get_student_view(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Student sees: available quizzes (published, not expired) and their scores."""
    classroom = get_classroom_or_404(db, classroom_id)

    # Verify student is enrolled
    enrollment = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id,
        ClassroomStudent.student_id == current_user.id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this classroom")

    now = datetime.now(timezone.utc)

    # Get published quizzes
    classroom_quizzes = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.classroom_id == classroom_id,
        ClassroomQuiz.is_published == True,
    ).order_by(ClassroomQuiz.created_at.desc()).all()

    quizzes_data = []
    for cq in classroom_quizzes:
        is_expired = cq.expires_at is not None and now > cq.expires_at

        # Get student's attempts for this quiz
        my_attempts = db.query(ClassroomQuizAttempt).filter(
            ClassroomQuizAttempt.classroom_quiz_id == cq.id,
            ClassroomQuizAttempt.student_id == current_user.id,
        ).all()

        attempts_data = []
        best_score = None
        for cqa in my_attempts:
            attempt = db.query(Attempt).filter(Attempt.id == cqa.attempt_id).first()
            if attempt:
                score = attempt.score
                attempts_data.append({
                    "attempt_id": attempt.id,
                    "score": score,
                    "correct_count": attempt.correct_count,
                    "total_questions": attempt.total_questions,
                    "started_at": cqa.started_at,
                    "completed_at": cqa.completed_at,
                })
                if score is not None and (best_score is None or score > best_score):
                    best_score = score

        quizzes_data.append({
            "id": cq.id,
            "title": cq.title,
            "config": cq.config,
            "expires_at": cq.expires_at,
            "is_expired": is_expired,
            "attempt_count": len(attempts_data),
            "best_score": best_score,
            "attempts": attempts_data,
        })

    teacher = db.query(User).filter(User.id == classroom.teacher_id).first()

    return {
        "classroom_id": classroom.id,
        "classroom_name": classroom.name,
        "teacher_name": teacher.name if teacher else None,
        "quizzes": quizzes_data,
    }


@router.post("/{classroom_id}/quizzes/{quiz_id}/start")
async def start_classroom_quiz(
    classroom_id: str,
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Student starts a classroom quiz (creates attempt)."""
    classroom = get_classroom_or_404(db, classroom_id)

    # Verify student is enrolled
    enrollment = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id,
        ClassroomStudent.student_id == current_user.id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this classroom")

    classroom_quiz = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.id == quiz_id,
        ClassroomQuiz.classroom_id == classroom_id,
    ).first()
    if not classroom_quiz:
        raise HTTPException(status_code=404, detail="Classroom quiz not found")

    if not classroom_quiz.is_published:
        raise HTTPException(status_code=400, detail="This quiz is not yet published")

    # Check expiry — students can't START new attempts on expired quizzes
    now = datetime.now(timezone.utc)
    if classroom_quiz.expires_at and now > classroom_quiz.expires_at:
        raise HTTPException(status_code=400, detail="This quiz has expired. You can no longer start new attempts.")

    # One-take only: check if student already attempted this quiz
    existing_attempt = db.query(ClassroomQuizAttempt).filter(
        ClassroomQuizAttempt.classroom_quiz_id == classroom_quiz.id,
        ClassroomQuizAttempt.student_id == current_user.id,
    ).first()
    if existing_attempt:
        raise HTTPException(status_code=400, detail="You have already taken this quiz. Classroom quizzes can only be taken once.")

    # Create the regular Attempt
    quiz = db.query(Quiz).filter(Quiz.id == classroom_quiz.quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=500, detail="Underlying quiz not found")

    attempt = Attempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        total_questions=quiz.question_count,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # Create ClassroomQuizAttempt linking record
    cq_attempt = ClassroomQuizAttempt(
        classroom_quiz_id=classroom_quiz.id,
        student_id=current_user.id,
        attempt_id=attempt.id,
    )
    db.add(cq_attempt)
    db.commit()
    db.refresh(cq_attempt)

    # Return questions (without correct answers)
    questions = sorted(quiz.questions, key=lambda q: q.order_index)
    question_list = []
    for q in questions:
        question_list.append({
            "id": q.id,
            "type": q.type,
            "content": q.content,
            "options": q.options,
            "order_index": q.order_index,
        })

    return {
        "quiz_id": quiz.id,
        "attempt_id": attempt.id,
        "classroom_quiz_id": classroom_quiz.id,
        "title": classroom_quiz.title,
        "config": classroom_quiz.config,
        "questions": question_list,
    }


@router.get("/{classroom_id}/quizzes/{quiz_id}/status")
async def get_quiz_status(
    classroom_id: str,
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if a quiz is expired (for the expiry notification)."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_student_or_teacher(classroom, current_user, db)

    classroom_quiz = db.query(ClassroomQuiz).filter(
        ClassroomQuiz.id == quiz_id,
        ClassroomQuiz.classroom_id == classroom_id,
    ).first()
    if not classroom_quiz:
        raise HTTPException(status_code=404, detail="Classroom quiz not found")

    now = datetime.now(timezone.utc)
    is_expired = classroom_quiz.expires_at is not None and now > classroom_quiz.expires_at

    return {
        "id": classroom_quiz.id,
        "title": classroom_quiz.title,
        "is_published": classroom_quiz.is_published,
        "expires_at": classroom_quiz.expires_at,
        "is_expired": is_expired,
    }


# ===== Shared Endpoints =====

@router.get("/")
async def list_classrooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List classrooms: teacher sees owned, student sees joined, plus public classrooms."""
    # Classrooms I teach
    taught = db.query(Classroom).filter(Classroom.teacher_id == current_user.id).all()
    taught_data = []
    for c in taught:
        student_count = db.query(ClassroomStudent).filter(
            ClassroomStudent.classroom_id == c.id
        ).count()
        quiz_count = db.query(ClassroomQuiz).filter(
            ClassroomQuiz.classroom_id == c.id
        ).count()
        material_count = db.query(ClassroomAssignment).filter(
            ClassroomAssignment.classroom_id == c.id
        ).count()
        taught_data.append({
            "id": c.id,
            "name": c.name,
            "join_code": c.join_code,
            "invite_link_token": c.invite_link_token,
            "is_public": c.is_public,
            "role": "teacher",
            "student_count": student_count,
            "quiz_count": quiz_count,
            "material_count": material_count,
            "level": c.level,
            "created_at": c.created_at,
        })

    # Classrooms I'm a student in
    enrollments = db.query(ClassroomStudent).filter(
        ClassroomStudent.student_id == current_user.id
    ).all()
    joined_ids = set()
    joined_data = []
    for enrollment in enrollments:
        classroom = db.query(Classroom).filter(Classroom.id == enrollment.classroom_id).first()
        if classroom:
            joined_ids.add(classroom.id)
            teacher = db.query(User).filter(User.id == classroom.teacher_id).first()
            student_count = db.query(ClassroomStudent).filter(
                ClassroomStudent.classroom_id == classroom.id
            ).count()
            quiz_count = db.query(ClassroomQuiz).filter(
                ClassroomQuiz.classroom_id == classroom.id
            ).count()
            material_count = db.query(ClassroomAssignment).filter(
                ClassroomAssignment.classroom_id == classroom.id
            ).count()
            joined_data.append({
                "id": classroom.id,
                "name": classroom.name,
                "role": "student",
                "owner_name": teacher.name if teacher else None,
                "student_count": student_count,
                "quiz_count": quiz_count,
                "material_count": material_count,
                "level": classroom.level,
                "joined_at": enrollment.joined_at,
                "created_at": classroom.created_at,
            })

    # Public classrooms (exclude ones I already teach or joined)
    my_classroom_ids = set(c.id for c in taught) | joined_ids
    public_classrooms = db.query(Classroom).filter(
        Classroom.is_public == True,
        Classroom.id.notin_(my_classroom_ids) if my_classroom_ids else True,
    ).all()
    public_data = []
    for c in public_classrooms:
        teacher = db.query(User).filter(User.id == c.teacher_id).first()
        student_count = db.query(ClassroomStudent).filter(
            ClassroomStudent.classroom_id == c.id
        ).count()
        public_data.append({
            "id": c.id,
            "name": c.name,
            "owner_name": teacher.name if teacher else None,
            "student_count": student_count,
            "created_at": c.created_at,
        })

    return {"taught": taught_data, "joined": joined_data, "public": public_data}


# ===== Announcements =====


class CreateAnnouncementRequest(BaseModel):
    content: str
    is_pinned: bool = False


@router.post("/{classroom_id}/announcements")
async def create_announcement(
    classroom_id: str,
    req: CreateAnnouncementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher posts an announcement to the classroom."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    from app.models import ClassroomAnnouncement
    announcement = ClassroomAnnouncement(
        classroom_id=classroom_id,
        author_id=current_user.id,
        content=req.content.strip(),
        is_pinned=req.is_pinned,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)

    # Broadcast via WebSocket
    try:
        from app.services.ws_manager import manager
        await manager.broadcast_to_room(classroom_id, "announcement", {
            "id": announcement.id,
            "content": announcement.content,
            "author_name": current_user.name,
        })
    except Exception:
        pass

    # Create persistent notifications for classroom members
    try:
        from app.services.notify import notify_classroom
        await notify_classroom(
            db, classroom_id,
            type="announcement",
            title=f"New announcement in {classroom.name}",
            body=req.content.strip()[:100],
            link=f"/classrooms/{classroom_id}",
            meta={"classroom_id": classroom_id},
            exclude_user=current_user.id,
        )
    except Exception:
        pass

    return {
        "id": announcement.id,
        "content": announcement.content,
        "is_pinned": announcement.is_pinned,
        "author_name": current_user.name,
        "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
    }


@router.get("/{classroom_id}/announcements")
async def list_announcements(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get announcements for a classroom. Pinned first, then newest."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_student_or_teacher(classroom, current_user, db)

    from app.models import ClassroomAnnouncement
    from sqlalchemy import desc as sql_desc

    announcements = (
        db.query(ClassroomAnnouncement)
        .filter(ClassroomAnnouncement.classroom_id == classroom_id)
        .order_by(ClassroomAnnouncement.is_pinned.desc(), sql_desc(ClassroomAnnouncement.created_at))
        .limit(20)
        .all()
    )

    result = []
    for a in announcements:
        author = db.query(User).filter(User.id == a.author_id).first()
        result.append({
            "id": a.id,
            "content": a.content,
            "is_pinned": a.is_pinned,
            "author_name": author.name if author else "Unknown",
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return result


@router.delete("/{classroom_id}/announcements/{announcement_id}")
async def delete_announcement(
    classroom_id: str,
    announcement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher deletes an announcement."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    from app.models import ClassroomAnnouncement
    announcement = db.query(ClassroomAnnouncement).filter(
        ClassroomAnnouncement.id == announcement_id,
        ClassroomAnnouncement.classroom_id == classroom_id,
    ).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db.delete(announcement)
    db.commit()
    return {"ok": True}


# ===== Activity Feed =====


@router.get("/{classroom_id}/activity")
async def get_classroom_activity(
    classroom_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get recent activity feed for a classroom."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_student_or_teacher(classroom, current_user, db)

    from app.models import ClassroomActivity
    from sqlalchemy import desc as sql_desc

    activities = (
        db.query(ClassroomActivity)
        .filter(ClassroomActivity.classroom_id == classroom_id)
        .order_by(sql_desc(ClassroomActivity.created_at))
        .limit(limit)
        .all()
    )

    result = []
    for a in activities:
        user = db.query(User).filter(User.id == a.user_id).first()
        result.append({
            "id": a.id,
            "user_name": user.name if user else "Unknown",
            "user_picture": user.picture if user else None,
            "event_type": a.event_type,
            "event_data": a.event_data,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return result


# ===== Classroom Level =====


def classroom_xp_for_level(level: int) -> int:
    """XP needed to reach the next classroom level."""
    return level * 500


@router.get("/{classroom_id}/level")
async def get_classroom_level(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get classroom level and XP progress."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_student_or_teacher(classroom, current_user, db)

    xp_for_next = classroom_xp_for_level(classroom.level)
    progress = round((classroom.xp / xp_for_next) * 100, 1) if xp_for_next > 0 else 100

    return {
        "level": classroom.level,
        "xp": classroom.xp,
        "xp_for_next_level": xp_for_next,
        "progress": progress,
    }


def add_classroom_xp(db, classroom_id: str, xp_amount: int):
    """Add XP to a classroom and handle level-ups."""
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        return

    classroom.xp += xp_amount
    # Check for level up
    while classroom.xp >= classroom_xp_for_level(classroom.level):
        classroom.xp -= classroom_xp_for_level(classroom.level)
        classroom.level += 1

    db.commit()


def log_classroom_activity(db, classroom_id: str, user_id: str, event_type: str, event_data: dict = None):
    """Log an activity event to the classroom feed."""
    from app.models import ClassroomActivity
    activity = ClassroomActivity(
        classroom_id=classroom_id,
        user_id=user_id,
        event_type=event_type,
        event_data=event_data or {},
    )
    db.add(activity)
    db.commit()


@router.delete("/{classroom_id}")
async def delete_classroom(
    classroom_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete classroom (teacher only). Cascades to students, assignments, quizzes."""
    classroom = get_classroom_or_404(db, classroom_id)
    require_teacher(classroom, current_user)

    db.delete(classroom)
    db.commit()

    return {"message": "Classroom deleted successfully", "id": classroom_id}
