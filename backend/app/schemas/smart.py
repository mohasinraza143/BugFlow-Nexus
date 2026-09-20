"""
Pydantic schemas for Smart Priority Calculator and Smart Developer Matcher.
Updated to match mentor's exact formula specification.
"""

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Smart Priority Calculator                                                    #
# --------------------------------------------------------------------------- #

class PriorityCalcRequest(BaseModel):
    """
    Input for the mentor's priority scoring formula:
      Priority Score = severity_weight × category_urgency_weight
    """
    severity: str = Field(
        ...,
        description="Issue severity: CRITICAL (4), MAJOR (3), MINOR (2), TRIVIAL (1)"
    )
    category: str = Field(
        ...,
        description=(
            "Issue category — determines urgency weight. "
            "High (3): Security, Database. "
            "Medium (2): API, Backend. "
            "Low (1): UI, Colors, Typo/Typos."
        )
    )


class PriorityCalcResponse(BaseModel):
    """
    Result of the mentor's exact priority formula.
    priority_score = severity_weight × category_urgency_weight
    """
    priority_score: float
    priority: str = Field(..., description="LOW | MEDIUM | HIGH | URGENT")
    severity_weight: int
    category_urgency_weight: int
    explanation: str

    # Legacy fields kept for frontend compatibility
    recommended_priority: str
    score: float
    reasoning: list[str]
    confidence: str


# --------------------------------------------------------------------------- #
# Smart Developer Matcher                                                      #
# --------------------------------------------------------------------------- #

class DeveloperSuggestion(BaseModel):
    """Mentor-spec developer suggestion with keyword/skill matching."""

    developer_id: int
    developer_name: str
    email: str
    role: str
    match_percentage: float = Field(..., description="0–100 match score")
    matched_skills: list[str] = Field(..., description="Keywords matched from issue text")
    active_task_count: int = Field(..., description="Current open issues assigned to this developer")
    explanation: str = Field(..., description="e.g. 'John Doe - 92% match (PostgreSQL expert, 1 active task)'")

    # Legacy fields for backward compat with existing frontend
    user_id: int
    full_name: str
    open_issues: int
    resolved_issues: int
    resolution_rate: float
    average_resolution_time_hours: float | None = None
    match_score: float
    reasons: list[str]


class DeveloperMatchResponse(BaseModel):
    """Ranked (top 3) developer suggestions for an issue."""

    issue_id: int
    issue_key: str
    suggestions: list[DeveloperSuggestion]


# --------------------------------------------------------------------------- #
# Git Webhook                                                                  #
# --------------------------------------------------------------------------- #

class WebhookResult(BaseModel):
    """Summary of a processed Git webhook event."""

    received_refs: list[str] = Field(
        default_factory=list,
        description="Issue references extracted (keys like BUG-1 or numeric IDs like #2)"
    )
    received_keys: list[str] = Field(
        default_factory=list,
        description="Legacy field: issue keys extracted from commit messages"
    )
    transitioned: list[str] = Field(..., description="Issues transitioned to IN_TESTING/QA_VERIFICATION")
    not_found: list[str] = Field(..., description="References not found in the database")
    skipped: list[str] = Field(..., description="Issues found but in invalid state for transition")
    message: str
