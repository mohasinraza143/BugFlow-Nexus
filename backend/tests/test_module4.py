"""Module 4 optimization and workload contract tests."""

from app.main import app
from app.models.issue import Issue


def test_developer_workload_route_is_registered() -> None:
    paths = set(app.openapi()["paths"])
    assert "/api/v1/analytics/developer-workload" in paths


def test_issue_performance_indexes_are_declared() -> None:
    index_names = {index.name for index in Issue.__table__.indexes}
    assert {
        "ix_issues_project_status",
        "ix_issues_assignee_status",
        "ix_issues_created_at",
    }.issubset(index_names)


def test_issue_list_supports_skip_and_limit_query_parameters() -> None:
    issue_schema = app.openapi()["paths"]["/issues"]["get"]
    parameter_names = {parameter["name"] for parameter in issue_schema["parameters"]}
    assert {"skip", "limit"}.issubset(parameter_names)
