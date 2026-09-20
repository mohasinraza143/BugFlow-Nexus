"""
Git webhook route — auto-transition issues to IN_TESTING (QA Verification).

Endpoint:
  POST /webhooks/git

Supported commit message formats (mentor spec):
  - "fixes #2"
  - "closes #5"
  - "resolves #8"
  - "fixes BUG-42"  (legacy key format also supported)

Workflow:
  1. Extract issue references from all commit messages.
     Two patterns:
       a. Numeric: fixes/closes/resolves #<id>
       b. Key-based: BUG-42, AUTH-7 (backward compat)
  2. For each reference, look up the Issue by numeric ID or issue_key.
  3. Transition: ANY non-terminal status → IN_TESTING (QA Verification).
     This is broader than the previous IN_REVIEW-only gate, matching
     the mentor's expectation that #2 gets transitioned regardless of
     its current status as long as it is not already RESOLVED/CLOSED.
  4. Write an AuditLog entry per transitioned issue recording:
     - actor: system/webhook
     - old status
     - new status
     - commit hash
     - message: "Auto-transitioned by Git commit #<hash>"
"""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.models.audit_log import AuditAction, AuditLog
from app.models.issue import Issue, IssueStatus
from app.schemas.smart import WebhookResult

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

# ── Regex patterns ─────────────────────────────────────────────────────────
# Numeric pattern: "fixes #2", "closes #5", "resolves #8" (case-insensitive)
_NUMERIC_REF_RE = re.compile(
    r"(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)",
    re.IGNORECASE,
)
# Key-based pattern: BUG-42, AUTH-7 (legacy)
_ISSUE_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9]*-\d+)\b")

# Statuses that are NOT eligible for further transitions
_TERMINAL_STATUSES: set[IssueStatus] = {IssueStatus.RESOLVED, IssueStatus.CLOSED}

# Target status (IN_TESTING is the QA_VERIFICATION equivalent)
_WEBHOOK_TARGET = IssueStatus.QA_VERIFICATION


def _extract_refs(payload: dict) -> tuple[list[int], list[str], list[str]]:
    """
    Parse commit messages and return:
      numeric_ids : list[int]   — from "fixes #2"
      key_refs    : list[str]   — from "BUG-42"
      commit_hashes: list[str]  — for audit logging
    """
    numeric_ids: list[int] = []
    key_refs: set[str] = set()
    commit_hashes: list[str] = []

    commits = payload.get("commits", [])

    # Also include top-level head_commit (GitHub)
    head = payload.get("head_commit")
    if head:
        commits = list(commits) + [head]

    for commit in commits:
        if not isinstance(commit, dict):
            continue
        message = commit.get("message", "") or ""
        commit_id = commit.get("id", commit.get("sha", "unknown"))
        if commit_id != "unknown":
            commit_hashes.append(str(commit_id))

        # Numeric refs
        for m in _NUMERIC_REF_RE.finditer(message):
            numeric_ids.append(int(m.group(1)))

        # Key-based refs (upper-case the message)
        for m in _ISSUE_KEY_RE.finditer(message.upper()):
            key_refs.add(m.group(1))

    # Deduplicate numeric IDs
    seen_ids: set[int] = set()
    unique_numeric: list[int] = []
    for nid in numeric_ids:
        if nid not in seen_ids:
            seen_ids.add(nid)
            unique_numeric.append(nid)

    return unique_numeric, list(key_refs), commit_hashes


@router.post(
    "/git",
    response_model=WebhookResult,
    summary="Git push webhook — auto-transition issues to IN_TESTING / QA_VERIFICATION",
    description=(
        "Receives a GitHub or GitLab push event. "
        "Supports 'fixes #2', 'closes #5', 'resolves #8' (numeric) "
        "and 'BUG-42' key-based formats. "
        "Creates an AuditLog entry for every transitioned issue."
    ),
)
async def git_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> WebhookResult:
    """Process a Git push webhook and auto-transition eligible issues."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    if not isinstance(payload, dict):
        payload = {}

    numeric_ids, key_refs, commit_hashes = _extract_refs(payload)
    commit_hash_str = ", ".join(commit_hashes[:3]) if commit_hashes else "unknown"

    # Build all display refs for the response
    all_refs: list[str] = [f"#{nid}" for nid in numeric_ids] + key_refs

    transitioned: list[str] = []
    not_found: list[str] = []
    skipped: list[str] = []

    async def _process_issue(issue: Issue, ref_label: str) -> None:
        if issue.status in _TERMINAL_STATUSES:
            skipped.append(
                f"{ref_label} (already {issue.status.value})"
            )
            return

        old_status = issue.status.value
        issue.status = _WEBHOOK_TARGET

        # Write AuditLog
        audit = AuditLog(
            user_id=None,  # system/webhook actor
            action=AuditAction.ISSUE_STATUS_CHANGED,
            entity_type="ISSUE",
            entity_id=issue.id,
            entity_key=issue.issue_key,
            description=(
                f"Auto-transitioned by Git commit #{commit_hash_str}: "
                f"{old_status} → {_WEBHOOK_TARGET.value}"
            ),
            old_values={"status": old_status},
            new_values={"status": _WEBHOOK_TARGET.value},
        )
        db.add(audit)
        transitioned.append(ref_label)

    # ── Process numeric IDs (mentor's primary pattern) ─────────────────
    for nid in numeric_ids:
        result = await db.execute(select(Issue).where(Issue.id == nid))
        issue = result.scalar_one_or_none()
        if issue is None:
            not_found.append(f"#{nid}")
            continue
        await _process_issue(issue, f"#{nid}")

    # ── Process key-based refs (legacy backward compat) ─────────────────
    for key in key_refs:
        result = await db.execute(select(Issue).where(Issue.issue_key == key))
        issue = result.scalar_one_or_none()
        if issue is None:
            not_found.append(key)
            continue
        label = f"{key}(#{issue.id})"
        if label in [t.split("(")[0] for t in transitioned]:
            continue  # Already handled via numeric
        await _process_issue(issue, key)

    if transitioned:
        await db.commit()

    total = len(all_refs)
    msg = (
        f"Processed {total} reference(s) from commit(s) [{commit_hash_str}]: "
        f"{len(transitioned)} transitioned to IN_TESTING (QA Verification), "
        f"{len(skipped)} skipped (terminal status), "
        f"{len(not_found)} not found."
    )

    return WebhookResult(
        received_refs=all_refs,
        received_keys=key_refs,
        transitioned=transitioned,
        not_found=not_found,
        skipped=skipped,
        message=msg,
    )
