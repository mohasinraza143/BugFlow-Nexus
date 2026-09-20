import { apiClient } from './client';
import type { UserRole } from '../types/auth';
import type {
  UserDetail,
  UserListResponse,
  UserRoleUpdateRequest,
  UserSortField,
  UserUpdateRequest,
} from '../types/user';

export interface UserListParams {
  page?: number;
  page_size?: number;
  search?: string;
  role?: UserRole;
  is_active?: boolean;
  sort_by?: UserSortField;
  sort_desc?: boolean;
}

export const usersApi = {
  list: async (params?: UserListParams): Promise<UserListResponse> => {
    const response = await apiClient.get<UserListResponse>('/users', {
      params,
    });
    return response.data;
  },

  getById: async (id: number): Promise<UserDetail> => {
    const response = await apiClient.get<UserDetail>(`/users/${id}`);
    return response.data;
  },

  update: async (id: number, data: UserUpdateRequest): Promise<UserDetail> => {
    const response = await apiClient.patch<UserDetail>(`/users/${id}`, data);
    return response.data;
  },

  activate: async (id: number): Promise<UserDetail> => {
    const response = await apiClient.patch<UserDetail>(`/users/${id}/activate`);
    return response.data;
  },

  deactivate: async (id: number): Promise<UserDetail> => {
    const response = await apiClient.patch<UserDetail>(`/users/${id}/deactivate`);
    return response.data;
  },

  changeRole: async (
    id: number,
    data: UserRoleUpdateRequest
  ): Promise<UserDetail> => {
    const response = await apiClient.patch<UserDetail>(`/users/${id}/role`, data);
    return response.data;
  },
};
