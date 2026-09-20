import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle2,
  CheckCheck,
  ClipboardCheck,
  Clock,
  Eye,
  FlaskConical,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { analyticsApi } from '../api/analytics';
import { getApiErrorMessage } from '../api/client';
import { issuesApi } from '../api/issues';
import { SprintService } from '../services/SprintService';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type {
  IssueStatusDistributionResponse,
  PriorityDistributionResponse,
  SeverityDistributionResponse,
} from '../types/analytics';
import type { Issue } from '../types/issue';
import type { Sprint } from '../types/Sprint';
import { formatDate, formatRelativeTime } from '../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TESTER_VALID_TRANSITIONS: Record<string, string[]> = {
  REPORTED: ['IN_DEVELOPMENT'],
  TRIAGED: ['IN_DEVELOPMENT'],
  ASSIGNED: ['IN_DEVELOPMENT'],
  IN_DEVELOPMENT: ['IN_REVIEW'],
  IN_REVIEW: ['IN_TESTING', 'IN_DEVELOPMENT'],
  REOPENED: ['IN_DEVELOPMENT'],
};

const RESOLVABLE_STATUSES = new Set([
  'IN_REVIEW',
  'IN_TESTING',
  'IN_DEVELOPMENT',
  'ASSIGNED',
]);

const REOPENABLE_STATUSES = new Set(['RESOLVED', 'CLOSED', 'IN_TESTING']);

function getWorkflowLabel(status: string): string {
  switch (status) {
    case 'REPORTED':
    case 'TRIAGED':
    case 'ASSIGNED':
      return 'Start Investigation';
    case 'IN_DEVELOPMENT':
      return 'Move to Review';
    case 'IN_REVIEW':
      return 'Begin In-Testing';
    case 'REOPENED':
      return 'Resume Investigation';
    default:
      return 'Update Status';
  }
}

function getNextStatus(current: string): string | null {
  const transitions = TESTER_VALID_TRANSITIONS[current];
  if (!transitions || transitions.length === 0) return null;
  // For IN_REVIEW we prefer IN_TESTING as the "forward" action
  if (current === 'IN_REVIEW') return 'IN_TESTING';
  return transitions[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini chart: horizontal bar
// ─────────────────────────────────────────────────────────────────────────────

interface BarRowProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const BarRow: React.FC<BarRowProps> = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '0.3rem',
          fontSize: '0.8rem',
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
          {count}
          <span style={{ color: 'var(--text-muted)', fontWeight: '400', marginLeft: '0.3rem' }}>
            ({pct}%)
          </span>
        </span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '4px',
          backgroundColor: 'var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            backgroundColor: color,
            borderRadius: '4px',
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Metric card
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconClass: string;
  valueColor?: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon,
  iconClass,
  valueColor,
  subtitle,
}) => (
  <div className="metric-card">
    <div className="metric-info">
      <span className="metric-label">{label}</span>
      <span className="metric-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
          {subtitle}
        </span>
      )}
    </div>
    <div className={`metric-icon-box ${iconClass}`}>{icon}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

