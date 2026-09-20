export type SprintStatus =
  | 'PLANNED'
  | 'ACTIVE'
  | 'IN_PROGRESS'
  | 'READY_FOR_APPROVAL'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface Sprint {
  id: number;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  completed_at: string | null;
  estimated_team_members: number | null;
  working_days: number | null;
  hours_per_day: number | null;
  goal_status: string;
  status: SprintStatus;
  project_id: number;
  created_at: string;
  updated_at: string;
  // Approval workflow
  assigned_tester_id: number | null;
  assigned_tester_name: string | null;
  submitted_by_id: number | null;
  submitted_at: string | null;
  approved_by_id: number | null;
  approved_at: string | null;
  review_comment: string | null;
}

export interface SprintCreate {
  name: string;
  goal?: string | null;
  start_date: string;
  end_date: string;
  project_id: number;
  estimated_team_members?: number | null;
  working_days?: number | null;
  hours_per_day?: number | null;
  issue_ids?: number[];
}

export interface SprintUpdate {
  name?: string;
  goal?: string | null;
  start_date?: string;
  end_date?: string;
  status?: SprintStatus;
  estimated_team_members?: number | null;
  working_days?: number | null;
  hours_per_day?: number | null;
  goal_status?: string | null;
}

export interface SprintExtend {
  new_end_date: string;
}

export interface SprintAssignTester {
  tester_id: number;
}

export interface SprintRequestChanges {
  comment?: string | null;
}

export interface SprintOverview {
  total_sprints: number;
  active_sprint: Sprint | null;
  completed_sprints: number;
  avg_completion_rate: number;
  avg_velocity: number;
  overdue_sprints: number;
}

export interface SprintAnalytics {
  total_issues: number;
  completed_issues: number;
  remaining_issues: number;
  completion_rate: number;
  open_issues: number;
  in_progress_issues: number;
  resolved_issues: number;
  closed_issues: number;
  total_capacity_hours: number | null;
  workload: {
    developer_id: number;
    developer_name: string;
    assigned_issues: number;
    completed_issues: number;
    in_progress_issues: number;
    open_issues: number;
  }[];
  burndown_points: {
    date: string;
    remaining: number;
    ideal: number;
  }[];
  sprint_health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | null;
  is_overdue: boolean;
  days_overdue: number;
  total_estimated_effort: number;
  completed_effort: number;
  remaining_effort: number;
}
