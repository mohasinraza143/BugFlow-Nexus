import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  CheckCircle2,
  Download,
  Eye,
  FileCode,
  FileDown,
  FileImage,
  FileText,
  History,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { attachmentsApi } from '../api/attachments';
import { getApiErrorMessage } from '../api/client';
import { commentsApi } from '../api/comments';
import { issuesApi } from '../api/issues';
import { usersApi } from '../api/users';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type { Attachment } from '../types/attachment';
import type { AuditLogItem } from '../types/audit';
import type { Comment } from '../types/comment';
import type { IssueDetail, IssueStatus } from '../types/issue';
import type { UserDetail } from '../types/user';
import { formatDate, formatFileSize, formatRelativeTime } from '../utils/formatters';
import { generateSingleIssuePdfReport } from '../utils/pdfGenerator';

export const IssueDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const issueId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLogItem[]>([]);
  const [developers, setDevelopers] = useState<UserDetail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Tab: Details, Activity Timeline, Discussion
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'TIMELINE' | 'COMMENTS'>('DETAILS');

  // Modals & Action States
  const [isAssignOpen, setIsAssignOpen] = useState<boolean>(false);
  const [selectedDevId, setSelectedDevId] = useState<number | ''>('');
  const [isResolveOpen, setIsResolveOpen] = useState<boolean>(false);
  const [resolutionSummary, setResolutionSummary] = useState<string>('');
  const [isReopenOpen, setIsReopenOpen] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [newCommentBody, setNewCommentBody] = useState<string>('');
  const [isActionSubmitting, setIsActionSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Image Preview Modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageName, setPreviewImageName] = useState<string>('');

  // Drag and drop attachment state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchIssueData = async () => {
    if (!issueId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [issueData, commentsData, attachmentsData] = await Promise.all([
        issuesApi.getById(issueId),
        commentsApi.listByIssue(issueId),
        attachmentsApi.listByIssue(issueId),
      ]);
      setIssue(issueData);
      setComments(commentsData.items || []);
      setAttachments(attachmentsData.items || []);

      // Fetch activity timeline
      try {
        const activityData = await issuesApi.getActivity(issueId);
        setActivityLogs(activityData || []);
      } catch {
        // Activity timeline non-fatal fallback
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDevelopers = async () => {
    if (user?.role === 'ADMIN') {
      try {
        const data = await usersApi.list({ role: 'TESTER', is_active: true });
        setDevelopers(data.items || []);
        if (data.items.length > 0) {
          setSelectedDevId(data.items[0].id);
        }
      } catch {
        // Ignore
      }
    }
  };

  useEffect(() => {
    fetchIssueData();
    fetchDevelopers();
  }, [issueId]);

  // Actions
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevId) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const updated = await issuesApi.assign(issueId, { developer_id: Number(selectedDevId) });
      setIssue(updated);
      setIsAssignOpen(false);
      fetchIssueData();
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleStatusTransition = async (newStatus: IssueStatus) => {
    setIsActionSubmitting(true);
    try {
      const updated = await issuesApi.updateStatus(issueId, { status: newStatus });
      setIssue(updated);
      window.dispatchEvent(new Event('issue:status-updated'));
      fetchIssueData();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resolutionSummary.trim().length < 10) {
      setActionError('Resolution summary must be at least 10 characters long.');
      return;
    }
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const updated = await issuesApi.resolve(issueId, {
        resolution_summary: resolutionSummary.trim(),
      });
      setIssue(updated);
      setIsResolveOpen(false);
      setResolutionSummary('');
      window.dispatchEvent(new Event('issue:status-updated'));
      fetchIssueData();
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!window.confirm('Confirm that this issue has been successfully resolved?')) return;
    setIsActionSubmitting(true);
    try {
      const updated = await issuesApi.close(issueId);
      setIssue(updated);
      fetchIssueData();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const updated = await issuesApi.reopen(issueId, {
        reason: reopenReason.trim() || undefined,
      });
      setIssue(updated);
      setIsReopenOpen(false);
      setReopenReason('');
      fetchIssueData();
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleDeleteIssue = async () => {
    if (!issue || !window.confirm(`Delete issue ${issue.issue_key}? This cannot be undone.`)) return;
    setIsActionSubmitting(true);
    try {
      await issuesApi.delete(issue.id);
      navigate('/issues');
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
      setIsActionSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentBody.trim()) return;
    try {
      const created = await commentsApi.create(issueId, { body: newCommentBody.trim() });
      setComments((prev) => [created, ...prev]);
      setNewCommentBody('');
      // Refresh activity timeline
      issuesApi.getActivity(issueId).then((act) => setActivityLogs(act || [])).catch(() => {});
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      await commentsApi.delete(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    }
  };

  const uploadFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds maximum limit of 10MB.');
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await attachmentsApi.upload(issueId, file);
      setAttachments((prev) => [uploaded, ...prev]);
      // Refresh activity timeline
      issuesApi.getActivity(issueId).then((act) => setActivityLogs(act || [])).catch(() => {});
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;
    try {
      await attachmentsApi.delete(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    }
  };

  const isImageFile = (filename: string) => {
    return /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(filename);
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading defect details..." />;
  }

  if (error || !issue) {
    return <ErrorMessage message={error || 'Defect not found'} onRetry={fetchIssueData} />;
  }

  const isAssignedDev = (user?.role === 'TESTER' || user?.role === 'DEVELOPER') && issue.assignee?.id === user?.id;
  const isReporter = issue.reporter?.id === user?.id;
  const canReopen = (isReporter || user?.role === 'ADMIN') && ['RESOLVED', 'CLOSED', 'IN_TESTING'].includes(issue.status);
  const canClose = (isReporter || user?.role === 'ADMIN') && issue.status === 'RESOLVED';

  // Issue Progress Steps Calculation
  const progressSteps = [
    { key: 'REPORTED', label: '1. Reported', sub: 'Submitted by User' },
    { key: 'ASSIGNED', label: '2. Assigned', sub: 'Assigned to Tester' },
    { key: 'IN_PROGRESS', label: '3. In Progress', sub: 'Investigation / Fix' },
    { key: 'RESOLVED', label: '4. Resolved', sub: 'Fixed by Tester' },
    { key: 'CLOSED', label: '5. Closed', sub: 'Confirmed by User' },
  ];

  const getStepStatus = (stepKey: string): 'completed' | 'active' | 'upcoming' => {
    const s = issue.status;
    if (s === 'REOPENED') {
      if (stepKey === 'REPORTED' || stepKey === 'ASSIGNED') return 'completed';
      if (stepKey === 'IN_PROGRESS') return 'active';
      return 'upcoming';
    }
    if (s === 'CLOSED') return 'completed';
    if (s === 'RESOLVED') {
      if (stepKey === 'CLOSED') return 'upcoming';
      if (stepKey === 'RESOLVED') return 'active';
      return 'completed';
    }
    if (['IN_DEVELOPMENT', 'IN_REVIEW', 'IN_TESTING'].includes(s)) {
      if (['REPORTED', 'ASSIGNED'].includes(stepKey)) return 'completed';
      if (stepKey === 'IN_PROGRESS') return 'active';
      return 'upcoming';
    }
    if (s === 'ASSIGNED') {
      if (stepKey === 'REPORTED') return 'completed';
      if (stepKey === 'ASSIGNED') return 'active';
      return 'upcoming';
    }
    if (['REPORTED', 'TRIAGED'].includes(s)) {
      if (stepKey === 'REPORTED') return 'active';
      return 'upcoming';
    }
    return 'upcoming';
  };

  return (
    <div>
      {/* Back button & Title Bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          onClick={() => navigate('/issues')}
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: '0.75rem' }}
        >
          <ArrowLeft size={14} />
          Back to Issues
        </button>

        <div className="page-header" style={{ marginBottom: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  color: 'var(--primary)',
                }}
              >
                {issue.issue_key}
              </span>
              <StatusBadge status={issue.status} />
              <SeverityBadge severity={issue.severity} />
              <PriorityBadge priority={issue.priority} />
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {issue.project.project_key}
              </span>
            </div>
            <h1 className="page-title" style={{ fontSize: '1.5rem', margin: 0 }}>
              {issue.title}
            </h1>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {user?.role === 'ADMIN' && (
              <button onClick={() => setIsAssignOpen(true)} className="btn btn-secondary btn-sm">
                <UserPlus size={14} />
                {issue.assignee ? 'Reassign Tester' : 'Assign Tester'}
              </button>
            )}

            {isAssignedDev && (
              <>
                {['REPORTED', 'TRIAGED', 'ASSIGNED'].includes(issue.status) && (
                  <button
                    onClick={() => handleStatusTransition('IN_DEVELOPMENT')}
                    disabled={isActionSubmitting}
                    className="btn btn-primary btn-sm"
                  >
                    Start Investigation
                  </button>
                )}
                {issue.status === 'IN_DEVELOPMENT' && (
                  <button
                    onClick={() => handleStatusTransition('IN_REVIEW')}
                    disabled={isActionSubmitting}
                    className="btn btn-secondary btn-sm"
                  >
                    Submit for Review
                  </button>
                )}
                {issue.status === 'IN_REVIEW' && (
                  <button
                    onClick={() => handleStatusTransition('IN_TESTING')}
                    disabled={isActionSubmitting}
                    className="btn btn-secondary btn-sm"
                  >
                    Ready for Verification
                  </button>
                )}
                {issue.status === 'REOPENED' && (
                  <button
                    onClick={() => handleStatusTransition('IN_DEVELOPMENT')}
                    disabled={isActionSubmitting}
                    className="btn btn-primary btn-sm"
                  >
                    Restart Investigation
                  </button>
                )}
                {!['RESOLVED', 'CLOSED'].includes(issue.status) && (
                  <button onClick={() => setIsResolveOpen(true)} className="btn btn-primary btn-sm">
                    <CheckCircle size={14} />
                    Resolve Issue
                  </button>
                )}
              </>
            )}

            {canClose && (
              <button
                onClick={handleConfirmClose}
                disabled={isActionSubmitting}
                className="btn btn-primary btn-sm"
                style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
              >
                <CheckCircle2 size={14} />
                Confirm Resolution
              </button>
            )}

            {canReopen && (
              <button onClick={() => setIsReopenOpen(true)} className="btn btn-outline-danger btn-sm">
                <RotateCcw size={14} />
                Reopen Issue
              </button>
            )}

            {(user?.role === 'ADMIN' || issue.reporter?.id === user?.id) && (
              <button
                onClick={handleDeleteIssue}
                disabled={isActionSubmitting}
                className="btn btn-outline-danger btn-sm"
                title="Delete issue"
              >
                <Trash2 size={14} />
                Delete Issue
              </button>
            )}

            <button
              onClick={() => issue && generateSingleIssuePdfReport(issue, comments)}
              className="btn btn-secondary btn-sm"
              title="Download neat PDF defect report"
            >
              <FileDown size={14} />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Visual Issue Progress Tracker */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
            WORKFLOW PROGRESS
          </span>
          {issue.status === 'REOPENED' && (
            <span className="badge" style={{ backgroundColor: 'var(--danger-subtle)', color: '#f87171', fontWeight: '700' }}>
              <RotateCcw size={12} /> REOPENED DEFECT
            </span>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            position: 'relative',
          }}
        >
          {progressSteps.map((step) => {
            const stepStatus = getStepStatus(step.key);
            const isCompleted = stepStatus === 'completed';
            const isActive = stepStatus === 'active';

            return (
              <div
                key={step.key}
                style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive
                    ? 'rgba(99, 102, 241, 0.15)'
                    : isCompleted
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'var(--bg-surface-elevated)',
                  border: '1px solid',
                  borderColor: isActive
                    ? 'var(--primary)'
                    : isCompleted
                    ? 'rgba(16, 185, 129, 0.3)'
                    : 'var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: isActive ? 'var(--primary)' : isCompleted ? '#34d399' : 'var(--text-muted)',
                    }}
                  >
                    {step.label}
                  </span>
                  {isCompleted ? (
                    <Check size={14} color="#34d399" />
                  ) : isActive ? (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                  ) : (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--border-muted)' }} />
                  )}
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  {step.sub}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Resolution Confirmation Card (When RESOLVED) */}
      {issue.status === 'RESOLVED' && (
        <div
          className="card"
          style={{
            marginBottom: '1.5rem',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(99, 102, 241, 0.12) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ maxWidth: '650px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <CheckCircle2 size={20} color="#34d399" />
                <h3 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>
                  Has your issue been resolved?
                </h3>
                <span className="badge" style={{ backgroundColor: 'var(--success-subtle)', color: '#34d399', fontWeight: '600' }}>
                  Pending Confirmation
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                The tester has marked this defect as resolved. Please review the resolution details below and confirm whether the problem is fixed.
              </p>
              {issue.resolution_summary && (
                <div
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <strong style={{ color: '#34d399' }}>Resolution Summary: </strong>
                  {issue.resolution_summary}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                onClick={handleConfirmClose}
                disabled={isActionSubmitting}
                className="btn btn-primary"
                style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: '600' }}
              >
                <CheckCircle2 size={16} />
                <span>YES — Confirm Resolution</span>
              </button>
              <button
                onClick={() => setIsReopenOpen(true)}
                disabled={isActionSubmitting}
                className="btn btn-outline-danger"
              >
                <RotateCcw size={16} />
                <span>NO — Reopen Issue</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs (Details, Activity Timeline, Discussion) */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          onClick={() => setActiveTab('DETAILS')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: activeTab === 'DETAILS' ? 'var(--primary-subtle)' : 'transparent',
            color: activeTab === 'DETAILS' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'DETAILS' ? '700' : '500',
            fontSize: '0.9rem',
          }}
        >
          <FileText size={16} />
          <span>Defect Details</span>
        </button>

        <button
          onClick={() => setActiveTab('TIMELINE')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: activeTab === 'TIMELINE' ? 'var(--primary-subtle)' : 'transparent',
            color: activeTab === 'TIMELINE' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'TIMELINE' ? '700' : '500',
            fontSize: '0.9rem',
          }}
        >
          <History size={16} />
          <span>Activity Timeline ({activityLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('COMMENTS')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: activeTab === 'COMMENTS' ? 'var(--primary-subtle)' : 'transparent',
            color: activeTab === 'COMMENTS' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'COMMENTS' ? '700' : '500',
            fontSize: '0.9rem',
          }}
        >
          <MessageSquare size={16} />
          <span>Discussion ({comments.length})</span>
        </button>
      </div>

      {/* Main Grid: Left Tab Content & Right Metadata Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Left Column: Tab Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {activeTab === 'DETAILS' && (
            <>
              {/* Defect Description Card */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Defect Description</h3>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Overview</h4>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.95rem' }}>{issue.description}</p>
                  </div>

                  {issue.steps_to_reproduce && (
                    <div>
                      <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Steps to Reproduce</h4>
                      <div
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          padding: '0.85rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.85rem',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {issue.steps_to_reproduce}
                      </div>
                    </div>
                  )}

                  {(issue.expected_result || issue.actual_result) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      {issue.expected_result && (
                        <div>
                          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Expected Result</h4>
                          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <p style={{ fontSize: '0.9rem', color: '#6ee7b7', margin: 0 }}>{issue.expected_result}</p>
                          </div>
                        </div>
                      )}
                      {issue.actual_result && (
                        <div>
                          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Actual Result</h4>
                          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <p style={{ fontSize: '0.9rem', color: '#fca5a5', margin: 0 }}>{issue.actual_result}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {issue.resolution_summary && (
                    <div
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', color: '#34d399', fontWeight: '600', fontSize: '0.875rem' }}>
                        <CheckCircle size={16} />
                        Resolution Summary {issue.resolved_at && `(Resolved on ${formatDate(issue.resolved_at)})`}
                      </div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {issue.resolution_summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Attachments Section */}
              <div className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Paperclip size={18} color="#818cf8" />
                    <h3 className="card-title">Attachments ({attachments.length})</h3>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary btn-sm"
                    disabled={isUploading}
                  >
                    <Upload size={14} />
                    <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileInputChange}
                    style={{ display: 'none' }}
                    accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.log"
                  />
                </div>

                <div className="card-body">
                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--border-subtle)',
                      backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-input)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      marginBottom: '1rem',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Upload size={24} color="#818cf8" style={{ margin: '0 auto 0.5rem' }} />
                    <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>
                      Drag and drop screenshots, logs, or reports here
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      Supports PNG, JPG, PDF, TXT, LOG up to 10MB
                    </p>
                  </div>

                  {attachments.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
                      No files attached yet.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {attachments.map((att) => {
                        const isImg = isImageFile(att.original_filename);
                        return (
                          <div
                            key={att.id}
                            style={{
                              padding: '0.75rem 1rem',
                              backgroundColor: 'var(--bg-surface-elevated)',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border-subtle)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '1rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                              {isImg ? (
                                <FileImage size={22} color="#818cf8" />
                              ) : att.original_filename.endsWith('.pdf') ? (
                                <FileText size={22} color="#f87171" />
                              ) : (
                                <FileCode size={22} color="#34d399" />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '320px',
                                  }}
                                >
                                  {att.original_filename}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {formatFileSize(att.file_size)} • Uploaded by {att.uploader.full_name} ({formatDate(att.created_at)})
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                              {isImg && (
                                <button
                                  onClick={() => {
                                    setPreviewImageUrl(`/api/v1/attachments/${att.id}/download`);
                                    setPreviewImageName(att.original_filename);
                                  }}
                                  className="btn btn-secondary btn-sm"
                                  title="Preview Image"
                                >
                                  <Eye size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => attachmentsApi.download(att.id, att.original_filename)}
                                className="btn btn-secondary btn-sm"
                                title="Download"
                              >
                                <Download size={14} />
                              </button>
                              {(user?.role === 'ADMIN' || user?.id === att.uploader.id) && (
                                <button
                                  onClick={() => handleDeleteAttachment(att.id)}
                                  className="btn btn-outline-danger btn-sm"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'TIMELINE' && (
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={18} color="#818cf8" />
                  <h3 className="card-title">Issue Activity Timeline</h3>
                </div>
              </div>

              <div className="card-body">
                {activityLogs.length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                    No audit records available for this issue.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                    {activityLogs.map((log, index) => (
                      <div
                        key={log.id || index}
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          padding: '0.85rem 1rem',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor:
                              log.action === 'ISSUE_RESOLVED'
                                ? 'var(--success-subtle)'
                                : log.action === 'ISSUE_REOPENED'
                                ? 'var(--danger-subtle)'
                                : 'var(--primary-subtle)',
                            color:
                              log.action === 'ISSUE_RESOLVED'
                                ? '#34d399'
                                : log.action === 'ISSUE_REOPENED'
                                ? '#f87171'
                                : '#818cf8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontWeight: '700',
                            fontSize: '0.85rem',
                          }}
                        >
                          {log.actor?.full_name ? log.actor.full_name.charAt(0).toUpperCase() : 'S'}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '600', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                                {log.actor?.full_name || 'System'}
                              </span>
                              {log.actor?.role && (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.65rem',
                                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                    color: '#818cf8',
                                  }}
                                >
                                  {log.actor.role}
                                </span>
                              )}
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.65rem',
                                  backgroundColor: 'var(--bg-surface)',
                                  color: 'var(--text-secondary)',
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                {log.action}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {formatRelativeTime(log.created_at)}
                            </span>
                          </div>

                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem 0' }}>
                            {log.description}
                          </p>

                          {log.old_values && log.new_values && log.new_values.status && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Status changed:</span>
                              <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                                {log.old_values.status}
                              </span>
                              <span>→</span>
                              <span style={{ fontWeight: '700', color: 'var(--primary)' }}>
                                {log.new_values.status}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'COMMENTS' && (
            /* Comments & Discussion Section */
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageSquare size={18} color="#818cf8" />
                  <h3 className="card-title">Comments & Discussion ({comments.length})</h3>
                </div>
              </div>

              <div className="card-body">
                {/* Comment Post Form */}
                <form onSubmit={handleAddComment} style={{ marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <textarea
                      className="form-textarea"
                      placeholder="Add a comment, question, or update..."
                      value={newCommentBody}
                      onChange={(e) => setNewCommentBody(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Comments are visible to User, Admin, and assigned Tester.
                    </span>
                    <button type="submit" disabled={!newCommentBody.trim()} className="btn btn-primary btn-sm">
                      <Send size={13} />
                      <span>Post Comment</span>
                    </button>
                  </div>
                </form>

                {/* Comment List */}
                {comments.length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                    No comments yet. Start the discussion above.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          padding: '1rem',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--primary-subtle)',
                                color: '#818cf8',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '700',
                                fontSize: '0.75rem',
                              }}
                            >
                              {comment.author.full_name ? comment.author.full_name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <span style={{ fontWeight: '600', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                              {comment.author.full_name}
                            </span>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.65rem',
                                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                color: '#818cf8',
                              }}
                            >
                              {comment.author.role}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {formatRelativeTime(comment.created_at)}
                            </span>
                          </div>

                          {(user?.role === 'ADMIN' || user?.id === comment.author.id) && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="btn-icon-only"
                              style={{ color: 'var(--text-muted)' }}
                              title="Delete comment"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.5', margin: 0 }}>
                          {comment.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Metadata Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Defect Metadata</h3>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Project</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                  {issue.project.project_key} — {issue.project.name}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Issue Type</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{issue.issue_type}</span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Environment</span>
                <span>{issue.environment || 'Not specified'}</span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Estimated Effort</span>
                {issue.estimated_effort ? (
                  <span style={{ fontWeight: 'bold', backgroundColor: 'var(--bg-secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {issue.estimated_effort} pts
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Not estimated</span>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Assignee (Tester)</span>
                {issue.assignee ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <User size={14} color="var(--primary)" />
                    <span style={{ fontWeight: '600' }}>{issue.assignee.full_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({issue.assignee.role})</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--warning)', fontWeight: '500' }}>Unassigned (Pending Admin)</span>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Reporter (User)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <UserCheck size={14} color="#34d399" />
                  <span style={{ fontWeight: '600' }}>{issue.reporter.full_name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({issue.reporter.role})</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Created At</span>
                <span>{formatDate(issue.created_at)}</span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Last Updated</span>
                <span>{formatDate(issue.updated_at)}</span>
              </div>

              {issue.resolved_at && (
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Resolved At</span>
                  <span style={{ color: '#34d399', fontWeight: '600' }}>{formatDate(issue.resolved_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImageUrl && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewImageUrl(null)}
          title={`Preview: ${previewImageName}`}
        >
          <div style={{ textAlign: 'center' }}>
            <img
              src={previewImageUrl}
              alt={previewImageName}
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 'var(--radius-md)' }}
            />
          </div>
        </Modal>
      )}

      {/* Assign Developer Modal (ADMIN only) */}
      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title="Assign Issue to Tester"
      >
        {actionError && (
          <div className="alert-box alert-danger">
            <span>{actionError}</span>
          </div>
        )}
        <form onSubmit={handleAssignSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="dev-select">
              Select Active Tester
            </label>
            <select
              id="dev-select"
              required
              className="form-select"
              value={selectedDevId}
              onChange={(e) => setSelectedDevId(Number(e.target.value))}
            >
              {developers.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.full_name} ({dev.email})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setIsAssignOpen(false)}
              className="btn btn-secondary"
              disabled={isActionSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isActionSubmitting}>
              {isActionSubmitting ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Resolve Defect Modal (TESTER only) */}
      <Modal
        isOpen={isResolveOpen}
        onClose={() => setIsResolveOpen(false)}
        title="Mark Defect as Resolved"
      >
        {actionError && (
          <div className="alert-box alert-danger">
            <span>{actionError}</span>
          </div>
        )}
        <form onSubmit={handleResolveSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="res-summary">
              Resolution Summary (min 10 characters) *
            </label>
            <textarea
              id="res-summary"
              required
              minLength={10}
              rows={4}
              className="form-textarea"
              placeholder="Explain how the issue was fixed, root cause, and changes made..."
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setIsResolveOpen(false)}
              className="btn btn-secondary"
              disabled={isActionSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isActionSubmitting}>
              {isActionSubmitting ? 'Resolving...' : 'Confirm Resolution'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reopen Defect Modal */}
      <Modal
        isOpen={isReopenOpen}
        onClose={() => setIsReopenOpen(false)}
        title="Reopen Defect"
      >
        {actionError && (
          <div className="alert-box alert-danger">
            <span>{actionError}</span>
          </div>
        )}
        <form onSubmit={handleReopenSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reopen-reason">
              Reason for Reopening (Optional)
            </label>
            <textarea
              id="reopen-reason"
              rows={3}
              className="form-textarea"
              placeholder="Explain why the fix did not work or if the bug persists..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setIsReopenOpen(false)}
              className="btn btn-secondary"
              disabled={isActionSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={isActionSubmitting}>
              {isActionSubmitting ? 'Reopening...' : 'Reopen Defect'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