export const TesterDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  // ── Data state ──
  const [issues, setIssues] = useState<Issue[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusDist, setStatusDist] = useState<IssueStatusDistributionResponse | null>(null);
  const [severityDist, setSeverityDist] = useState<SeverityDistributionResponse | null>(null);
  const [priorityDist, setPriorityDist] = useState<PriorityDistributionResponse | null>(null);

  // ── Sprint state ──
  const [assignedSprints, setAssignedSprints] = useState<Sprint[]>([]);
  const [sprintSubmitting, setSprintSubmitting] = useState<number | null>(null);

  // ── UI state ──
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<number | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');

  // ─────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [issuesRes, statusRes, sevRes, priRes] = await Promise.all([
        issuesApi.list({ page_size: 100 }),
        analyticsApi.getStatusDistribution(),
        analyticsApi.getSeverityDistribution(),
        analyticsApi.getPriorityDistribution(),
      ]);

      setIssues(issuesRes.items || []);
      setTotalCount(issuesRes.total || 0);
      setStatusDist(statusRes);
      setSeverityDist(sevRes);
      setPriorityDist(priRes);

      // Load assigned sprints (non-critical)
      try {
        const sprints = await SprintService.getAssignedSprints();
        setAssignedSprints(sprints);
      } catch { /* ignore */ }

    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─────────────────────────────────────────────────────────────────
  // Derived metrics
  // ─────────────────────────────────────────────────────────────────

  const assignedCount = statusDist?.ASSIGNED ?? 0;
  const inDevCount = statusDist?.IN_DEVELOPMENT ?? 0;
  const inReviewCount = statusDist?.IN_REVIEW ?? 0;
  const inTestingCount = statusDist?.IN_TESTING ?? 0;
  const resolvedCount = statusDist?.RESOLVED ?? 0;
  const closedCount = statusDist?.CLOSED ?? 0;
  const reopenedCount = statusDist?.REOPENED ?? 0;

  const inProgressCount = inDevCount + inReviewCount + inTestingCount;
  const awaitingVerificationCount = inTestingCount; // tester is in-testing stage
  const openCount = assignedCount + inProgressCount + reopenedCount;
  const resolutionRate =
    totalCount > 0 ? Math.round(((resolvedCount + closedCount) / totalCount) * 100) : 0;

  // ─────────────────────────────────────────────────────────────────
  // Derived issue lists
  // ─────────────────────────────────────────────────────────────────

  const actionRequired = useMemo(
    () => issues.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED').slice(0, 5),
    [issues]
  );

  const recentIssues = useMemo(
    () =>
      [...issues]
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
        )
        .slice(0, 8),
    [issues]
  );

  const filteredRecent = useMemo(() => {
    if (!searchQuery.trim()) return recentIssues;
    const q = searchQuery.toLowerCase();
    return issues.filter(
      (i) => i.issue_key.toLowerCase().includes(q) || i.title.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [issues, recentIssues, searchQuery]);

  // ─────────────────────────────────────────────────────────────────
  // Workflow quick action: advance status
  // ─────────────────────────────────────────────────────────────────

  const handleAdvanceStatus = async (issue: Issue) => {
    const next = getNextStatus(issue.status);
    if (!next) return;
    setTransitioning(issue.id);
    setActionError(null);
    try {
      await issuesApi.updateStatus(issue.id, { status: next as import('../types/issue').IssueStatus });
      window.dispatchEvent(new Event('issue:status-updated'));
      setActionSuccess(`${issue.issue_key} moved to ${next.replace(/_/g, ' ')}.`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData(true);
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setTransitioning(null);
    }
  };

  const handleSubmitSprintForApproval = async (sprintId: number) => {
    setSprintSubmitting(sprintId);
    setActionError(null);
    try {
      await SprintService.submitForApproval(sprintId);
      setActionSuccess('Sprint submitted for admin approval!');
      setTimeout(() => setActionSuccess(null), 5000);
      await loadData(true);
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setSprintSubmitting(null);
    }
  };

  const handleBeginWork = async (sprintId: number) => {
    setSprintSubmitting(sprintId);
    setActionError(null);
    try {
      await SprintService.beginWork(sprintId);
      setActionSuccess('Sprint is now In Progress. You can now submit it for approval when ready.');
      setTimeout(() => setActionSuccess(null), 5000);
      await loadData(true);
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setSprintSubmitting(null);
    }
  };


  // ─────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 0' }}>
        <LoadingSpinner message="Loading your tester workspace…" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={() => loadData()} />;
  }

  const totalSeverity =
    (severityDist?.MINOR ?? 0) +
    (severityDist?.MAJOR ?? 0) +
    (severityDist?.CRITICAL ?? 0) +
    (severityDist?.BLOCKER ?? 0);

  const totalPriority =
    (priorityDist?.LOW ?? 0) +
    (priorityDist?.MEDIUM ?? 0) +
    (priorityDist?.HIGH ?? 0) +
    (priorityDist?.URGENT ?? 0);

  // ─────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Toast Messages ── */}
      {actionSuccess && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#34d399',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <CheckCircle2 size={16} />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#f87171',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <AlertCircle size={16} />
          {actionError}
        </div>
      )}

      {/* ── Assigned Sprints Section ── */}
      {assignedSprints.length > 0 && (
        <section className="card" style={{ border: '1px solid rgba(99,102,241,0.25)' }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardCheck size={18} style={{ color: '#818cf8' }} />
              My Assigned Sprints
              <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '0.15rem 0.5rem', borderRadius: '12px', marginLeft: '0.25rem' }}>
                {assignedSprints.length}
              </span>
            </h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignedSprints.map(sprint => {
              return (
                <div key={sprint.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{sprint.name}</div>
                      {sprint.goal && <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{sprint.goal}</div>}
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                        <span>📅 {formatDate(sprint.start_date)} → {formatDate(sprint.end_date)}</span>
                        <span style={{
                          fontWeight: 600,
                          color: sprint.status === 'READY_FOR_APPROVAL' ? '#22d3ee' :
                                 sprint.status === 'IN_PROGRESS' ? '#fbbf24' :
                                 sprint.status === 'ACTIVE' ? '#818cf8' : 'var(--text-muted)'
                        }}>
                          ● {sprint.status === 'READY_FOR_APPROVAL' ? 'Awaiting Approval' :
                             sprint.status === 'IN_PROGRESS' ? 'In Progress' :
                             sprint.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {sprint.status === 'READY_FOR_APPROVAL' ? (
                        <span style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', borderRadius: '8px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <ThumbsUp size={13} /> Submitted — awaiting admin
                        </span>
                      ) : sprint.status === 'ACTIVE' ? (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={sprintSubmitting === sprint.id}
                          onClick={() => handleBeginWork(sprint.id)}
                          title="Mark sprint as In Progress to begin testing work"
                        >
                          <Play size={14} />
                          {sprintSubmitting === sprint.id ? 'Starting...' : 'Begin Work'}
                        </button>
                      ) : sprint.status === 'IN_PROGRESS' ? (
                        <button
                          className="btn btn-success btn-sm"
                          disabled={sprintSubmitting === sprint.id}
                          onClick={() => handleSubmitSprintForApproval(sprint.id)}
                        >
                          <ThumbsUp size={14} />
                          {sprintSubmitting === sprint.id ? 'Submitting...' : 'Submit for Approval'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Review comment banner */}
                  {sprint.review_comment && sprint.status === 'IN_PROGRESS' && (
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '8px', borderLeft: '4px solid #f59e0b', fontSize: '0.85rem' }}>
                      <strong style={{ color: '#fbbf24' }}>⚠ Admin Feedback:</strong>
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>{sprint.review_comment}</p>
                    </div>
                  )}

                  {/* Approved banner */}
                  {sprint.status === 'COMPLETED' && sprint.approved_at && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', fontSize: '0.82rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={14} /> Approved by admin {formatRelativeTime(sprint.approved_at)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Hero Header ── */}
      <div
        className="card"
        style={{
          background:
            'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(99,102,241,0.10) 100%)',
          border: '1px solid rgba(16,185,129,0.28)',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                marginBottom: '0.4rem',
                flexWrap: 'wrap',
              }}
            >
              <span
                className="badge"
                style={{
                  backgroundColor: 'rgba(16,185,129,0.15)',
                  color: '#34d399',
                  fontWeight: '600',
                }}
              >
                <FlaskConical size={13} /> TESTER WORKSPACE
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {user?.email}
              </span>
            </div>

            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: '700',
                color: '#fff',
                margin: '0 0 0.3rem 0',
              }}
            >
              Welcome back, {user?.full_name}!
            </h1>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              {totalCount === 0
                ? 'No issues assigned yet. Check back soon!'
                : openCount > 0
                ? `You have ${openCount} active issue${openCount > 1 ? 's' : ''} to work on${reopenedCount > 0 ? `, including ${reopenedCount} reopened` : ''}.`
                : `All ${totalCount} assigned issues are resolved or closed. Great work! 🎉`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => loadData(true)}
              className="btn btn-secondary btn-sm"
              disabled={isRefreshing}
              title="Refresh Dashboard"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>

            <Link to="/tester-issues" className="btn btn-primary btn-sm">
              <Bug size={15} />
              <span>All My Issues</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── 7 KPI Metric Cards ── */}
      <div className="metrics-grid">
        <MetricCard
          label="Total Assigned"
          value={totalCount}
          icon={<Bug size={20} />}
          iconClass="metric-icon-purple"
        />
        <MetricCard
          label="Open Issues"
          value={openCount}
          icon={<AlertCircle size={20} />}
          iconClass="metric-icon-amber"
          valueColor={openCount > 0 ? '#fbbf24' : undefined}
        />
        <MetricCard
          label="In Progress"
          value={inProgressCount}
          icon={<Activity size={20} />}
          iconClass="metric-icon-indigo"
        />
        <MetricCard
          label="Awaiting Verification"
          value={awaitingVerificationCount}
          icon={<FlaskConical size={20} />}
          iconClass="metric-icon-purple"
          valueColor={awaitingVerificationCount > 0 ? '#818cf8' : undefined}
          subtitle="Issues in IN_TESTING"
        />
      </div>

      {/* ── Second row: Resolved / Reopened / Assigned / Resolution Rate ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {[
          { label: 'Newly Assigned', value: assignedCount, color: '#818cf8' },
          { label: 'In Development', value: inDevCount, color: '#38bdf8' },
          { label: 'In Review', value: inReviewCount, color: '#a78bfa' },
          { label: 'Resolved', value: resolvedCount, color: '#34d399' },
          { label: 'Reopened', value: reopenedCount, color: '#f87171' },
          {
            label: 'Resolution Rate',
            value: `${resolutionRate}%`,
            color: resolutionRate >= 75 ? '#34d399' : resolutionRate >= 40 ? '#f59e0b' : '#f87171',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="card"
            style={{ padding: '0.85rem 1rem', textAlign: 'center' }}
          >
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: '0.3rem',
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: item.color,
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Action Required Section ── */}
      {actionRequired.length > 0 && (
        <div
          className="card"
          style={{
            border: '1px solid rgba(245,158,11,0.35)',
            backgroundColor: 'rgba(245,158,11,0.05)',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <Zap size={18} color="#f59e0b" />
            <h2
              style={{
                fontSize: '1.05rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              ⚡ Action Required (Open Issues: {actionRequired.length})
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '0.85rem',
            }}
          >
            {actionRequired.map((issue) => (
              <div
                key={issue.id}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: '700',
                      color: 'var(--primary)',
                      fontSize: '0.82rem',
                    }}
                  >
                    {issue.issue_key}
                  </span>
                  <StatusBadge status={issue.status} />
                </div>
                <p
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {issue.title}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  {issue.status === 'ASSIGNED'
                    ? 'Newly assigned issue. Start investigation.'
                    : issue.status === 'IN_DEVELOPMENT'
                    ? 'In development. Update status when moving to review.'
                    : issue.status === 'IN_REVIEW'
                    ? 'In review. Test the changes.'
                    : issue.status === 'IN_TESTING'
                    ? 'In-testing. Resolve it or reopen if verification fails.'
                    : issue.status === 'RESOLVED'
                    ? 'This issue is resolved. You may reopen it if the bug persists.'
                    : 'Closed issue. Reopen if defect reappears.'}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--border-subtle)',
                    flexWrap: 'wrap',
                  }}
                >
                  {(() => {
                    const nextStatus = getNextStatus(issue.status);
                    const canAdvance = !!nextStatus;
                    const canResolve = RESOLVABLE_STATUSES.has(issue.status);

                    return (
                      <>
                        {canAdvance && (
                          <button
                            onClick={() => handleAdvanceStatus(issue)}
                            disabled={transitioning === issue.id}
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            <Play size={13} />
                            <span>{transitioning === issue.id ? '…' : getWorkflowLabel(issue.status)}</span>
                          </button>
                        )}
                        {canResolve && (
                          <Link
                            to={`/issues/${issue.id}`}
                            className="btn btn-primary btn-sm"
                            style={{
                              flex: 1,
                              justifyContent: 'center',
                              backgroundColor: '#10b981',
                              borderColor: '#10b981',
                            }}
                          >
                            <CheckCheck size={13} />
                            <span>Resolve</span>
                          </Link>
                        )}
                        {REOPENABLE_STATUSES.has(issue.status) && (
                          <button
                            onClick={() => navigate(`/issues/${issue.id}`)}
                            className="btn btn-outline-danger btn-sm"
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            <RotateCcw size={13} />
                            <span>Reopen</span>
                          </button>
                        )}
                        <Link
                          to={`/issues/${issue.id}`}
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          <Eye size={13} />
                          <span>View</span>
                        </Link>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts Row: Priority Distribution + Severity Distribution + Status Overview ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Priority Distribution */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.1rem',
            }}
          >
            <TrendingUp size={17} color="#818cf8" />
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Priority Distribution
            </h3>
          </div>
          {totalPriority === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No data available
            </p>
          ) : (
            <>
              <BarRow label="Urgent" count={priorityDist?.URGENT ?? 0} total={totalPriority} color="#ef4444" />
              <BarRow label="High" count={priorityDist?.HIGH ?? 0} total={totalPriority} color="#f97316" />
              <BarRow label="Medium" count={priorityDist?.MEDIUM ?? 0} total={totalPriority} color="#f59e0b" />
              <BarRow label="Low" count={priorityDist?.LOW ?? 0} total={totalPriority} color="#34d399" />
            </>
          )}
        </div>

        {/* Severity Distribution */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.1rem',
            }}
          >
            <AlertTriangle size={17} color="#fbbf24" />
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Severity Distribution
            </h3>
          </div>
          {totalSeverity === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No data available
            </p>
          ) : (
            <>
              <BarRow label="Blocker" count={severityDist?.BLOCKER ?? 0} total={totalSeverity} color="#dc2626" />
              <BarRow label="Critical" count={severityDist?.CRITICAL ?? 0} total={totalSeverity} color="#f87171" />
              <BarRow label="Major" count={severityDist?.MAJOR ?? 0} total={totalSeverity} color="#fb923c" />
              <BarRow label="Minor" count={severityDist?.MINOR ?? 0} total={totalSeverity} color="#34d399" />
            </>
          )}
        </div>

        {/* Status Overview */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.1rem',
            }}
          >
            <Layers size={17} color="#38bdf8" />
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Status Overview
            </h3>
          </div>
          {totalCount === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No data available
            </p>
          ) : (
            <>
              <BarRow label="Assigned" count={assignedCount} total={totalCount} color="#818cf8" />
              <BarRow label="In Development" count={inDevCount} total={totalCount} color="#38bdf8" />
              <BarRow label="In Review" count={inReviewCount} total={totalCount} color="#a78bfa" />
              <BarRow label="In Testing" count={inTestingCount} total={totalCount} color="#c084fc" />
              <BarRow label="Resolved" count={resolvedCount} total={totalCount} color="#34d399" />
              <BarRow label="Reopened" count={reopenedCount} total={totalCount} color="#f87171" />
            </>
          )}
        </div>
      </div>

      {/* ── Recent Assigned Issues ── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bug size={18} color="#818cf8" />
            <h2
              style={{
                fontSize: '1rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Recent Assigned Issues
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search issues…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: '2rem',
                  paddingRight: '0.75rem',
                  paddingTop: '0.4rem',
                  paddingBottom: '0.4rem',
                  fontSize: '0.82rem',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-muted)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  width: '180px',
                }}
              />
            </div>

            <Link
              to="/tester-issues"
              className="btn btn-secondary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {filteredRecent.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '2.5rem 1rem',
              color: 'var(--text-muted)',
            }}
          >
            <Bug size={36} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p style={{ fontSize: '0.9rem' }}>
              {searchQuery ? 'No issues match your search.' : 'No assigned issues yet.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr>
                  {['Issue Key', 'Title', 'Priority', 'Severity', 'Status', 'Updated', 'Action'].map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: 'left',
                          padding: '0.5rem 0.75rem',
                          color: 'var(--text-muted)',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                          borderBottom: '1px solid var(--border-subtle)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRecent.map((issue) => {
                  const nextStatus = getNextStatus(issue.status);
                  const canAdvance = !!nextStatus;
                  const canResolve = RESOLVABLE_STATUSES.has(issue.status);
                  const isTransitioning = transitioning === issue.id;

                  return (
                    <tr
                      key={issue.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background =
                          'var(--bg-surface-hover)')
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')
                      }
                    >
                      {/* Issue Key */}
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <Link
                          to={`/issues/${issue.id}`}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: '700',
                            color: 'var(--primary)',
                            fontSize: '0.82rem',
                          }}
                        >
                          {issue.issue_key}
                        </Link>
                      </td>

                      {/* Title */}
                      <td
                        style={{
                          padding: '0.65rem 0.75rem',
                          maxWidth: '220px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Link
                          to={`/issues/${issue.id}`}
                          style={{
                            color: 'var(--text-primary)',
                            fontWeight: '500',
                          }}
                          title={issue.title}
                        >
                          {issue.title}
                        </Link>
                      </td>

                      {/* Priority */}
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <PriorityBadge priority={issue.priority} />
                      </td>

                      {/* Severity */}
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <SeverityBadge severity={issue.severity} />
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <StatusBadge status={issue.status} />
                      </td>

                      {/* Updated */}
                      <td
                        style={{
                          padding: '0.65rem 0.75rem',
                          color: 'var(--text-muted)',
                          fontSize: '0.78rem',
                          whiteSpace: 'nowrap',
                        }}
                        title={formatDate(issue.updated_at || issue.created_at)}
                      >
                        {formatRelativeTime(issue.updated_at || issue.created_at)}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {canAdvance && (
                            <button
                              onClick={() => handleAdvanceStatus(issue)}
                              disabled={isTransitioning}
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                              title={getWorkflowLabel(issue.status)}
                            >
                              <Play size={11} />
                              <span>{isTransitioning ? '…' : getWorkflowLabel(issue.status)}</span>
                            </button>
                          )}
                          {!canAdvance && canResolve && (
                            <Link
                              to={`/issues/${issue.id}`}
                              className="btn btn-primary btn-sm"
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.6rem',
                                backgroundColor: '#10b981',
                                borderColor: '#10b981',
                              }}
                            >
                              <CheckCheck size={11} />
                              <span>Resolve</span>
                            </Link>
                          )}
                          <Link
                            to={`/issues/${issue.id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            title="View Details"
                          >
                            <Eye size={12} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Workflow Guide ── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Shield size={17} color="#818cf8" />
          <h3
            style={{
              fontSize: '0.95rem',
              fontWeight: '700',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Tester Workflow Guide
          </h3>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: '0.82rem',
          }}
        >
          {[
            { label: 'ASSIGNED', color: '#818cf8' },
            { label: '→', color: 'var(--text-muted)' },
            { label: 'IN_DEVELOPMENT', color: '#38bdf8' },
            { label: '→', color: 'var(--text-muted)' },
            { label: 'IN_REVIEW', color: '#a78bfa' },
            { label: '→', color: 'var(--text-muted)' },
            { label: 'IN_TESTING', color: '#c084fc' },
            { label: '→', color: 'var(--text-muted)' },
            { label: 'RESOLVED', color: '#34d399' },
          ].map((step, idx) => (
            <span
              key={idx}
              style={{
                color: step.color,
                fontFamily: step.label.startsWith('→') ? undefined : 'var(--font-mono)',
                fontWeight: step.label.startsWith('→') ? '400' : '600',
                fontSize: step.label.startsWith('→') ? '1rem' : '0.8rem',
                padding: step.label.startsWith('→')
                  ? '0'
                  : '0.15rem 0.45rem',
                backgroundColor: step.label.startsWith('→')
                  ? 'transparent'
                  : `${step.color}18`,
                borderRadius: step.label.startsWith('→') ? 0 : '4px',
              }}
            >
              {step.label}
            </span>
          ))}
        </div>

        <div style={{ marginTop: '0.85rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
            }}
          >
            <RotateCcw size={12} color="#f87171" />
            <span>
              <span style={{ color: '#f87171', fontWeight: '600' }}>Reopen</span> from RESOLVED /
              CLOSED / IN_TESTING if bug persists
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
            }}
          >
            <Clock size={12} color="#fbbf24" />
            <span>Use issue detail page for comments, attachments & full workflow</span>
          </div>
        </div>
      </div>

      {/* ── Quick Stats Footer ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {[
          {
            icon: <CheckCheck size={16} color="#34d399" />,
            label: 'Verification Rate',
            value: resolutionRate >= 0 ? `${resolutionRate}%` : '—',
            sub: `${resolvedCount + closedCount} of ${totalCount} issues`,
          },
          {
            icon: <AlertTriangle size={16} color="#f87171" />,
            label: 'Critical Issues',
            value: (severityDist?.BLOCKER ?? 0) + (severityDist?.CRITICAL ?? 0),
            sub: 'Blocker + Critical severity',
          },
          {
            icon: <Sparkles size={16} color="#818cf8" />,
            label: 'Urgent Priority',
            value: priorityDist?.URGENT ?? 0,
            sub: 'Highest priority issues',
          },
          {
            icon: <Clock size={16} color="#fbbf24" />,
            label: 'Active Issues',
            value: inProgressCount,
            sub: 'In dev, review, or testing',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="card"
            style={{
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {item.icon}
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                {item.value}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
