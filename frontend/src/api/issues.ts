import { apiClient } from './client';
import type {
  IssueAssign,
  IssueCreate,
  IssueDetail,
  IssueListResponse,
  IssueReopen,
  IssueResolve,
  IssueStatus,
  IssueStatusUpdate,
  IssueType,
  IssueUpdate,
  Priority,
  Severity,
} from '../types/issue';

export interface IssueListParams {
  page?: number;
  page_size?: number;
  status?: IssueStatus;
  severity?: Severity;
  priority?: Priority;
  issue_type?: IssueType;
  project_id?: number;
  reporter_id?: number;
  assignee_id?: number;
  unassigned?: boolean;
  sprint_id?: number;
  backlog?: boolean;
  search?: string;
  sort_by?: string;
  sort_desc?: boolean;
}

export const issuesApi = {
  list: async (params?: IssueListParams): Promise<IssueListResponse> => {
    const response = await apiClient.get<IssueListResponse>('/issues', {
      params,
    });
    return response.data;
  },

  getById: async (id: number): Promise<IssueDetail> => {
    const response = await apiClient.get<IssueDetail>(`/issues/${id}`);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/issues/${id}`);
  },

  create: async (data: IssueCreate): Promise<IssueDetail> => {
    const response = await apiClient.post<IssueDetail>('/issues', data);
    return response.data;
  },

  update: async (id: number, data: IssueUpdate): Promise<IssueDetail> => {
    const response = await apiClient.patch<IssueDetail>(`/issues/${id}`, data);
    return response.data;
  },

  assign: async (id: number, data: IssueAssign): Promise<IssueDetail> => {
    const response = await apiClient.patch<IssueDetail>(`/issues/${id}/assign`, data);
    window.dispatchEvent(new Event('issue:assigned'));
    return response.data;
  },

  updateStatus: async (id: number, data: IssueStatusUpdate): Promise<IssueDetail> => {
    const response = await apiClient.patch<IssueDetail>(`/issues/${id}/status`, data);
    return response.data;
  },

  resolve: async (id: number, data: IssueResolve): Promise<IssueDetail> => {
    const response = await apiClient.patch<IssueDetail>(`/issues/${id}/resolve`, data);
    return response.data;
  },

  reopen: async (id: number, data: IssueReopen): Promise<IssueDetail> => {
    const response = await apiClient.patch<IssueDetail>(`/issues/${id}/reopen`, data);
    return response.data;
  },

  close: async (id: number): Promise<IssueDetail> => {
    const response = await apiClient.patch<IssueDetail>(`/issues/${id}/close`);
    return response.data;
  },

  getActivity: async (id: number): Promise<import('../types/audit').AuditLogItem[]> => {
    const response = await apiClient.get<import('../types/audit').AuditLogItem[]>(
      `/issues/${id}/activity`
    );
    return response.data;
  },
  
  bulkAssignSprint: async (data: { issue_ids: number[]; sprint_id: number | null }): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/issues/bulk-assign-sprint', data);
    window.dispatchEvent(new Event('issue:sprint-updated'));
    return response.data;
  },
};

