export type IssueType =
  | 'BUG'
  | 'FEATURE_REQUEST'
  | 'ENHANCEMENT'
  | 'TECHNICAL_DEBT'
  | 'SUPPORT_TICKET';

export type Severity = 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type IssueStatus =
  | 'REPORTED'
  | 'TRIAGED'
  | 'ASSIGNED'
  | 'IN_DEVELOPMENT'
  | 'IN_REVIEW'
  | 'IN_TESTING'
  | 'QA_VERIFICATION'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED';

export interface UserBrief {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

export interface ProjectBrief {
  id: number;
  project_key: string;
  name: string;
}

export interface Issue {
  id: number;
  issue_key: string;
  title: string;
  issue_type: IssueType;
  severity: Severity;
  priority: Priority;
  status: IssueStatus;
  project_id: number;
  reporter_id: number;
  assignee_id: number | null;
  sprint_id: number | null;
  estimated_effort: number | null;
  created_at: string;
  updated_at: string;
}

export interface IssueDetail {
  id: number;
  issue_key: string;
  title: string;
  description: string;
  issue_type: IssueType;
  severity: Severity;
  priority: Priority;
  status: IssueStatus;
  environment: string | null;
  steps_to_reproduce: string | null;
  expected_result: string | null;
  actual_result: string | null;
  resolution_summary: string | null;
  resolved_at: string | null;
  project: ProjectBrief;
  reporter: UserBrief;
  assignee: UserBrief | null;
  sprint_id: number | null;
  estimated_effort: number | null;
  created_at: string;
  updated_at: string;
}

export interface IssueCreate {
  project_id: number;
  title: string;
  description: string;
  issue_type?: IssueType;
  severity?: Severity;
  priority?: Priority;
  environment?: string | null;
  steps_to_reproduce?: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  sprint_id?: number | null;
  estimated_effort?: number | null;
}

export interface IssueUpdate {
  title?: string;
  description?: string;
  severity?: Severity;
  priority?: Priority;
  environment?: string | null;
  steps_to_reproduce?: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  sprint_id?: number | null;
  estimated_effort?: number | null;
}

export interface IssueAssign {
  developer_id: number;
}

export interface IssueStatusUpdate {
  status: IssueStatus;
}

export interface IssueResolve {
  resolution_summary: string;
  resolution_notes?: string | null;
}

export interface IssueReopen {
  reason?: string | null;
}

export interface IssueListResponse {
  items: Issue[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
