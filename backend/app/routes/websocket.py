"""
WebSocket endpoint — Phase 8.

Endpoint: /ws/notifications

Authentication:
  JWT token passed as query parameter:  /ws/notifications?token=<JWT>

  The user_id is derived EXCLUSIVELY from the validated JWT — the client
  cannot supply a user_id to spoof another user's feed.

  Connection is rejected (WebSocket 4001) for:
    - missing or invalid token
    - expired token
    - unknown user
    - inactive user

Security:
  - Never trust any user_id from the client.
  - WebSocket close code 4001 = Unauthorized.
  - WebSocket close code 4003 = Forbidden (inactive user).
"""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import AsyncSessionLocal
from app.models.user import User
from app.services.websocket_manager import ws_manager
from app.utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

_WS_UNAUTHORIZED = 4001
_WS_FORBIDDEN = 4003


async def _authenticate_ws(token: str | None) -> User | None:
    """Validate JWT and return the active User, or None on any failure.

    Uses a fresh DB session (not request-scoped) because WebSocket
    connections are long-lived and sit outside the normal request lifecycle.
    """
    if not token:
        return None

    try:
        payload = decode_access_token(token)
    except Exception:
        return None

    user_id_str: str | None = payload.get("sub")
    if not user_id_str or not user_id_str.isdigit():
        return None

    user_id = int(user_id_str)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()

    return user


@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: str | None = Query(default=None, description="JWT access token"),
) -> None:
    """Real-time notification stream.

    Connect:
        ws://host/ws/notifications?token=<JWT>

    On successful connection the server begins pushing notification events:

        {
          "type": "notification",
          "data": {
            "id": 123,
            "notification_type": "ISSUE_ASSIGNED",
            "title": "...",
            "message": "...",
            "entity_type": "ISSUE",
            "entity_id": 1,
            "entity_key": "DM-0001",
            "created_at": "..."
          }
        }

    The connection is kept open until the client disconnects or the server
    closes it. Clients may send any text frame as a keepalive ping — the
    server ignores the content.
    """
    user = await _authenticate_ws(token)

    if user is None:
        await websocket.close(code=_WS_UNAUTHORIZED)
        logger.warning("WS rejected: invalid or missing token")
        return

    if not user.is_active:
        await websocket.close(code=_WS_FORBIDDEN)
        logger.warning("WS rejected: inactive user_id=%d", user.id)
        return

    await ws_manager.connect(user.id, websocket)
    logger.info("WS connected: user_id=%d", user.id)

    try:
        while True:
            # Keep connection alive; ignore any client-sent frames
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS unexpected error for user_id=%d: %s", user.id, type(exc).__name__)
    finally:
        ws_manager.disconnect(user.id, websocket)
        logger.info("WS disconnected: user_id=%d", user.id)
