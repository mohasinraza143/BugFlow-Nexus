export interface SystemAnalyticsResponse {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_projects: number;
  active_projects: number;
  total_issues: number;
  open_issues: number;
  in_progress_issues: number;
  resolved_issues: number;
  closed_issues: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
}

export interface IssueStatusDistributionResponse {
  REPORTED: number;
  TRIAGED: number;
  ASSIGNED: number;
  IN_DEVELOPMENT: number;
  IN_REVIEW: number;
  IN_TESTING: number;
  QA_VERIFICATION: number;
  RESOLVED: number;
  CLOSED: number;
  REOPENED: number;
}

export interface SeverityDistributionResponse {
  MINOR: number;
  MAJOR: number;
  CRITICAL: number;
  BLOCKER: number;
}

export interface PriorityDistributionResponse {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  URGENT: number;
}

export interface IssueTrendItem {
  date: string;
  created_count: number;
  resolved_count: number;
}

export interface IssueTrendResponse {
  interval: string;
  items: IssueTrendItem[];
  total_created: number;
  total_resolved: number;
}

export interface ProjectAnalyticsResponse {
  project_id: number;
  project_name: string;
  project_key: string;
  total_issues: number;
  open_issues: number;
  in_progress_issues: number;
  resolved_issues: number;
  closed_issues: number;
  critical_issues: number;
  resolution_rate: number;
}

export interface ProjectAnalyticsListResponse {
  items: ProjectAnalyticsResponse[];
  total: number;
}

export interface DeveloperAnalyticsItem {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  assigned_issues: number;
  resolved_issues: number;
  open_issues: number;
  resolution_rate: number;
  average_resolution_time_hours: number | null;
}

export interface DeveloperAnalyticsResponse {
  items: DeveloperAnalyticsItem[];
  total: number;
}

export interface DeveloperWorkloadItem {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  team: string;
  active_tasks: number;
  completed_fixes: number;
  average_mttr_hours: number | null;
}

export interface DeveloperWorkloadResponse {
  items: DeveloperWorkloadItem[];
  total: number;
}

export interface AnalyticsReportDataResponse {
  system_overview: SystemAnalyticsResponse;
  status_distribution: IssueStatusDistributionResponse;
  severity_distribution: SeverityDistributionResponse;
  priority_distribution: PriorityDistributionResponse;
  trends: IssueTrendResponse;
  project_analytics: ProjectAnalyticsResponse[];
  developer_performance: DeveloperAnalyticsItem[];
  generated_at: string;
}

// -------------------------------------------------------------------------- //
// Quality Metrics — Milestone 2
// -------------------------------------------------------------------------- //

export interface QualityMetricsResponse {
  fix_rate_percentage: number;
  mean_time_to_resolution_hours: number | null;
  defect_leakage_rate_percentage: number;
  backlog_health_score: number;
  open_critical_count: number;
  avg_age_open_days: number;
}

// -------------------------------------------------------------------------- //
// Smart Features — Milestone 3 (Mentor formula)
// -------------------------------------------------------------------------- //

// Priority Calculator — mentor formula: severity_weight × category_urgency_weight
export interface PriorityCalcRequest {
  severity: string;   // CRITICAL | MAJOR | MINOR | TRIVIAL
  category: string;   // Security | Database | API | Backend | UI | Colors | Typo
}

export interface PriorityCalcResponse {
  priority_score: number;
  priority: string;
  severity_weight: number;
  category_urgency_weight: number;
  explanation: string;
  // Legacy fields for backward compat
  recommended_priority: string;
  score: number;
  reasoning: string[];
  confidence: string;
}

// Developer Matcher — mentor spec
export interface DeveloperSuggestion {
  developer_id: number;
  developer_name: string;
  email: string;
  role: string;
  match_percentage: number;
  matched_skills: string[];
  active_task_count: number;
  explanation: string;
  // Legacy fields
  user_id: number;
  full_name: string;
  open_issues: number;
  resolved_issues: number;
  resolution_rate: number;
  average_resolution_time_hours: number | null;
  match_score: number;
  reasons: string[];
}

export interface DeveloperMatchResponse {
  issue_id: number;
  issue_key: string;
  suggestions: DeveloperSuggestion[];
}

// Plotly chart data
export interface PlotlyChartsData {
  defect_trends: {
    dates: string[];
    created: number[];
    resolved: number[];
  };
  severity_distribution: Record<string, number>;
  workflow_pipeline: Record<string, number>;
}
