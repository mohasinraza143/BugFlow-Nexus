import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FileDown,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { attachmentsApi } from '../api/attachments';
import { getApiErrorMessage } from '../api/client';
import { issuesApi } from '../api/issues';
import { projectsApi } from '../api/projects';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type {
  Issue,
  IssueCreate,
  IssueStatus,
  IssueType,
  Priority,
  Severity,
} from '../types/issue';
import type { Project } from '../types/project';
import { formatDate } from '../utils/formatters';
import { generateIssuesPdfReport } from '../utils/pdfGenerator';

export const IssuesPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  const isUser = user?.role === 'USER';
  const isTester = user?.role === 'TESTER';
  const isAdmin = user?.role === 'ADMIN';
  const canReport = isUser;

  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [typeFilter, setTypeFilter] = useState<IssueType | ''>('');
  const [projectFilter, setProjectFilter] = useState<number | ''>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Report Defect Modal state (for User / Tester / Admin)
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [formProjectId, setFormProjectId] = useState<number | ''>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formType, setFormType] = useState<IssueType>('BUG');
  const [formSeverity, setFormSeverity] = useState<Severity>('MAJOR');
  const [formPriority, setFormPriority] = useState<Priority>('MEDIUM');
  const [formEnv, setFormEnv] = useState<string>('');
  const [formSteps, setFormSteps] = useState<string>('');
  const [formExpected, setFormExpected] = useState<string>('');
  const [formActual, setFormActual] = useState<string>('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchIssues = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await issuesApi.list({
        page,
        page_size: 15,
        status: statusFilter ? statusFilter : undefined,
        severity: severityFilter ? severityFilter : undefined,
        priority: priorityFilter ? priorityFilter : undefined,
        issue_type: typeFilter ? typeFilter : undefined,
        project_id: projectFilter ? projectFilter : undefined,
        search: searchQuery.trim() ? searchQuery.trim() : undefined,
      });
      setIssues(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await projectsApi.list({ page_size: 100, status: 'ACTIVE' });
      setProjects(data.items);
      if (data.items.length > 0 && formProjectId === '') {
        setFormProjectId(data.items[0].id);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [page, statusFilter, severityFilter, priorityFilter, typeFilter, projectFilter]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if ((params.get('create') === 'true' || params.get('new') === 'true') && canReport) {
      openReportModal();
    }
  }, [location.search, canReport]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchIssues();
  };

  const handleResetFilters = () => {
    setStatusFilter('');
    setSeverityFilter('');
    setPriorityFilter('');
    setTypeFilter('');
    setProjectFilter('');
    setSearchQuery('');
    setPage(1);
  };

  const openReportModal = () => {
    setFormTitle('');
    setFormDesc('');
    setFormType('BUG');
    setFormSeverity('MAJOR');
    setFormPriority('MEDIUM');
    setFormEnv('');
    setFormSteps('');
    setFormExpected('');
    setFormActual('');
    setFormFile(null);
    setFormError(null);
    if (projects.length > 0) {
      setFormProjectId(projects[0].id);
    }
    setIsReportOpen(true);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId) {
      setFormError('Please select a project.');
      return;
    }
    if (formTitle.trim().length < 5) {
      setFormError('Title must be at least 5 characters long.');
      return;
    }
    if (formDesc.trim().length < 10) {
      setFormError('Description must be at least 10 characters long.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: IssueCreate = {
        project_id: Number(formProjectId),
        title: formTitle.trim(),
        description: formDesc.trim(),
        issue_type: formType,
        severity: formSeverity,
        priority: formPriority,
        environment: formEnv.trim() || null,
        steps_to_reproduce: formSteps.trim() || null,
        expected_result: formExpected.trim() || null,
        actual_result: formActual.trim() || null,
      };
      const created = await issuesApi.create(payload);

      // Upload attachment if provided
      if (formFile) {
        try {
          await attachmentsApi.upload(created.id, formFile);
        } catch {
          // File upload failure after issue creation non-fatal
        }
      }

      setIsReportOpen(false);
      setSuccessMsg(`Issue submitted successfully! Your issue has been logged and is now under review.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchIssues();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isUser ? 'My Submitted Issues' : isTester ? 'My Assigned Issues' : 'Issues & Defects'}
          </h1>
          <p className="page-subtitle">
            {isAdmin && 'Showing all defects and issues across the entire organization'}
            {isTester && 'Showing defects assigned to you for investigation'}
            {isUser && 'Showing issues you reported and their current progress'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              const filterText = [
                statusFilter ? `Status: ${statusFilter}` : null,
                severityFilter ? `Severity: ${severityFilter}` : null,
                priorityFilter ? `Priority: ${priorityFilter}` : null,
                searchQuery ? `Search: "${searchQuery}"` : null,
              ].filter(Boolean).join(', ');
              generateIssuesPdfReport(issues, user, filterText || undefined, projects);
            }}
            disabled={issues.length === 0}
            className="btn btn-secondary"
            title="Download formatted PDF report of visible issues"
          >
            <FileDown size={16} />
            <span>Export PDF</span>
          </button>

          {canReport && (
            <button onClick={openReportModal} className="btn btn-primary">
              <Plus size={16} />
              <span>{isUser ? 'Report New Issue' : 'Report Issue'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {successMsg && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            fontWeight: '500',
          }}
        >
          <span>✅ {successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {error && <ErrorMessage message={error} onRetry={fetchIssues} />}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.5rem' }}
              placeholder="Search key, title, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
          </div>

          <button type="submit" className="btn btn-secondary">
            Search
          </button>

          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="btn btn-secondary"
            style={{
              backgroundColor: showFilters ? 'var(--primary-subtle)' : undefined,
              borderColor: showFilters ? 'var(--primary)' : undefined,
            }}
          >
            <SlidersHorizontal size={15} />
            Filters
          </button>

          {(statusFilter || severityFilter || priorityFilter || typeFilter || projectFilter || searchQuery) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-secondary"
              title="Reset all filters"
            >
              <X size={15} />
              Clear
            </button>
          )}
        </form>

        {/* Collapsible Advanced Filters */}
        {showFilters && (
          <div
            style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Project</label>
              <select
                className="form-select"
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value ? Number(e.target.value) : '');
                  setPage(1);
                }}
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_key} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Status</label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as IssueStatus | '');
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="REPORTED">REPORTED</option>
                <option value="TRIAGED">TRIAGED</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="IN_DEVELOPMENT">IN_DEVELOPMENT</option>
                <option value="IN_REVIEW">IN_REVIEW</option>
                <option value="IN_TESTING">IN_TESTING</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
                <option value="REOPENED">REOPENED</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Severity</label>
              <select
                className="form-select"
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value as Severity | '');
                  setPage(1);
                }}
              >
                <option value="">All Severities</option>
                <option value="MINOR">MINOR</option>
                <option value="MAJOR">MAJOR</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="BLOCKER">BLOCKER</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Priority</label>
              <select
                className="form-select"
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value as Priority | '');
                  setPage(1);
                }}
              >
                <option value="">All Priorities</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Type</label>
              <select
                className="form-select"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as IssueType | '');
                  setPage(1);
                }}
              >
                <option value="">All Types</option>
                <option value="BUG">BUG</option>
                <option value="FEATURE_REQUEST">FEATURE_REQUEST</option>
                <option value="ENHANCEMENT">ENHANCEMENT</option>
                <option value="TECHNICAL_DEBT">TECHNICAL_DEBT</option>
                <option value="SUPPORT_TICKET">SUPPORT_TICKET</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Issues Table */}
      {isLoading ? (
        <LoadingSpinner message="Loading defects..." />
      ) : issues.length === 0 ? (
        <EmptyState
          title="No defects found"
          description={
            searchQuery || statusFilter || severityFilter
              ? 'No defects match your selected filter criteria.'
              : isTester
              ? 'No issues have been assigned to you yet.'
              : isUser
              ? 'You have not reported any issues yet. Click "Report New Issue" to get started.'
              : 'There are no defects in your workspace.'
          }
          action={
            canReport ? (
              <button onClick={openReportModal} className="btn btn-primary btn-sm">
                <Plus size={14} />
                Report First Issue
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <Link
                      to={`/issues/${issue.id}`}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '700',
                        color: 'var(--primary)',
                      }}
                    >
                      {issue.issue_key}
                    </Link>
                  </td>
                  <td style={{ maxWidth: '320px' }}>
                    <Link
                      to={`/issues/${issue.id}`}
                      style={{
                        color: 'var(--text-primary)',
                        fontWeight: '500',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {issue.title}
                    </Link>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {issue.issue_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <SeverityBadge severity={issue.severity} />
                  </td>
                  <td>
                    <PriorityBadge priority={issue.priority} />
                  </td>
                  <td>
                    <StatusBadge status={issue.status} />
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDate(issue.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn btn-secondary btn-sm"
          >
            Previous
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0.5rem' }}>
            Page {page} of {totalPages} (Total: {total})
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}

      {/* Report Issue Modal */}
      <Modal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        title={isUser ? "Report a New Issue" : "Report New Defect"}
        maxWidth="680px"
      >
        {formError && (
          <div className="alert-box alert-danger">
            <span>{formError}</span>
          </div>
        )}
        <form onSubmit={handleReportSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="rep-proj">Project *</label>
            <select
              id="rep-proj"
              required
              className="form-select"
              value={formProjectId}
              onChange={(e) => setFormProjectId(Number(e.target.value))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_key} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-title">Create New Issue / Bug *</label>
            <input
              id="rep-title"
              type="text"
              required
              minLength={5}
              maxLength={500}
              className="form-input"
              placeholder="Type your own issue or bug here..."
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="rep-type">Issue Type</label>
              <select
                id="rep-type"
                className="form-select"
                value={formType}
                onChange={(e) => setFormType(e.target.value as IssueType)}
              >
                <option value="BUG">BUG</option>
                <option value="FEATURE_REQUEST">FEATURE REQUEST</option>
                <option value="ENHANCEMENT">ENHANCEMENT</option>
                <option value="TECHNICAL_DEBT">TECHNICAL DEBT</option>
                <option value="SUPPORT_TICKET">SUPPORT TICKET</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rep-sev">Severity</label>
              <select
                id="rep-sev"
                className="form-select"
                value={formSeverity}
                onChange={(e) => setFormSeverity(e.target.value as Severity)}
              >
                <option value="MINOR">MINOR</option>
                <option value="MAJOR">MAJOR</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="BLOCKER">BLOCKER</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rep-prio">Priority</label>
              <select
                id="rep-prio"
                className="form-select"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as Priority)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-env">Environment</label>
            <input
              id="rep-env"
              type="text"
              className="form-input"
              placeholder="e.g. Staging / Chrome v120 / Windows 11"
              value={formEnv}
              onChange={(e) => setFormEnv(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-desc">Description *</label>
            <textarea
              id="rep-desc"
              required
              minLength={10}
              className="form-textarea"
              placeholder="Detailed description of what occurred..."
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-steps">Steps to Reproduce</label>
            <textarea
              id="rep-steps"
              className="form-textarea"
              placeholder="1. Navigate to...\n2. Click on...\n3. Observe error..."
              value={formSteps}
              onChange={(e) => setFormSteps(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="rep-exp">Expected Result</label>
              <textarea
                id="rep-exp"
                className="form-textarea"
                placeholder="What was expected to happen..."
                value={formExpected}
                onChange={(e) => setFormExpected(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rep-act">Actual Result</label>
              <textarea
                id="rep-act"
                className="form-textarea"
                placeholder="What actually happened..."
                value={formActual}
                onChange={(e) => setFormActual(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-file">Attachment (Optional)</label>
            <input
              id="rep-file"
              type="file"
              className="form-input"
              accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.log"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  setFormFile(files[0]);
                } else {
                  setFormFile(null);
                }
              }}
            />
            {formFile && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Selected: {formFile.name} ({(formFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setIsReportOpen(false)}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : isUser ? 'Submit Issue' : 'Submit Defect'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
