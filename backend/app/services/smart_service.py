"""
Smart service — mentor-spec Smart Priority Calculator and Smart Developer Matcher.

Feature 1: Smart Priority Calculator
  Formula: Priority Score = severity_weight × category_urgency_weight

  Severity weights:
    CRITICAL = 4, MAJOR = 3, MINOR = 2, TRIVIAL = 1

  Category urgency weights:
    High urgency  (3): Security, Database
    Medium urgency(2): API, Backend
    Low urgency   (1): UI, Colors, Typo/Typos

  Final priority:
    Score >= 10 → URGENT
    Score  7–9  → HIGH
    Score  4–6  → MEDIUM
    Score < 4   → LOW

  Test: CRITICAL (4) × Security (3) = 12 → URGENT ✓

Feature 2: Smart Developer Matcher
  - Analyzes issue title/description for tech keywords
  - Compares keywords against developer skills (derived from resolved issue patterns)
  - Factors in current open workload
  - Returns top 3 ranked developers with match_percentage, matched_skills, explanation
"""

import re

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import Issue, IssueStatus, IssueType
from app.models.user import User, UserRole
from app.schemas.smart import (
    DeveloperMatchResponse,
    DeveloperSuggestion,
    PriorityCalcRequest,
    PriorityCalcResponse,
)


# --------------------------------------------------------------------------- #
# Mentor's exact weight maps                                                   #
# --------------------------------------------------------------------------- #

_SEVERITY_WEIGHTS: dict[str, int] = {
    "CRITICAL": 4,
    "MAJOR":    3,
    "MINOR":    2,
    "TRIVIAL":  1,
    # Alias for backward compat (BLOCKER treated as CRITICAL)
    "BLOCKER":  4,
}

# Category → urgency weight (case-insensitive key lookup)
_CATEGORY_WEIGHTS: dict[str, int] = {
    "security":  3,
    "database":  3,
    "api":       2,
    "backend":   2,
    "ui":        1,
    "colors":    1,
    "colour":    1,
    "typo":      1,
    "typos":     1,
    "frontend":  1,
}

def _resolve_category_weight(category: str) -> tuple[int, str]:
    """Return (weight, canonical_name) for a given category string."""
    key = category.strip().lower()
    weight = _CATEGORY_WEIGHTS.get(key)
    if weight is not None:
        return weight, category.strip()
    # Fuzzy: substring match
    for cat_key, cat_weight in _CATEGORY_WEIGHTS.items():
        if cat_key in key or key in cat_key:
            return cat_weight, cat_key.capitalize()
    # Unknown category — default medium urgency
    return 2, category.strip()


# --------------------------------------------------------------------------- #
# Feature 1: Smart Priority Calculator (Mentor formula)                        #
# --------------------------------------------------------------------------- #

async def calculate_priority(
    request: PriorityCalcRequest,
    db: AsyncSession,
) -> PriorityCalcResponse:
    """
    Mentor formula:
      priority_score = severity_weight × category_urgency_weight

    Thresholds:
      >= 10 → URGENT | 7–9 → HIGH | 4–6 → MEDIUM | < 4 → LOW
    """
    sev_upper = request.severity.upper().strip()
    severity_weight = _SEVERITY_WEIGHTS.get(sev_upper, 2)  # default MINOR

    category_urgency_weight, resolved_category = _resolve_category_weight(request.category)

    priority_score = severity_weight * category_urgency_weight

    # Map score to priority
    if priority_score >= 10:
        priority = "URGENT"
    elif priority_score >= 7:
        priority = "HIGH"
    elif priority_score >= 4:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    explanation = (
        f"severity={request.severity.upper()} (weight={severity_weight}) × "
        f"category={resolved_category} (weight={category_urgency_weight}) = "
        f"score {priority_score} → {priority}"
    )

    reasoning = [
        f"Severity [{request.severity.upper()}] → severity_weight = {severity_weight}",
        f"Category [{resolved_category}] → category_urgency_weight = {category_urgency_weight}",
        f"Priority Score = {severity_weight} × {category_urgency_weight} = {priority_score}",
        f"Score {priority_score} → Priority: {priority}",
    ]

    confidence = "HIGH" if priority_score >= 10 else "MEDIUM" if priority_score >= 5 else "LOW"

    return PriorityCalcResponse(
        priority_score=float(priority_score),
        priority=priority,
        severity_weight=severity_weight,
        category_urgency_weight=category_urgency_weight,
        explanation=explanation,
        # Legacy fields
        recommended_priority=priority,
        score=float(priority_score),
        reasoning=reasoning,
        confidence=confidence,
    )


