"""
Pool generation entry point.
Enqueues materials for the background worker to process.
Also provides a direct generation function for immediate use.
"""

import asyncio
from sqlalchemy.orm import Session

from app.models import Material, QuestionPool
from app.services.ai_client import generate_json


async def generate_pool_for_material(material_id: str, db: Session, target_count: int = 40):
    """
    Enqueue a material for pool generation.
    The pool worker will handle actual generation in order.
    Returns immediately after queueing.
    """
    from app.services.pool_worker import enqueue_material

    # Verify material exists
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        return 0

    # Enqueue for the worker (high priority — new upload)
    enqueue_material(material_id)
    print(f"[pool-gen] Material '{material.title}' queued for generation.")
    return 0  # Actual count will be determined by the worker


async def replenish_pool(material_id: str, db: Session, count: int = 15):
    """Enqueue a material for pool replenishment (lower priority)."""
    from app.services.pool_worker import enqueue_material_low_priority
    enqueue_material_low_priority(material_id)
    return 0
