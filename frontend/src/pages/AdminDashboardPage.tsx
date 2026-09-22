import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  FolderGit2,
  HeartPulse,
  Layers,
  RefreshCw,
  Shield,
  ThumbsUp,
  RotateCcw,
  Users,
} from 'lucide-react';
import { adminApi } from '../api/admin';
import { analyticsApi } from '../api/analytics';
import { auditApi } from '../api/audit';
import { issuesApi } from '../api/issues';
import { usersApi } from '../api/users';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { AdvancedAnalytics } from '../components/admin/AdvancedAnalytics';
import { SprintService } from '../services/SprintService';
import type { AdminDashboardResponse, InactiveAssigneeItem } from '../types/admin';
import type { DeveloperAnalyticsItem } from '../types/analytics';
import type { AuditLogItem } from '../types/audit';
import type { Issue } from '../types/issue';
import type { Sprint } from '../types/Sprint';
import type { UserDetail } from '../types/user';
import { formatRelativeTime } from '../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Bar Row Helper
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.8rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
          {count}
          <span style={{ color: 'var(--text-muted)', fontWeight: '400', marginLeft: '0.3rem' }}>
            ({pct}%)
          </span>
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '4px', backgroundColor: 'var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '4px', transition: 'width 0.6s' }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconClass: string;
  valueColor?: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, iconClass, valueColor, subtitle }) => (
  <div className="metric-card" style={{
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '1.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  }}>
    <div className="metric-info">
      <span className="metric-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>{label}</span>
      <span className="metric-value" style={{ fontSize: '1.75rem', fontWeight: '700', color: valueColor || 'var(--text-primary)' }}>
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
          {subtitle}
        </span>
      )}
    </div>
    <div className={`metric-icon-box ${iconClass}`} style={{
      width: '44px',
      height: '44px',
      borderRadius: '10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-surface-elevated)'
    }}>{icon}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const AdminDashboardPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [stats, setStats] = useState<AdminDashboardResponse | null>(null);
  const [workloads, setWorkloads] = useState<DeveloperAnalyticsItem[]>([]);
  const [inactiveAssignees, setInactiveAssignees] = useState<InactiveAssigneeItem[]>([]);
  const [unassignedQueue, setUnassignedQueue] = useState<Issue[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [testers, setTesters] = useState<UserDetail[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sprint approval state
  const [awaitingApproval, setAwaitingApproval] = useState<Sprint[]>([]);
  const [requestChangesSprintId, setRequestChangesSprintId] = useState<number | null>(null);
  const [requestChangesComment, setRequestChangesComment] = useState('');
  const [sprintActionLoading, setSprintActionLoading] = useState<number | null>(null);

  const fetchData = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [
        dashboardStats,
        workloadList,
        inactiveList,
        unassignedList,
        logsList,
      ] = await Promise.all([
        adminApi.getDashboard(),
        analyticsApi.getDeveloperPerformance(),
        adminApi.getInactiveAssignees(),
        issuesApi.list({ unassigned: true, page_size: 10 }),
        auditApi.list({ page_size: 10 }),
      ]);

      setStats(dashboardStats);
      setWorkloads(workloadList.items);
      setInactiveAssignees(inactiveList.items);
      setUnassignedQueue(unassignedList.items);
      setAuditLogs(logsList.items);

      // Sprint approval
      try {
        const pendingSprints = await SprintService.getAwaitingApprovalSprints();
        setAwaitingApproval(pendingSprints);
      } catch { /* non-critical */ }

    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
    const refreshTimer = window.setInterval(() => fetchData(true), 15000);
    return () => window.clearInterval(refreshTimer);
  }, [fetchData]);

  // Handle Assign modal
  const openAssignModal = async (issueId: number) => {
    setSelectedIssueId(issueId);
    setAssignModalOpen(true);
    try {
      const res = await usersApi.list({ role: 'TESTER', is_active: true, page_size: 100 });
      setTesters(res.items);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssign = async (testerId: number) => {
    if (!selectedIssueId) return;
    setAssigning(true);
    try {
      await issuesApi.assign(selectedIssueId, { developer_id: testerId });
      setToastMessage({ type: 'success', text: 'Issue assigned successfully' });
      setAssignModalOpen(false);
      fetchData(true);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err?.response?.data?.detail || 'Failed to assign tester' });
    } finally {
      setAssigning(false);
    }
  };

  const handleApproveSprint = async (sprintId: number) => {
    setSprintActionLoading(sprintId);
    try {
      await SprintService.approveSprint(sprintId);
      setToastMessage({ type: 'success', text: 'Sprint approved and marked COMPLETED!' });
      fetchData(true);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err?.response?.data?.detail || 'Failed to approve sprint' });
    } finally {
      setSprintActionLoading(null);
    }
  };

  const handleRequestChanges = async () => {
    if (!requestChangesSprintId) return;
    setSprintActionLoading(requestChangesSprintId);
    try {
      await SprintService.requestChanges(requestChangesSprintId, requestChangesComment || null);
      setToastMessage({ type: 'success', text: 'Changes requested. Tester will be notified.' });
      setRequestChangesSprintId(null);
      setRequestChangesComment('');
      fetchData(true);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err?.response?.data?.detail || 'Failed to request changes' });
    } finally {
      setSprintActionLoading(null);
    }
  };

  // Health Score Calculation
  const healthScore = useMemo(() => {
    if (!stats) return 100;
    let score = 100;
    
    // Penalties
    score -= stats.severity.blocker * 10;
    score -= stats.severity.critical * 5;
    
    const totalIssues = stats.issues.total;
    const resolvedClosed = stats.issues.resolved + stats.issues.closed;
    const resRate = totalIssues > 0 ? (resolvedClosed / totalIssues) * 100 : 0;
    const reopenRate = totalIssues > 0 ? (stats.issues.reopened / totalIssues) * 100 : 0;

    if (reopenRate > 10) score -= 5;
    if (resRate >= 75) score += 5;

    return Math.max(0, Math.min(100, score));
  }, [stats]);

  if (isLoading && !stats) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <LoadingSpinner message="Loading Executive Admin Command Center..." />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="page-container" style={{ padding: '2rem' }}>
        <ErrorMessage message={error} onRetry={() => fetchData()} />
      </div>
    );
  }

  if (!stats) return null;

  const resolutionRate = stats.issues.total > 0 
    ? Math.round(((stats.issues.resolved + stats.issues.closed) / stats.issues.total) * 100) 
    : 0;

  return (
    <div className="admin-command-center">
      {/* Main Container */}
      <div className="page-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.75rem' }}>
        {/* Header */}
        <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: '1px solid rgba(249, 115, 22, 0.35)', fontWeight: 800 }}>
                👑 EXECUTIVE ADMIN CENTER
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>• Platform Telemetry & Approvals</span>
            </div>
            <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.35rem 0' }}>Admin Command Center</h1>
            <p className="page-subtitle" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>High-level triage governance, developer velocity, sprint approval queues, and system audit telemetry.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {isRefreshing && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Refreshing...</span>}
            <button 
              className="btn btn-secondary" 
              onClick={() => fetchData(true)} 
              disabled={isRefreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                color: 'var(--text-primary)'
              }}
            >
              <RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Health Score Banner */}
        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', 
          border: '1px solid var(--border-subtle)', marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          borderLeft: `4px solid ${healthScore > 80 ? '#16a34a' : healthScore > 50 ? '#d97706' : '#dc2626'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              background: healthScore > 80 ? 'rgba(22,163,74,0.1)' : healthScore > 50 ? 'rgba(217,119,6,0.1)' : 'rgba(220,38,38,0.1)', 
              padding: '1rem', borderRadius: '50%', color: healthScore > 80 ? '#16a34a' : healthScore > 50 ? '#d97706' : '#dc2626' 
            }}>
              <HeartPulse size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                Platform Health Score
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Based on resolution rate, open blockers, critical defects, and reopen rates.
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: healthScore > 80 ? '#16a34a' : healthScore > 50 ? '#d97706' : '#dc2626' }}>
              {healthScore} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ 100</span>
            </div>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="metrics-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
          gap: '1.25rem', 
          marginBottom: '2rem' 
        }}>
          <Link to="/admin" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MetricCard
              label="Total Users"
              value={stats.users.total}
              icon={<Users size={20} color="#2563eb" />}
              iconClass="icon-blue"
              subtitle={`${stats.users.active} Active`}
            />
          </Link>
          <Link to="/projects" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MetricCard
              label="Total Projects"
              value={stats.projects.total}
              icon={<FolderGit2 size={20} color="#7c3aed" />}
              iconClass="icon-purple"
              subtitle={`${stats.projects.active} Active`}
            />
          </Link>
          <Link to="/analytics" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MetricCard
              label="Resolution Rate"
              value={`${resolutionRate}%`}
              icon={<CheckCircle2 size={20} color={resolutionRate >= 75 ? '#16a34a' : '#d97706'} />}
              iconClass={resolutionRate >= 75 ? 'icon-green' : 'icon-orange'}
              valueColor={resolutionRate >= 75 ? '#16a34a' : '#d97706'}
              subtitle={`${stats.issues.resolved + stats.issues.closed} / ${stats.issues.total} Issues`}
            />
          </Link>
          <Link to="/issues?status=UNASSIGNED" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MetricCard
              label="Unassigned"
              value={stats.issues.reported + stats.issues.triaged}
              icon={<AlertCircle size={20} color="#ea580c" />}
              iconClass="icon-orange"
            />
          </Link>
          <Link to="/issues?status=ASSIGNED" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MetricCard
              label="Assigned Tasks"
              value={stats.issues.assigned + stats.issues.in_development + stats.issues.in_testing + stats.issues.in_review}
              icon={<ClipboardCheck size={20} color="#0d9488" />}
              iconClass="icon-teal"
            />
          </Link>
        </div>

        {/* Advanced Analytics Section */}
        <AdvancedAnalytics />

        {/* Main Content Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem', marginBottom: '2rem', marginTop: '2rem', alignItems: 'start' }}>
          
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Unassigned Issue Queue */}
            <section className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)' }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  <AlertTriangle size={18} style={{ color: '#d97706' }} />
                  Unassigned Issue Queue
                </h2>
              </div>
              {unassignedQueue.length === 0 ? (
                <div className="card-body empty-state" style={{ padding: '2.5rem', textAlign: 'center' }}>
                  <CheckCircle2 size={32} style={{ color: '#16a34a', marginBottom: '1rem' }} />
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Queue is Empty</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>There are no unassigned issues awaiting action.</p>
                </div>
              ) : (
                <div className="table-container" style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0, overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface-elevated)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: '#64748b' }}>
                        <th style={{ padding: '0.75rem 1rem' }}>Key</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Title</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Priority</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Severity</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Created</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedQueue.map((issue) => (
                        <tr key={issue.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: '600', color: 'var(--primary)' }}>{issue.issue_key}</td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }} title={issue.title}>
                            {issue.title}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}><PriorityBadge priority={issue.priority} /></td>
                          <td style={{ padding: '0.75rem 1rem' }}><SeverityBadge severity={issue.severity} /></td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {formatRelativeTime(issue.created_at)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer' }} onClick={() => openAssignModal(issue.id)}>
                              Assign
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Team Workload */}
            <section className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)' }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  <Activity size={18} color="#3b82f6" />
                  Team Workload (Testers & Developers)
                </h2>
              </div>
              {workloads.length === 0 ? (
                <div className="card-body empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p>No workload data available.</p>
                </div>
              ) : (
                <div className="table-container" style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0, overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface-elevated)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Assigned</th>
                        <th style={{ padding: '0.75rem 1rem' }}>In Progress</th>
                        <th style={{ padding: '0.75rem 1rem' }}>In Testing</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Resolved</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Res. Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workloads.map((w) => {
                        const totalActive = w.open_issues;
                        const isHighLoad = totalActive > 10;
                        return (
                          <tr key={w.developer_id} style={{ borderBottom: '1px solid var(--border-subtle)', background: isHighLoad ? 'rgba(239, 68, 68, 0.08)' : undefined }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: '500', color: 'var(--text-primary)' }}>
                              {w.developer_name}
                              {isHighLoad && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#dc2626', fontWeight: '600', padding: '0.1rem 0.3rem', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '4px', background: 'var(--bg-surface)' }}>HIGH LOAD</span>}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{w.assigned_issues}</td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{w.open_issues}</td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>-</td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{w.resolved_issues}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span style={{ fontWeight: '600', color: w.resolution_rate >= 75 ? '#16a34a' : 'var(--text-secondary)' }}>
                                {Math.round(w.resolution_rate)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Sprints Awaiting Approval */}
            {awaitingApproval.length > 0 && (
              <section className="card" style={{ border: '1px solid rgba(99, 102, 241, 0.35)', background: 'var(--bg-surface)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(99, 102, 241, 0.08)' }}>
                  <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#818cf8', fontSize: '1rem', fontWeight: '600', margin: 0 }}>
                    <ClipboardCheck size={18} />
                    Sprints Awaiting Approval
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '0.15rem 0.5rem', borderRadius: '12px', marginLeft: '0.25rem' }}>
                      {awaitingApproval.length}
                    </span>
                  </h2>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
                  {awaitingApproval.map(sprint => (
                    <div key={sprint.id} style={{ padding: '1rem', border: '1px solid var(--border-subtle)', borderRadius: '10px', background: 'var(--bg-surface-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem', color: 'var(--text-primary)' }}>{sprint.name}</div>
                        {sprint.goal && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{sprint.goal}</div>}
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>Tester: <strong style={{ color: 'var(--text-primary)' }}>{sprint.assigned_tester_name || '—'}</strong></span>
                          {sprint.submitted_at && <span>Submitted: <strong style={{ color: 'var(--text-primary)' }}>{formatRelativeTime(sprint.submitted_at)}</strong></span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          className="btn btn-success btn-sm"
                          disabled={sprintActionLoading === sprint.id}
                          onClick={() => handleApproveSprint(sprint.id)}
                          title="Approve Sprint → COMPLETED"
                        >
                          <ThumbsUp size={14} /> Approve
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={sprintActionLoading === sprint.id}
                          onClick={() => { setRequestChangesSprintId(sprint.id); setRequestChangesComment(''); }}
                          title="Request changes → returns to IN_PROGRESS"
                        >
                          <RotateCcw size={14} /> Request Changes
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* System Activity */}
            <section className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  <Layers size={18} color="#3b82f6" />
                  System Activity
                </h2>
                <Link to="/admin" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                  View All
                </Link>
              </div>
              {auditLogs.length === 0 ? (
                <div className="card-body empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p>No recent activity found.</p>
                </div>
              ) : (
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
                  {auditLogs.map(log => (
                    <div key={log.id} style={{ display: 'flex', gap: '1rem', padding: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Activity size={18} style={{ color: '#0284c7' }} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{log.actor?.full_name || 'System'}</strong> ({log.actor?.role || 'SYSTEM'}) {log.action} <strong style={{ color: 'var(--text-primary)' }}>{log.entity_type}</strong> {log.entity_key}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {log.description}
                        </p>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatRelativeTime(log.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* System Alerts */}
            <section className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.35)', background: 'var(--bg-surface)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.08)' }}>
                <h2 className="card-title" style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '600', margin: 0 }}>
                  <Shield size={18} />
                  System Alerts
                </h2>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
                {stats.severity.blocker > 0 && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '6px', borderLeft: '3px solid #dc2626' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#f87171' }}>{stats.severity.blocker} Open Blocker Issues</p>
                  </div>
                )}
                {stats.issues.reopened > 0 && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '6px', borderLeft: '3px solid #d97706' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#fbbf24' }}>{stats.issues.reopened} Reopened Issues</p>
                  </div>
                )}
                {inactiveAssignees.length > 0 && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '6px', borderLeft: '3px solid #dc2626' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#f87171' }}>
                      {inactiveAssignees.length} Inactive Users with Assignments
                    </p>
                    <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {inactiveAssignees.slice(0, 3).map(u => (
                        <li key={u.user_id}>{u.full_name} ({u.assigned_issues_count} issues)</li>
                      ))}
                      {inactiveAssignees.length > 3 && <li>And {inactiveAssignees.length - 3} more...</li>}
                    </ul>
                  </div>
                )}
                {stats.severity.blocker === 0 && stats.issues.reopened === 0 && inactiveAssignees.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No critical alerts.</p>
                )}
              </div>
            </section>

            {/* User Management */}
            <section className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)' }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  <Users size={18} color="#3b82f6" />
                  User Breakdown
                </h2>
              </div>
              <div className="card-body" style={{ padding: '1.25rem' }}>
                <BarRow label="Users" count={stats.users.users} total={stats.users.total} color="#3b82f6" />
                <BarRow label="Testers" count={stats.users.testers} total={stats.users.total} color="#16a34a" />
                <BarRow label="Developers" count={stats.users.developers} total={stats.users.total} color="#8b5cf6" />
                <BarRow label="Admins" count={stats.users.admins} total={stats.users.total} color="#f97316" />
                
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Active</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{stats.users.active}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Inactive</span>
                    <span style={{ fontWeight: '600', color: stats.users.inactive > 0 ? '#dc2626' : 'var(--text-primary)' }}>{stats.users.inactive}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Issue Health */}
            <section className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)' }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  <Bug size={18} color="#ef4444" />
                  Issue Health
                </h2>
              </div>
              <div className="card-body" style={{ padding: '1.25rem' }}>
                <BarRow label="Blocker" count={stats.severity.blocker} total={stats.issues.unresolved} color="#dc2626" />
                <BarRow label="Critical" count={stats.severity.critical} total={stats.issues.unresolved} color="#f97316" />
                <BarRow label="Major" count={stats.severity.major} total={stats.issues.unresolved} color="#d97706" />
                <BarRow label="Minor" count={stats.severity.minor} total={stats.issues.unresolved} color="#3b82f6" />
              </div>
            </section>

          </div>
        </div>

        {/* Assign Tester Modal */}
        <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Assign Tester">
          <div style={{ padding: '1.5rem' }}>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
              Select a tester to assign this issue to. Workloads are shown for available testers.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
              {testers.map(tester => {
                const wl = workloads.find(w => w.developer_id === tester.id);
                const activeLoad = wl ? wl.open_issues : 0;
                return (
                  <div key={tester.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: '8px', background: 'var(--bg-surface)' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{tester.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Active Load: {activeLoad} issues</div>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '0.4rem 1rem' }} 
                      disabled={assigning}
                      onClick={() => handleAssign(tester.id)}
                    >
                      Select
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>

        {/* Request Changes Modal */}
        <Modal
          isOpen={requestChangesSprintId !== null}
          onClose={() => { setRequestChangesSprintId(null); setRequestChangesComment(''); }}
          title="Request Changes"
        >
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
            The sprint will be sent back to the tester with status <strong>IN_PROGRESS</strong>.
          </p>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--text-primary)' }}>Comment / Feedback (optional)</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={requestChangesComment}
              onChange={e => setRequestChangesComment(e.target.value)}
              placeholder="Describe what changes are needed..."
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => { setRequestChangesSprintId(null); setRequestChangesComment(''); }}>Cancel</button>
            <button className="btn btn-primary" disabled={sprintActionLoading !== null} onClick={handleRequestChanges}>
              Send Back to Tester
            </button>
          </div>
        </Modal>

        {/* Toast Notification */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            background: 'var(--bg-surface)',
            border: `1px solid ${toastMessage.type === 'success' ? '#16a34a' : '#dc2626'}`,
            padding: '1rem',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 9999
          }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>×</button>
          </div>
        )}
      </div>
    </div>
  );
};