"""
WebSocket endpoint for real-time events.
Clients connect with their JWT token and receive live updates.
"""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from jose import jwt, JWTError

from app.config import get_settings
from app.services.ws_manager import manager
from app.database import SessionLocal
from app.models import User, ClassroomStudent

router = APIRouter()
settings = get_settings()


def authenticate_ws(token: str) -> str | None:
    """Validate JWT token and return user_id."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        return user_id
    except JWTError:
        return None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket connection endpoint.
    
    Client sends token on connect:
    ws.send(JSON.stringify({ type: "auth", token: "..." }))
    
    After auth, client can:
    - Join rooms: { type: "join_room", room_id: "classroom_id" }
    - Leave rooms: { type: "leave_room", room_id: "classroom_id" }
    - Ping: { type: "ping" }
    
    Server sends events:
    - { event: "authenticated", data: { user_id: "..." } }
    - { event: "room_joined", data: { room_id: "...", online_count: N } }
    - { event: "user_online", data: { user_id: "...", room_id: "..." } }
    - { event: "user_offline", data: { user_id: "...", room_id: "..." } }
    - { event: "quiz_completed", data: { ... } }
    - { event: "badge_earned", data: { ... } }
    - { event: "pong", data: null }
    """
    await websocket.accept()
    user_id: str | None = None

    try:
        # Wait for auth message
        raw = await websocket.receive_text()
        msg = json.loads(raw)

        if msg.get("type") != "auth" or not msg.get("token"):
            await websocket.send_json({"event": "error", "data": "Send auth token first"})
            await websocket.close()
            return

        user_id = authenticate_ws(msg["token"])
        if not user_id:
            await websocket.send_json({"event": "error", "data": "Invalid token"})
            await websocket.close()
            return

        # Register connection
        # Need to re-accept since manager.connect expects to accept
        # But we already accepted above, so just register directly
        manager._connections[user_id] = websocket
        print(f"[ws] User {user_id} authenticated. Total: {len(manager._connections)}")

        await websocket.send_json({"event": "authenticated", "data": {"user_id": user_id}})

        # Auto-join user's classrooms
        db = SessionLocal()
        try:
            enrollments = db.query(ClassroomStudent).filter(
                ClassroomStudent.student_id == user_id
            ).all()
            for enrollment in enrollments:
                manager.join_room(user_id, enrollment.classroom_id)

            # Also join classrooms they teach
            from app.models import Classroom
            taught = db.query(Classroom).filter(Classroom.teacher_id == user_id).all()
            for classroom in taught:
                manager.join_room(user_id, classroom.id)
        finally:
            db.close()

        # Listen for messages
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "ping":
                await websocket.send_json({"event": "pong", "data": None})

            elif msg_type == "join_room":
                room_id = msg.get("room_id")
                if room_id:
                    manager.join_room(user_id, room_id)
                    online_count = manager.get_room_online_count(room_id)
                    await websocket.send_json({"event": "room_joined", "data": {"room_id": room_id, "online_count": online_count}})
                    # Notify others in the room
                    await manager.broadcast_to_room(room_id, "user_online", {"user_id": user_id, "room_id": room_id, "online_count": online_count}, exclude_user=user_id)

            elif msg_type == "leave_room":
                room_id = msg.get("room_id")
                if room_id:
                    manager.leave_room(user_id, room_id)
                    online_count = manager.get_room_online_count(room_id)
                    await manager.broadcast_to_room(room_id, "user_offline", {"user_id": user_id, "room_id": room_id, "online_count": online_count})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ws] Error for user {user_id}: {e}")
    finally:
        if user_id:
            # Notify rooms about disconnect
            for room_id, members in list(manager._rooms.items()):
                if user_id in members:
                    manager.leave_room(user_id, room_id)
                    online_count = manager.get_room_online_count(room_id)
                    await manager.broadcast_to_room(room_id, "user_offline", {"user_id": user_id, "room_id": room_id, "online_count": online_count})
            manager.disconnect(user_id)
