import { apiClient } from './client';
import type {
  ChangePasswordRequest,
  LoginRequest,
  LogoutResponse,
  MessageResponse,
  ProfileUpdateRequest,
  RegisterRequest,
  TokenResponse,
  User,
} from '../types/auth';

export const authApi = {
  register: async (data: RegisterRequest): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>('/auth/register', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/login', data);
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  updateProfile: async (data: ProfileUpdateRequest): Promise<User> => {
    const response = await apiClient.patch<User>('/auth/profile', data);
    return response.data;
  },

  changePassword: async (data: ChangePasswordRequest): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>('/auth/change-password', data);
    return response.data;
  },

  logout: async (): Promise<LogoutResponse> => {
    const response = await apiClient.post<LogoutResponse>('/auth/logout');
    return response.data;
  },
};
