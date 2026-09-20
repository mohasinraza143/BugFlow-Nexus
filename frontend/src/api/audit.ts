import { apiClient } from './client';
import type { AuditLogItem } from '../types/audit';

export interface AuditListParams {
  page?: number;
  page_size?: number;
  action?: string;
  entity_type?: string;
  user_id?: number;
  entity_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface AuditListResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const auditApi = {
  list: async (params?: AuditListParams): Promise<AuditListResponse> => {
    const response = await apiClient.get<AuditListResponse>('/activity', { params });
    return response.data;
  },

  getById: async (id: number): Promise<AuditLogItem> => {
    const response = await apiClient.get<AuditLogItem>(`/activity/${id}`);
    return response.data;
  },
};
