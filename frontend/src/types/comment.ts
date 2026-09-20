import type { UserRole } from './auth';

export interface CommentAuthorBrief {
  id: number;
  full_name: string;
  role: UserRole;
}

export interface Comment {
  id: number;
  issue_id: number;
  author: CommentAuthorBrief;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CommentCreate {
  body: string;
}

export interface CommentUpdate {
  body: string;
}

export interface CommentListResponse {
  items: Comment[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
