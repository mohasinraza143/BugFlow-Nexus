export type NotificationType =
  | 'ISSUE_ASSIGNED'
  | 'ISSUE_STATUS_CHANGED'
  | 'ISSUE_RESOLVED'
  | 'ISSUE_REOPENED'
  | 'ISSUE_COMMENTED'
  | 'ISSUE_MENTIONED'
  | 'ATTACHMENT_ADDED'
  | 'USER_ROLE_CHANGED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'ISSUE_REPORTED'
  | 'SPRINT_STARTED'
  | 'SPRINT_ENDED'
  | 'SPRINT_OVERDUE';

export interface NotificationItem {
  id: number;
  notification_type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

export interface NotificationPreference {
  email_enabled: boolean;
  issue_assigned: boolean;
  issue_status_changed: boolean;
  issue_resolved: boolean;
  issue_reopened: boolean;
  issue_commented: boolean;
  attachment_added: boolean;
  updated_at: string;
}

export interface NotificationPreferenceUpdate {
  email_enabled?: boolean;
  issue_assigned?: boolean;
  issue_status_changed?: boolean;
  issue_resolved?: boolean;
  issue_reopened?: boolean;
  issue_commented?: boolean;
  attachment_added?: boolean;
}
