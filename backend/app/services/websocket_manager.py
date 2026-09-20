"""
WebSocket Connection Manager — Phase 8.

Maintains a mapping of user_id → set of active WebSocket connections.
Supports multiple simultaneous connections per user (e.g. multiple browser tabs).

Security:
  - user_id is set by the server from the validated JWT — never from client input.
  - No client can subscribe to another user's notifications.
  - Disconnected sockets are silently removed; they cannot cause DB operations to fail.

Concurrency:
  - This implementation is single-process safe (asyncio event loop).
  - For multi-process deployments (multiple uvicorn workers), use a shared
    pub/sub backend (e.g. Redis) in a future phase.
"""

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections grouped by user_id.

    Thread/task safety:
      All methods are called from the asyncio event loop. No explicit
      locking is needed in a single-process asyncio environment.
    """

    def __init__(self) -> None:
        # user_id → set of active WebSocket connections
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection for user_id."""
        await websocket.accept()
        self._connections[user_id].add(websocket)
        logger.debug("WS connected: user_id=%d total_conns=%d", user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Remove a WebSocket connection for user_id."""
        self._connections[user_id].discard(websocket)
        if not self._connections[user_id]:
            del self._connections[user_id]
        logger.debug("WS disconnected: user_id=%d", user_id)

    async def send_personal_notification(self, user_id: int, payload: dict) -> None:
        """Send a JSON notification payload to all active connections for user_id.

        Silently removes stale connections. Never raises — a disconnected client
        must not propagate errors to the caller (which is a background task
        running after the HTTP response has already been sent).
        """
        if user_id not in self._connections:
            return

        message = json.dumps(payload, default=str)
        stale: list[WebSocket] = []

        for ws in list(self._connections[user_id]):
            try:
                await ws.send_text(message)
            except Exception as exc:
                logger.debug(
                    "WS send failed for user_id=%d: %s — removing stale connection",
                    user_id,
                    type(exc).__name__,
                )
                stale.append(ws)

        for ws in stale:
            self._connections[user_id].discard(ws)

        if user_id in self._connections and not self._connections[user_id]:
            del self._connections[user_id]

    async def broadcast_to_users(self, user_ids: list[int], payload: dict) -> None:
        """Send a notification to multiple users.

        Deduplicates user_ids before sending. Errors per-user are handled
        individually — one bad connection doesn't skip others.
        """
        for uid in set(user_ids):
            await self.send_personal_notification(uid, payload)

    def active_user_count(self) -> int:
        """Return number of users with at least one active connection."""
        return len(self._connections)

    def connection_count(self, user_id: int) -> int:
        """Return number of active connections for a specific user."""
        return len(self._connections.get(user_id, set()))


# Module-level singleton — shared across all requests in the same process
ws_manager = ConnectionManager()
