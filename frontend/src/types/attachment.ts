import type { UserRole } from './auth';

export interface AttachmentUploaderBrief {
  id: number;
  full_name: string;
  role: UserRole;
}

export interface Attachment {
  id: number;
  issue_id: number;
  uploader: AttachmentUploaderBrief;
  original_filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface AttachmentListResponse {
  items: Attachment[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
