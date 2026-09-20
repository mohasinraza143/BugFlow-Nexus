import type { UserRole } from './auth';

export type UserSortField =
  | 'id'
  | 'full_name'
  | 'email'
  | 'role'
  | 'is_active'
  | 'is_email_verified'
  | 'created_at';

export interface UserDetail {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  items: UserDetail[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserUpdateRequest {
  full_name?: string;
  email?: string;
}

export interface UserRoleUpdateRequest {
  role: UserRole;
}