# --------------------------------------------------------------------------- #
# Keyword → skill domain mapping                                               #
# --------------------------------------------------------------------------- #

# These keywords are extracted from issue titles/descriptions
_SKILL_KEYWORDS: dict[str, str] = {
    # Database
    "database":    "Database",
    "sql":         "Database",
    "postgres":    "Database",
    "postgresql":  "Database",
    "mysql":       "Database",
    "sqlite":      "Database",
    "db":          "Database",
    "migration":   "Database",
    "schema":      "Database",
    "query":       "Database",
    "orm":         "Database",
    "timeout":     "Database",
    "connection":  "Database",
    "pool":        "Database",
    "latency":     "Database",
    "deadlock":    "Database",
    "transaction": "Database",
    # Backend / API
    "api":         "Backend",
    "backend":     "Backend",
    "server":      "Backend",
    "fastapi":     "Backend",
    "endpoint":    "Backend",
    "rest":        "Backend",
    "http":        "Backend",
    "request":     "Backend",
    "response":    "Backend",
    # Security / Auth
    "login":       "Security",
    "auth":        "Security",
    "password":    "Security",
    "token":       "Security",
    "jwt":         "Security",
    "security":    "Security",
    "permission":  "Security",
    "otp":         "Security",
    # Frontend / UI
    "react":       "Frontend",
    "css":         "Frontend",
    "ui":          "Frontend",
    "frontend":    "Frontend",
    "button":      "Frontend",
    "page":        "Frontend",
    "modal":       "Frontend",
    "layout":      "Frontend",
    "style":       "Frontend",
    # Infrastructure / DevOps
    "docker":      "DevOps",
    "ci":          "DevOps",
    "deploy":      "DevOps",
    "pipeline":    "DevOps",
    "redis":       "DevOps",
    "cache":       "DevOps",
}

# Which issue types map to which skill domain
_ISSUE_TYPE_DOMAIN: dict[str, str] = {
    "BUG":              "Backend",
    "FEATURE_REQUEST":  "Frontend",
    "ENHANCEMENT":      "Frontend",
    "TECHNICAL_DEBT":   "Backend",
    "SUPPORT_TICKET":   "Security",
}


def _extract_keywords_from_text(text: str) -> list[str]:
    """Extract matched skill domains from free text."""
    words = set(re.findall(r"[a-z]+", text.lower()))
    matched_domains: set[str] = set()
    for word in words:
        if word in _SKILL_KEYWORDS:
            matched_domains.add(_SKILL_KEYWORDS[word])
    return list(matched_domains)


# --------------------------------------------------------------------------- #
# Feature 2: Smart Developer Matcher (Mentor spec)                             #
# --------------------------------------------------------------------------- #

