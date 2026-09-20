import type { UserRole } from './auth';

export type AuditAction =
  | 'ISSUE_CREATED'
  | 'ISSUE_UPDATED'
  | 'ISSUE_ASSIGNED'
  | 'ISSUE_STATUS_CHANGED'
  | 'ISSUE_RESOLVED'
  | 'ISSUE_REOPENED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DEACTIVATED'
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'USER_ROLE_CHANGED'
  | 'COMMENT_CREATED'
  | 'COMMENT_UPDATED'
  | 'COMMENT_DELETED'
  | 'ATTACHMENT_UPLOADED'
  | 'ATTACHMENT_DELETED';

export interface AuditActorBrief {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
}

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  actor: AuditActorBrief | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number | null;
  entity_key: string | null;
  description: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
