import { apiClient } from './client';
import type {
  Comment,
  CommentCreate,
  CommentListResponse,
  CommentUpdate,
} from '../types/comment';

export const commentsApi = {
  listByIssue: async (
    issueId: number,
    page = 1,
    pageSize = 20
  ): Promise<CommentListResponse> => {
    const response = await apiClient.get<CommentListResponse>(
      `/issues/${issueId}/comments`,
      {
        params: { page, page_size: pageSize },
      }
    );
    return response.data;
  },

  create: async (issueId: number, data: CommentCreate): Promise<Comment> => {
    const response = await apiClient.post<Comment>(
      `/issues/${issueId}/comments`,
      data
    );
    return response.data;
  },

  update: async (commentId: number, data: CommentUpdate): Promise<Comment> => {
    const response = await apiClient.patch<Comment>(
      `/comments/${commentId}`,
      data
    );
    return response.data;
  },

  delete: async (commentId: number): Promise<void> => {
    await apiClient.delete(`/comments/${commentId}`);
  },
};
