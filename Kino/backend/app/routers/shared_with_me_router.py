from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Material, SharedMaterial
from app.auth import get_current_user

router = APIRouter(tags=["sharing"])


@router.get("/shared-with-me/")
async def get_shared_with_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all materials shared with the current user (via link token)."""
    # Get materials shared via link that the user has saved
    shares = db.query(SharedMaterial).filter(
        (SharedMaterial.shared_with_id == current_user.id) |
        (SharedMaterial.shared_with_email == current_user.email)
    ).all()

    results = []
    for share in shares:
        material = db.query(Material).filter(Material.id == share.material_id).first()
        owner = db.query(User).filter(User.id == share.owner_id).first()
        if material:
            results.append({
                "share_id": share.id,
                "material_id": share.material_id,
                "material_title": material.title,
                "owner_name": owner.name if owner else None,
                "permission": share.permission,
                "page_count": material.page_count,
                "created_at": share.created_at.isoformat() if share.created_at else None,
            })

    return results


@router.post("/shared-with-me/save")
async def save_shared_material(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a shared material to user's 'Shared with me' library by share token."""
    share_token = body.get("share_token")
    if not share_token:
        raise HTTPException(status_code=400, detail="share_token required")

    material = db.query(Material).filter(Material.share_token == share_token).first()
    if not material:
        raise HTTPException(status_code=404, detail="Shared material not found")

    # Reject if the share link has expired
    from datetime import datetime, timezone
    if material.share_expires_at is not None and material.share_expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link has expired")

    # Can't save your own material
    if material.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="This is your own material")

    # Check if already saved
    existing = db.query(SharedMaterial).filter(
        SharedMaterial.material_id == material.id,
        SharedMaterial.shared_with_id == current_user.id,
    ).first()
    if existing:
        return {"detail": "Already saved", "material_id": material.id}

    # Save it
    share = SharedMaterial(
        material_id=material.id,
        owner_id=material.user_id,
        shared_with_email=current_user.email,
        shared_with_id=current_user.id,
        permission=material.share_permission or "view",
    )
    db.add(share)
    db.commit()

    return {"detail": "Saved to your library", "material_id": material.id}
