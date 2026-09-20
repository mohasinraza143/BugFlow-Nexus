import { apiClient } from '../api/client';
import type { Sprint, SprintCreate, SprintUpdate, SprintAnalytics, SprintExtend, SprintOverview } from '../types/Sprint';
import type { IssueDetail } from '../types/issue';

export const SprintService = {
  getSprintsByProject: async (projectId: number): Promise<Sprint[]> => {
    const response = await apiClient.get(`/sprints/project/${projectId}`);
    return response.data;
  },

  getProjectSprintSummary: async (projectId: number): Promise<SprintOverview> => {
    const response = await apiClient.get(`/sprints/project/${projectId}/summary`);
    return response.data;
  },

  createSprint: async (data: SprintCreate): Promise<Sprint> => {
    const response = await apiClient.post('/sprints', data);
    return response.data;
  },

  updateSprint: async (sprintId: number, data: SprintUpdate): Promise<Sprint> => {
    const response = await apiClient.patch(`/sprints/${sprintId}`, data);
    return response.data;
  },
  
  startSprint: async (sprintId: number): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/start`);
    return response.data;
  },
  
  completeSprint: async (sprintId: number, moveToSprintId?: number): Promise<Sprint> => {
    let url = `/sprints/${sprintId}/complete`;
    if (moveToSprintId) {
      url += `?move_remaining_to_sprint_id=${moveToSprintId}`;
    }
    const response = await apiClient.post(url);
    return response.data;
  },
  
  archiveSprint: async (sprintId: number): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/archive`);
    return response.data;
  },

  extendSprint: async (sprintId: number, data: SprintExtend): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/extend`, data);
    return response.data;
  },

  deleteSprint: async (sprintId: number): Promise<void> => {
    await apiClient.delete(`/sprints/${sprintId}`);
  },
  
  getSprintAnalytics: async (sprintId: number): Promise<SprintAnalytics> => {
    const response = await apiClient.get(`/sprints/${sprintId}/analytics`, {
      params: { _ts: Date.now() },
    });
    return response.data;
  },
  
  downloadSprintReport: async (sprintId: number, sprintName: string): Promise<void> => {
    try {
      const response = await apiClient.get(`/sprints/${sprintId}/report`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Sprint_Report_${sprintName}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      console.error("Failed to download sprint report", err);
      throw err;
    }
  },

  addIssueToSprint: async (sprintId: number, issueId: number): Promise<IssueDetail> => {
    const response = await apiClient.post(`/sprints/${sprintId}/issues/${issueId}`);
    return response.data;
  },

  removeIssueFromSprint: async (sprintId: number, issueId: number): Promise<IssueDetail> => {
    const response = await apiClient.delete(`/sprints/${sprintId}/issues/${issueId}`);
    return response.data;
  },

  // ── Approval Workflow ─────────────────────────────────────────────────────

  assignTester: async (sprintId: number, testerId: number): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/assign-tester`, { tester_id: testerId });
    return response.data;
  },

  submitForApproval: async (sprintId: number): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/submit-for-approval`);
    return response.data;
  },

  beginWork: async (sprintId: number): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/begin-work`);
    return response.data;
  },

  approveSprint: async (sprintId: number): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/approve`);
    return response.data;
  },

  requestChanges: async (sprintId: number, comment?: string | null): Promise<Sprint> => {
    const response = await apiClient.post(`/sprints/${sprintId}/request-changes`, { comment });
    return response.data;
  },

  getAssignedSprints: async (): Promise<Sprint[]> => {
    const response = await apiClient.get('/sprints/assigned');
    return response.data;
  },

  getAwaitingApprovalSprints: async (): Promise<Sprint[]> => {
    const response = await apiClient.get('/sprints/awaiting-approval');
    return response.data;
  },
};
