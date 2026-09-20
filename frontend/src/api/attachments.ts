import { apiClient } from './client';
import type { Attachment, AttachmentListResponse } from '../types/attachment';

export const attachmentsApi = {
  listByIssue: async (
    issueId: number,
    page = 1,
    pageSize = 20
  ): Promise<AttachmentListResponse> => {
    const response = await apiClient.get<AttachmentListResponse>(
      `/issues/${issueId}/attachments`,
      {
        params: { page, page_size: pageSize },
      }
    );
    return response.data;
  },

  upload: async (issueId: number, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<Attachment>(
      `/issues/${issueId}/attachments`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  download: async (attachmentId: number, filename: string): Promise<void> => {
    const response = await apiClient.get(
      `/attachments/${attachmentId}/download`,
      {
        responseType: 'blob',
      }
    );
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  delete: async (attachmentId: number): Promise<void> => {
    await apiClient.delete(`/attachments/${attachmentId}`);
  },
};
