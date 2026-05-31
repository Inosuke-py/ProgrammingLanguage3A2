"""
Notification helper: creates a DB notification and pushes it via WebSocket.
"""

from sqlalchemy.orm import Session
from app.models import Notification, ClassroomStudent, Classroom
from app.services.ws_manager import manager


async def notify_user(
    db: Session,
    user_id: str,
    type: str,
    title: str,
    body: str = None,
    link: str = None,
    meta: dict = None,
):
    """Create a notification for a single user and push via WS."""
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        link=link,
        meta=meta or {},
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # Push via WebSocket
    await manager.send_to_user(user_id, "notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "link": notif.link,
        "meta": notif.meta,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
    })

    return notif


async def notify_classroom(
    db: Session,
    classroom_id: str,
    type: str,
    title: str,
    body: str = None,
    link: str = None,
    meta: dict = None,
    exclude_user: str = None,
):
    """Create notifications for all members of a classroom (students + teacher)."""
    # Get all students
    enrollments = db.query(ClassroomStudent).filter(
        ClassroomStudent.classroom_id == classroom_id
    ).all()
    student_ids = [e.student_id for e in enrollments]

    # Get teacher
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    teacher_id = classroom.teacher_id if classroom else None

    # Combine all member IDs
    all_ids = set(student_ids)
    if teacher_id:
        all_ids.add(teacher_id)

    # Exclude the sender
    if exclude_user:
        all_ids.discard(exclude_user)

    for uid in all_ids:
        await notify_user(db, uid, type, title, body, link, meta)
