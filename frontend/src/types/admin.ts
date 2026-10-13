export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
  developers: number;
  testers: number;
  users: number;
  verified: number;
  unverified: number;
}

export interface InactiveAssigneeItem {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  assigned_issues_count: number;
}

export interface InactiveAssigneeList {
  items: InactiveAssigneeItem[];
}

export interface ProjectStats {
  total: number;
  active: number;
  inactive: number;
}

export interface IssueStatusStats {
  total: number;
  reported: number;
  triaged: number;
  assigned: number;
  in_development: number;
  in_review: number;
  in_testing: number;
  resolved: number;
  closed: number;
  reopened: number;
  unresolved: number;
}

export interface IssueSeverityStats {
  minor: number;
  major: number;
  critical: number;
  blocker: number;
}

export interface IssuePriorityStats {
  low: number;
  medium: number;
  high: number;
  urgent: number;
}

export interface RecentActivity {
  recently_created: number;
  recently_resolved: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
}

export interface ContentStats {
  total_comments: number;
  total_attachments: number;
  total_notifications: number;
  unread_notifications: number;
}

export interface AdminDashboardResponse {
  users: UserStats;
  projects: ProjectStats;
  issues: IssueStatusStats;
  severity: IssueSeverityStats;
  priority: IssuePriorityStats;
  recent: RecentActivity;
  notifications: NotificationStats;
  content: ContentStats;
}

export interface PipelineRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  event: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  commit_message: string;
  author: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  runtime: string;
  steps: string[];
  status: 'passed' | 'running' | 'failed' | 'queued';
}

export interface RenderServiceInfo {
  name: string;
  url: string;
  health_url?: string;
  type: string;
  environment: string;
}

export interface PipelineTelemetryResponse {
  repository: string;
  workflow_name: string;
  branch: string;
  github_reachable: boolean;
  workflow_file: string;
  stages: PipelineStage[];
  services: RenderServiceInfo[];
  runs: PipelineRun[];
}
