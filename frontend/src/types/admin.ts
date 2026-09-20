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
