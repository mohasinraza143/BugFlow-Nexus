import { apiClient } from './client';
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationPreference,
  NotificationPreferenceUpdate,
  NotificationType,
  NotificationUnreadCountResponse,
} from '../types/notification';

export interface NotificationFilterParams {
  page?: number;
  page_size?: number;
  unread_only?: boolean;
  notification_type?: NotificationType;
}

export const notificationsApi = {
  /**
   * Get unread notification count.
   */
  getUnreadCount: async (): Promise<number> => {
    const response = await apiClient.get<NotificationUnreadCountResponse>('/notifications/unread-count');
    return response.data.unread_count;
  },

  /**
   * List paginated notifications.
   */
  list: async (params: NotificationFilterParams = {}): Promise<NotificationListResponse> => {
    const response = await apiClient.get<NotificationListResponse>('/notifications', { params });
    return response.data;
  },

  /**
   * Get single notification by ID.
   */
  getById: async (id: number): Promise<NotificationItem> => {
    const response = await apiClient.get<NotificationItem>(`/notifications/${id}`);
    return response.data;
  },

  /**
   * Mark a single notification as read.
   */
  markAsRead: async (id: number): Promise<NotificationItem> => {
    const response = await apiClient.patch<NotificationItem>(`/notifications/${id}/read`);
    return response.data;
  },

  /**
   * Mark all unread notifications as read.
   */
  markAllAsRead: async (): Promise<{ updated_count: number }> => {
    const response = await apiClient.patch<{ updated_count: number }>('/notifications/read-all');
    return response.data;
  },

  /**
   * Delete a single notification.
   */
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/notifications/${id}`);
  },

  /**
   * Get current user's notification preferences.
   */
  getPreferences: async (): Promise<NotificationPreference> => {
    const response = await apiClient.get<NotificationPreference>('/notifications/preferences');
    return response.data;
  },

  /**
   * Update notification preferences.
   */
  updatePreferences: async (body: NotificationPreferenceUpdate): Promise<NotificationPreference> => {
    const response = await apiClient.patch<NotificationPreference>('/notifications/preferences', body);
    return response.data;
  },
};