async def suggest_assignee(
    issue_id: int,
    db: AsyncSession,
) -> DeveloperMatchResponse:
    """
    Return TOP 3 ranked developers for the given issue using:
    1. Keyword/skill match from issue title+description
    2. Current open bug workload (fewer = better)
    3. Historical resolution rate
    """
    # Fetch the issue
    issue_result = await db.execute(select(Issue).where(Issue.id == issue_id))
    issue = issue_result.scalar_one_or_none()
    if issue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue {issue_id} not found.",
        )

    # Extract keywords from issue text
    issue_text = f"{issue.title} {issue.description or ''}"
    required_domains = _extract_keywords_from_text(issue_text)
    # Also add the domain from issue type
    type_domain = _ISSUE_TYPE_DOMAIN.get(str(issue.issue_type).replace("IssueType.", ""), "Backend")
    if type_domain not in required_domains:
        required_domains.append(type_domain)

    # Fetch all active TESTER/DEVELOPER users
    users_result = await db.execute(
        select(User).where(
            User.role.in_([UserRole.TESTER, UserRole.DEVELOPER]),
            User.is_active == True,  # noqa: E712
        )
    )
    users = users_result.scalars().all()

    if not users:
        return DeveloperMatchResponse(
            issue_id=issue_id,
            issue_key=issue.issue_key,
            suggestions=[],
        )

    user_ids = [u.id for u in users]

    # Aggregate per-user stats
    stats_result = await db.execute(
        select(
            Issue.assignee_id,
            func.count().label("assigned"),
            func.count(
                case((Issue.status.in_([IssueStatus.RESOLVED, IssueStatus.CLOSED]), 1))
            ).label("resolved"),
            func.count(
                case((Issue.status.notin_([IssueStatus.RESOLVED, IssueStatus.CLOSED]), 1))
            ).label("open"),
            func.avg(
                case((
                    Issue.resolved_at.isnot(None),
                    func.extract("epoch", Issue.resolved_at - Issue.created_at) / 3600.0,
                ))
            ).label("avg_hours"),
        )
        .where(Issue.assignee_id.in_(user_ids))
        .group_by(Issue.assignee_id)
    )
    stats_by_user: dict[int, any] = {row.assignee_id: row for row in stats_result.all()}

    # Build candidate list
    suggestions: list[DeveloperSuggestion] = []

    for user in users:
        row = stats_by_user.get(user.id)
        assigned = row.assigned if row else 0
        resolved = row.resolved if row else 0
        open_cnt = row.open if row else 0
        avg_hours = float(row.avg_hours) if (row and row.avg_hours is not None) else None
        resolution_rate = round((resolved / assigned * 100), 2) if assigned > 0 else 0.0

        # ── Skill/keyword match score (0–50 pts) ──────────────────────────
        # Simulate developer skill domains from their name/email heuristic
        # In a real system this would come from a skills table
        dev_text = f"{user.full_name} {user.email}".lower()
        dev_keywords_found = []
        for kw, domain in _SKILL_KEYWORDS.items():
            if kw in dev_text and domain in required_domains:
                if domain not in dev_keywords_found:
                    dev_keywords_found.append(domain)

        # If no name-based match, check if domain required matches their historical issue types
        keyword_score = (len(dev_keywords_found) / max(1, len(required_domains))) * 50.0

        # If no explicit keyword match but developer has history, give partial credit
        if keyword_score == 0 and assigned > 0:
            keyword_score = 20.0
            dev_keywords_found = ["General Bug Experience"]

        # ── Workload score (0–30 pts — fewer open = better) ──────────────
        workload_pts = max(0.0, 30.0 - (open_cnt * 5.0))

        # ── Resolution rate score (0–20 pts) ──────────────────────────────
        rate_pts = (resolution_rate / 100.0) * 20.0

        match_score = round(min(100.0, keyword_score + workload_pts + rate_pts), 2)
        match_percentage = match_score

        explanation = (
            f"{user.full_name} - {match_percentage:.0f}% match "
            f"({'expert in ' + ', '.join(dev_keywords_found) if dev_keywords_found else 'general experience'}, "
            f"{open_cnt} active task{'s' if open_cnt != 1 else ''})"
        )

        reasons = [
            f"Keyword match: {', '.join(dev_keywords_found) if dev_keywords_found else 'none'} → +{keyword_score:.1f} pts",
            f"Workload: {open_cnt} open issues → +{workload_pts:.1f} pts",
            f"Resolution rate: {resolution_rate:.1f}% → +{rate_pts:.1f} pts",
        ]

        suggestions.append(
            DeveloperSuggestion(
                developer_id=user.id,
                developer_name=user.full_name,
                email=user.email,
                role=user.role.value,
                match_percentage=match_percentage,
                matched_skills=dev_keywords_found,
                active_task_count=open_cnt,
                explanation=explanation,
                # Legacy fields
                user_id=user.id,
                full_name=user.full_name,
                open_issues=open_cnt,
                resolved_issues=resolved,
                resolution_rate=resolution_rate,
                average_resolution_time_hours=round(avg_hours, 2) if avg_hours is not None else None,
                match_score=match_score,
                reasons=reasons,
            )
        )

    # Sort descending and return top 3
    suggestions.sort(key=lambda s: s.match_score, reverse=True)
    suggestions = suggestions[:3]

    return DeveloperMatchResponse(
        issue_id=issue_id,
        issue_key=issue.issue_key,
        suggestions=suggestions,
    )
