"""
Event broadcasting helpers.
Call these from routers/services to push real-time events to connected clients.
"""

from app.services.ws_manager import manager


async def emit_quiz_completed(user_id: str, user_name: str, classroom_id: str | None, score: float, quiz_title: str):
    """Broadcast when a user completes a quiz."""
    data = {
        "user_id": user_id,
        "user_name": user_name,
        "score": score,
        "quiz_title": quiz_title,
    }
    if classroom_id:
        await manager.broadcast_to_room(classroom_id, "quiz_completed", data, exclude_user=user_id)

        # Log to activity feed and add classroom XP
        try:
            from app.database import SessionLocal
            from app.routers.classrooms_router import log_classroom_activity, add_classroom_xp
            db = SessionLocal()
            log_classroom_activity(db, classroom_id, user_id, "quiz_completed", {"score": score, "quiz_title": quiz_title})
            # Award classroom XP based on score
            xp_award = int(score / 10)  # 0-10 XP per quiz based on score
            add_classroom_xp(db, classroom_id, xp_award)
            db.close()
        except Exception as e:
            print(f"[events] Activity log error: {e}")

    await manager.send_to_user(user_id, "quiz_completed_self", data)


async def emit_badge_earned(user_id: str, user_name: str, badge_name: str, badge_rarity: str, classroom_id: str | None = None):
    """Broadcast when a user earns a badge."""
    data = {
        "user_id": user_id,
        "user_name": user_name,
        "badge_name": badge_name,
        "badge_rarity": badge_rarity,
    }
    if classroom_id:
        await manager.broadcast_to_room(classroom_id, "badge_earned", data, exclude_user=user_id)
        # Log to activity feed
        try:
            from app.database import SessionLocal
            from app.routers.classrooms_router import log_classroom_activity
            db = SessionLocal()
            log_classroom_activity(db, classroom_id, user_id, "badge_earned", {"badge_name": badge_name, "badge_rarity": badge_rarity})
            db.close()
        except Exception:
            pass


async def emit_streak_milestone(user_id: str, user_name: str, streak: int, classroom_id: str | None = None):
    """Broadcast when a user hits a streak milestone."""
    data = {
        "user_id": user_id,
        "user_name": user_name,
        "streak": streak,
    }
    if classroom_id:
        await manager.broadcast_to_room(classroom_id, "streak_milestone", data, exclude_user=user_id)


async def emit_material_uploaded(user_id: str, user_name: str, material_title: str, classroom_id: str | None = None):
    """Broadcast when new material is uploaded/assigned to a classroom."""
    data = {
        "user_id": user_id,
        "user_name": user_name,
        "material_title": material_title,
    }
    if classroom_id:
        await manager.broadcast_to_room(classroom_id, "material_uploaded", data)


async def emit_announcement(classroom_id: str, message: str):
    """Broadcast an announcement to a classroom."""
    await manager.broadcast_to_room(classroom_id, "announcement", {"message": message})
