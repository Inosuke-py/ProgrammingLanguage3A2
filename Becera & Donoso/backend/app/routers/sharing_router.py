"""Material sharing: by email and by link."""

import os
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Material, SharedMaterial
from app.auth import get_current_user
from app.rate_limit import limiter

router = APIRouter(prefix="/share", tags=["sharing"])


# Default link lifetime. Override per-link with body.expires_in_days.
DEFAULT_LINK_DAYS = 7
MAX_LINK_DAYS = 90


class ShareRequest(BaseModel):
    material_id: str
    shared_with_email: str
    permission: str = "view"


def _is_link_active(material: Material) -> bool:
    """Returns True if the share link is still valid (not expired or revoked)."""
    if not material.share_token:
        return False
    expires = material.share_expires_at
    if expires is None:
        # Backward compat: links created before share_expires_at existed are
        # still active. New links will always have an expiry.
        return True
    return expires > datetime.now(timezone.utc)


# ─── Share by Email ────────────────────────────────────────────────────────────

@router.post("/")
async def share_material(
    req: ShareRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Share a material with another user by email."""
    if req.permission not in ("view", "quiz"):
        raise HTTPException(status_code=400, detail="Permission must be 'view' or 'quiz'")

    material = db.query(Material).filter(
        Material.id == req.material_id,
        Material.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found or not owned by you")

    if req.shared_with_email == current_user.email:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    existing = db.query(SharedMaterial).filter(
        SharedMaterial.material_id == req.material_id,
        SharedMaterial.shared_with_email == req.shared_with_email,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Material already shared with this user")

    target_user = db.query(User).filter(User.email == req.shared_with_email).first()

    share = SharedMaterial(
        material_id=req.material_id,
        owner_id=current_user.id,
        shared_with_email=req.shared_with_email,
        shared_with_id=target_user.id if target_user else None,
        permission=req.permission,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    return {
        "id": share.id,
        "material_id": share.material_id,
        "shared_with_email": share.shared_with_email,
        "permission": share.permission,
    }


# ─── Share by Link ─────────────────────────────────────────────────────────────

@router.post("/link")
async def generate_share_link(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate or refresh a share link for a material. Default lifetime: 7 days."""
    material_id = body.get("material_id")
    permission = body.get("permission", "view")
    if not material_id:
        raise HTTPException(status_code=400, detail="material_id required")
    if permission not in ("view", "quiz"):
        raise HTTPException(status_code=400, detail="permission must be 'view' or 'quiz'")

    # Optional custom lifetime in days
    expires_in_days = body.get("expires_in_days", DEFAULT_LINK_DAYS)
    try:
        expires_in_days = int(expires_in_days)
    except (TypeError, ValueError):
        expires_in_days = DEFAULT_LINK_DAYS
    expires_in_days = max(1, min(expires_in_days, MAX_LINK_DAYS))

    material = db.query(Material).filter(
        Material.id == material_id,
        Material.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Generate token if not exists, refresh expiry on every call
    if not material.share_token:
        material.share_token = secrets.token_urlsafe(16)
    material.share_permission = permission
    material.share_expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
    db.commit()
    db.refresh(material)

    return {
        "share_token": material.share_token,
        "share_url": f"/shared/{material.share_token}",
        "permission": material.share_permission,
        "expires_at": material.share_expires_at.isoformat() if material.share_expires_at else None,
        "expires_in_days": expires_in_days,
    }


@router.delete("/link")
async def revoke_share_link(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke a share link (removes the token)."""
    material_id = body.get("material_id")
    if not material_id:
        raise HTTPException(status_code=400, detail="material_id required")

    material = db.query(Material).filter(
        Material.id == material_id,
        Material.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    material.share_token = None
    material.share_expires_at = None
    db.commit()

    return {"detail": "Share link revoked"}


# ─── Public Access (no auth required) ──────────────────────────────────────────

@router.get("/public/{share_token}")
@limiter.limit("60/minute")
async def get_shared_material(
    request: Request,
    share_token: str,
    db: Session = Depends(get_db),
):
    """Access a shared material by token. No authentication required."""
    material = db.query(Material).filter(Material.share_token == share_token).first()
    if not material or not _is_link_active(material):
        raise HTTPException(status_code=404, detail="Shared material not found or link expired")

    owner = db.query(User).filter(User.id == material.user_id).first()

    return {
        "id": material.id,
        "title": material.title,
        "file_type": material.file_type,
        "page_count": material.page_count,
        "topic": material.topic,
        "field": material.field,
        "permission": material.share_permission or "view",
        "expires_at": material.share_expires_at.isoformat() if material.share_expires_at else None,
        "owner_name": owner.name if owner else "Unknown",
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


@router.get("/public/{share_token}/file")
@limiter.limit("30/minute")
async def get_shared_file(
    request: Request,
    share_token: str,
    db: Session = Depends(get_db),
):
    """Download the shared material's file. No authentication required."""
    material = db.query(Material).filter(Material.share_token == share_token).first()
    if not material or not _is_link_active(material):
        raise HTTPException(status_code=404, detail="Shared material not found or link expired")

    if not os.path.exists(material.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(
        material.file_path,
        media_type="application/pdf",
        filename=f"{material.title}.pdf",
    )


# ─── Revoke email share ───────────────────────────────────────────────────────

@router.delete("/{share_id}")
async def revoke_share(
    share_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke an email share."""
    share = db.query(SharedMaterial).filter(
        SharedMaterial.id == share_id,
        SharedMaterial.owner_id == current_user.id,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    db.delete(share)
    db.commit()
    return {"detail": "Share revoked"}
