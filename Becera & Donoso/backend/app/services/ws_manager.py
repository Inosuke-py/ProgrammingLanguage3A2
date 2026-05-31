"""
WebSocket connection manager.
Handles user connections, room subscriptions, and event broadcasting.
"""

import json
from typing import Any
from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections and room-based broadcasting."""

    def __init__(self):
        # user_id -> WebSocket connection
        self._connections: dict[str, WebSocket] = {}
        # room_id -> set of user_ids (for classroom-scoped events)
        self._rooms: dict[str, set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self._connections[user_id] = websocket
        print(f"[ws] User {user_id} connected. Total: {len(self._connections)}")

    def disconnect(self, user_id: str):
        """Remove a disconnected user."""
        self._connections.pop(user_id, None)
        # Remove from all rooms
        for room_members in self._rooms.values():
            room_members.discard(user_id)
        print(f"[ws] User {user_id} disconnected. Total: {len(self._connections)}")

    def join_room(self, user_id: str, room_id: str):
        """Subscribe a user to a room (e.g., a classroom)."""
        if room_id not in self._rooms:
            self._rooms[room_id] = set()
        self._rooms[room_id].add(user_id)

    def leave_room(self, user_id: str, room_id: str):
        """Unsubscribe a user from a room."""
        if room_id in self._rooms:
            self._rooms[room_id].discard(user_id)

    async def send_to_user(self, user_id: str, event: str, data: Any = None):
        """Send an event to a specific user."""
        ws = self._connections.get(user_id)
        if ws:
            try:
                await ws.send_json({"event": event, "data": data})
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_room(self, room_id: str, event: str, data: Any = None, exclude_user: str | None = None):
        """Broadcast an event to all users in a room."""
        members = self._rooms.get(room_id, set())
        for user_id in list(members):
            if user_id == exclude_user:
                continue
            await self.send_to_user(user_id, event, data)

    async def broadcast_all(self, event: str, data: Any = None):
        """Broadcast an event to all connected users."""
        for user_id in list(self._connections.keys()):
            await self.send_to_user(user_id, event, data)

    def get_online_count(self) -> int:
        """Get total online user count."""
        return len(self._connections)

    def get_room_online_count(self, room_id: str) -> int:
        """Get online user count in a specific room."""
        members = self._rooms.get(room_id, set())
        return sum(1 for uid in members if uid in self._connections)

    def get_online_users_in_room(self, room_id: str) -> list[str]:
        """Get list of online user IDs in a room."""
        members = self._rooms.get(room_id, set())
        return [uid for uid in members if uid in self._connections]

    def is_online(self, user_id: str) -> bool:
        """Check if a user is currently connected."""
        return user_id in self._connections


# Singleton instance
manager = ConnectionManager()
