"""
Audit service — Phase 5.

Provides a single reusable function for creating immutable audit records.
All callers use db.flush() (not commit) so audit entries participate in
the same transaction as the operation being audited.

If the parent transaction rolls back (e.g. issue creation fails), the
audit record is automatically rolled back too.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction, AuditLog
from app.models.user import User


def _json_safe(value: object) -> object:
    """Convert non-JSON-serialisable types to their string representation.

    Handles enums and datetime objects. dict/list/str/int/float/None
    pass through unchanged.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    # Enums (str-based) → string value
    if hasattr(value, "value"):
        return value.value
    # datetime → ISO string
    if isinstance(value, datetime):
        return value.isoformat()
    return value


async def create_audit_log(
    db: AsyncSession,
    actor: User,
    action: AuditAction,
    entity_type: str,
    entity_id: int | None = None,
    entity_key: str | None = None,
    description: str = "",
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> AuditLog:
    """Create and flush an immutable audit record.

    Args:
        db:          The current async database session (shared with caller).
        actor:       The authenticated user performing the action.
        action:      The AuditAction enum value.
        entity_type: String category of the resource (ISSUE, PROJECT, AUTH).
        entity_id:   Integer primary key of the affected resource, if any.
        entity_key:  Human-readable key (e.g. 'DM-0001', 'AGRO').
        description: Human-readable sentence describing the event.
        old_values:  Dict of previous field values (changed fields only).
        new_values:  Dict of new field values (changed fields only).

    Returns:
        The flushed AuditLog instance (id is set after flush).

    Transaction safety:
        Uses db.flush() — NOT db.commit(). The record participates in the
        caller's transaction. If the caller's transaction rolls back, this
        record is also rolled back.

    Security:
        - Never store password_hash, passwords, JWT tokens, OTP codes,
          or SMTP credentials in old_values / new_values.
        - The actor user_id comes from the verified JWT — never from request
          body input.
    """
    log_entry = AuditLog(
        user_id=actor.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_key=entity_key,
        description=description,
        old_values=_json_safe(old_values),
        new_values=_json_safe(new_values),
        created_at=datetime.now(UTC),
    )
    db.add(log_entry)
    await db.flush()
    return log_entry


def compute_diff(
    before: dict,
    after: dict,
) -> tuple[dict, dict]:
    """Return (old_values, new_values) containing only changed fields.

    Fields that are identical in before and after are excluded.
    This keeps audit records concise and meaningful.

    Example:
        before = {"priority": "HIGH", "severity": "MAJOR"}
        after  = {"priority": "CRITICAL", "severity": "MAJOR"}
        → old_values = {"priority": "HIGH"}
        → new_values = {"priority": "CRITICAL"}
    """
    old: dict = {}
    new: dict = {}
    all_keys = set(before) | set(after)
    for key in all_keys:
        b_val = before.get(key)
        a_val = after.get(key)
        if b_val != a_val:
            old[key] = b_val
            new[key] = a_val
    return old, new
