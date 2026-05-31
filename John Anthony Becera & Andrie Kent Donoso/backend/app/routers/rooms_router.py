from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import User, Material, StudyRoom
from app.auth import get_current_user

router = APIRouter(prefix="/rooms", tags=["rooms"])


class CreateRoomRequest(BaseModel):
    name: str
    material_id: Optional[str] = None
    max_participants: int = 10


@router.post("/create")
async def create_room(
    req: CreateRoomRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a study room."""
    # Validate material if provided
    if req.material_id:
        material = db.query(Material).filter(Material.id == req.material_id).first()
        if not material:
            raise HTTPException(status_code=404, detail="Material not found")

    room = StudyRoom(
        name=req.name,
        material_id=req.material_id,
        host_id=current_user.id,
        status="active",
        participants=[current_user.id],  # host auto-joins
        max_participants=req.max_participants,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    return {
        "id": room.id,
        "name": room.name,
        "material_id": room.material_id,
        "host_id": room.host_id,
        "status": room.status,
        "participants": room.participants,
        "max_participants": room.max_participants,
        "created_at": room.created_at,
    }


@router.post("/{room_id}/join")
async def join_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Join a study room."""
    room = db.query(StudyRoom).filter(StudyRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.status != "active":
        raise HTTPException(status_code=400, detail="Room is closed")

    participants = room.participants or []

    if current_user.id in participants:
        raise HTTPException(status_code=400, detail="Already in this room")

    if len(participants) >= room.max_participants:
        raise HTTPException(status_code=400, detail="Room is full")

    participants.append(current_user.id)
    room.participants = participants
    db.commit()
    db.refresh(room)

    return {
        "id": room.id,
        "name": room.name,
        "participants": room.participants,
        "status": room.status,
    }


@router.get("/")
async def list_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active study rooms."""
    rooms = db.query(StudyRoom).filter(StudyRoom.status == "active").all()

    results = []
    for room in rooms:
        host = db.query(User).filter(User.id == room.host_id).first()
        results.append({
            "id": room.id,
            "name": room.name,
            "host_id": room.host_id,
            "host_name": host.name if host else None,
            "material_id": room.material_id,
            "status": room.status,
            "participant_count": len(room.participants or []),
            "max_participants": room.max_participants,
            "created_at": room.created_at,
        })

    return results


@router.get("/{room_id}")
async def get_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get room details with participant info."""
    room = db.query(StudyRoom).filter(StudyRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    # Get participant details
    participant_details = []
    for pid in (room.participants or []):
        user = db.query(User).filter(User.id == pid).first()
        if user:
            participant_details.append({
                "id": user.id,
                "name": user.name,
                "picture": user.picture,
            })

    host = db.query(User).filter(User.id == room.host_id).first()

    return {
        "id": room.id,
        "name": room.name,
        "host_id": room.host_id,
        "host_name": host.name if host else None,
        "material_id": room.material_id,
        "status": room.status,
        "participants": participant_details,
        "max_participants": room.max_participants,
        "created_at": room.created_at,
    }


@router.post("/{room_id}/leave")
async def leave_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Leave a study room."""
    room = db.query(StudyRoom).filter(StudyRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    participants = room.participants or []

    if current_user.id not in participants:
        raise HTTPException(status_code=400, detail="Not in this room")

    participants.remove(current_user.id)
    room.participants = participants
    db.commit()

    return {"detail": "Left the room"}


@router.delete("/{room_id}")
async def close_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close a room (host only)."""
    room = db.query(StudyRoom).filter(StudyRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can close the room")

    room.status = "closed"
    db.commit()

    return {"detail": "Room closed"}
