import { apiClient } from './client';
import type {
  Project,
  ProjectCreate,
  ProjectListResponse,
  ProjectStatus,
  ProjectUpdate,
} from '../types/project';

export interface ProjectListParams {
  page?: number;
  page_size?: number;
  status?: ProjectStatus;
}

export const projectsApi = {
  list: async (params?: ProjectListParams): Promise<ProjectListResponse> => {
    const response = await apiClient.get<ProjectListResponse>('/projects', {
      params,
    });
    return response.data;
  },

  getById: async (id: number): Promise<Project> => {
    const response = await apiClient.get<Project>(`/projects/${id}`);
    return response.data;
  },

  create: async (data: ProjectCreate): Promise<Project> => {
    const response = await apiClient.post<Project>('/projects', data);
    return response.data;
  },

  update: async (id: number, data: ProjectUpdate): Promise<Project> => {
    const response = await apiClient.patch<Project>(`/projects/${id}`, data);
    return response.data;
  },

  deactivate: async (id: number): Promise<Project> => {
    const response = await apiClient.patch<Project>(`/projects/${id}/deactivate`);
    return response.data;
  },
};
