import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle,
  Clock,
  Edit2,
  ExternalLink,
  FolderGit2,
  PowerOff,
  RefreshCw,
  Search,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
  UserPlus,
  Activity,
  Layers,
} from 'lucide-react';
import { adminApi } from '../api/admin';
import { analyticsApi } from '../api/analytics';
import { getApiErrorMessage } from '../api/client';
import { issuesApi, type IssueListParams } from '../api/issues';
import { usersApi } from '../api/users';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type { AdminDashboardResponse } from '../types/admin';
import type {
  DeveloperAnalyticsItem,
  IssueStatusDistributionResponse,
  SeverityDistributionResponse,
  SystemAnalyticsResponse,
} from '../types/analytics';
import type { UserRole } from '../types/auth';
import type { Issue, IssueStatus, Priority, Severity } from '../types/issue';
import type { UserDetail, UserSortField } from '../types/user';
import { formatDate, formatRelativeTime } from '../utils/formatters';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
type AdminTab = 'overview' | 'issues' | 'workload' | 'analytics' | 'users';

// ─────────────────────────────────────────
// Helper: stat bar item
// ─────────────────────────────────────────
const StatBar: React.FC<{ label: string; value: number; total: number; color: string }> = ({
  label,
  value,
  total,
  color,
}) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)' }}>
          {value} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--bg-surface-elevated)' }}>
        <div
          style={{
            height: '100%',
            borderRadius: '3px',
            width: `${pct}%`,
            backgroundColor: color,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// Main AdminPage Component
// ─────────────────────────────────────────
export const AdminPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // ── Overview State ──────────────────────
  const [dashboardStats, setDashboardStats] = useState<AdminDashboardResponse | null>(null);
  const [statusDist, setStatusDist] = useState<IssueStatusDistributionResponse | null>(null);
  const [severityDist, setSeverityDist] = useState<SeverityDistributionResponse | null>(null);
  const [recentReported, setRecentReported] = useState<Issue[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // ── Issue Management State ───────────────
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesTotal, setIssuesTotal] = useState(0);
  const [issuesTotalPages, setIssuesTotalPages] = useState(1);
  const [issuesPage, setIssuesPage] = useState(1);
  const [issuesSearch, setIssuesSearch] = useState('');
  const [issuesStatus, setIssuesStatus] = useState<IssueStatus | ''>('');
  const [issuesSeverity, setIssuesSeverity] = useState<Severity | ''>('');
  const [issuesPriority, setIssuesPriority] = useState<Priority | ''>('');
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  // Assign Modal
  const [assignModalIssue, setAssignModalIssue] = useState<Issue | null>(null);
  const [availableDevs, setAvailableDevs] = useState<UserDetail[]>([]);
  const [selectedDevId, setSelectedDevId] = useState<number | ''>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [devsLoading, setDevsLoading] = useState(false);

  // ── Workload State ───────────────────────
  const [devPerformance, setDevPerformance] = useState<DeveloperAnalyticsItem[]>([]);
  const [testersList, setTestersList] = useState<UserDetail[]>([]);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [workloadError, setWorkloadError] = useState<string | null>(null);

  // ── Analytics State ──────────────────────
  const [sysAnalytics, setSysAnalytics] = useState<SystemAnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // ── User Management State ────────────────
  const [usersList, setUsersList] = useState<UserDetail[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState<UserRole | ''>('');
  const [usersActiveFilter, setUsersActiveFilter] = useState<boolean | ''>('');
  const [usersSortBy, setUsersSortBy] = useState<UserSortField>('created_at');
  const [usersSortDesc, setUsersSortDesc] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('DEVELOPER');
  const [roleModalError, setRoleModalError] = useState<string | null>(null);
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  // ─────────────────────────────────────────
  // Data Fetchers
  // ─────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [stats, dist, sev, reported] = await Promise.all([
        adminApi.getDashboard(),
        analyticsApi.getStatusDistribution(),
        analyticsApi.getSeverityDistribution(),
        issuesApi.list({ page: 1, page_size: 8, status: 'REPORTED' }),
      ]);
      setDashboardStats(stats);
      setStatusDist(dist);
      setSeverityDist(sev);
      setRecentReported(reported.items);
    } catch (err) {
      setOverviewError(getApiErrorMessage(err));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchIssues = useCallback(async () => {
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const params: IssueListParams = { page: issuesPage, page_size: 15 };
      if (issuesSearch.trim()) params.search = issuesSearch.trim();
      if (issuesStatus) params.status = issuesStatus as IssueStatus;
      if (issuesSeverity) params.severity = issuesSeverity as Severity;
      if (issuesPriority) params.priority = issuesPriority as Priority;
      const res = await issuesApi.list(params);
      setIssues(res.items);
      setIssuesTotal(res.total);
      setIssuesTotalPages(res.total_pages);
    } catch (err) {
      setIssuesError(getApiErrorMessage(err));
    } finally {
      setIssuesLoading(false);
    }
  }, [issuesPage, issuesSearch, issuesStatus, issuesSeverity, issuesPriority]);

  const fetchWorkload = useCallback(async () => {
    setWorkloadLoading(true);
    setWorkloadError(null);
    try {
      const [perf, testers] = await Promise.all([
        analyticsApi.getDeveloperPerformance(),
        usersApi.list({ role: 'TESTER', is_active: true, page_size: 50 }),
      ]);
      setDevPerformance(perf.items);
      setTestersList(testers.items);
    } catch (err) {
      setWorkloadError(getApiErrorMessage(err));
    } finally {
      setWorkloadLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const [overview, dist, sev] = await Promise.all([
        analyticsApi.getSystemOverview(),
        analyticsApi.getStatusDistribution(),
        analyticsApi.getSeverityDistribution(),
      ]);
      setSysAnalytics(overview);
      setStatusDist(dist);
      setSeverityDist(sev);
    } catch (err) {
      setAnalyticsError(getApiErrorMessage(err));
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await usersApi.list({
        page: usersPage,
        page_size: 15,
        search: usersSearch.trim() || undefined,
        role: usersRoleFilter || undefined,
        is_active: usersActiveFilter !== '' ? usersActiveFilter : undefined,
        sort_by: usersSortBy,
        sort_desc: usersSortDesc,
      });
      setUsersList(res.items);
      setUsersTotal(res.total);
      setUsersTotalPages(res.total_pages);
    } catch (err) {
      setUsersError(getApiErrorMessage(err));
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, usersSearch, usersRoleFilter, usersActiveFilter, usersSortBy, usersSortDesc]);

  // ─────────────────────────────────────────
  // Tab-switch effects
  // ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
  }, [activeTab, fetchOverview]);

  useEffect(() => {
    if (activeTab === 'issues') fetchIssues();
  }, [activeTab, issuesPage, issuesStatus, issuesSeverity, issuesPriority, fetchIssues]);

  useEffect(() => {
    if (activeTab === 'workload') fetchWorkload();
  }, [activeTab, fetchWorkload]);

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
  }, [activeTab, fetchAnalytics]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [activeTab, usersPage, usersRoleFilter, usersActiveFilter, usersSortBy, usersSortDesc, fetchUsers]);

  // ─────────────────────────────────────────
  // Issue Assignment Handlers
  // ─────────────────────────────────────────
  const openAssignModal = async (issue: Issue) => {
    setAssignModalIssue(issue);
    setSelectedDevId('');
    setAssignError(null);
    setDevsLoading(true);
    try {
      const res = await usersApi.list({ role: 'TESTER', is_active: true, page_size: 50 });
      setAvailableDevs(res.items);
    } catch (err) {
      setAssignError(getApiErrorMessage(err));
    } finally {
      setDevsLoading(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalIssue || !selectedDevId) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await issuesApi.assign(assignModalIssue.id, { developer_id: Number(selectedDevId) });
      setAssignModalIssue(null);
      fetchIssues();
    } catch (err) {
      setAssignError(getApiErrorMessage(err));
    } finally {
      setAssignLoading(false);
    }
  };

  // ─────────────────────────────────────────
  // User Management Handlers
  // ─────────────────────────────────────────
  const handleOpenRoleModal = (u: UserDetail) => {
    setSelectedUser(u);
    setTargetRole(u.role);
    setRoleModalError(null);
    setIsRoleModalOpen(true);
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsSubmittingRole(true);
    setRoleModalError(null);
    try {
      await usersApi.changeRole(selectedUser.id, { role: targetRole });
      setIsRoleModalOpen(false);
      fetchUsers();
    } catch (err) {
      setRoleModalError(getApiErrorMessage(err));
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const handleActivateUser = async (u: UserDetail) => {
    try {
      await usersApi.activate(u.id);
      fetchUsers();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleDeactivateUser = async (u: UserDetail) => {
    const msg =
      u.id === currentUser?.id
        ? 'Warning: You are deactivating your own account. Continue?'
        : `Deactivate account for "${u.full_name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await usersApi.deactivate(u.id);
      fetchUsers();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleUsersSort = (field: UserSortField) => {
    if (usersSortBy === field) {
      setUsersSortDesc((p) => !p);
    } else {
      setUsersSortBy(field);
      setUsersSortDesc(true);
    }
    setUsersPage(1);
  };

  // ─────────────────────────────────────────
  // Tab configuration
  // ─────────────────────────────────────────
  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
    { key: 'issues', label: 'Issue Management', icon: <Bug size={16} /> },
    { key: 'workload', label: 'Tester Workload', icon: <Activity size={16} /> },
    { key: 'analytics', label: 'Analytics', icon: <TrendingUp size={16} /> },
    { key: 'users', label: 'User Management', icon: <Users size={16} /> },
  ];

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="admin-page-light">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Shield size={24} color="#818cf8" />
            Admin Control Center
          </h1>
          <p className="page-subtitle">
            System administration, issue management, team workload, and analytics
          </p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'overview') fetchOverview();
            else if (activeTab === 'issues') fetchIssues();
            else if (activeTab === 'workload') fetchWorkload();
            else if (activeTab === 'analytics') fetchAnalytics();
            else if (activeTab === 'users') fetchUsers();
          }}
          className="btn btn-secondary btn-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.25rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          paddingBottom: '0',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1.1rem',
              fontSize: '0.85rem',
              fontWeight: '500',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'none',
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              borderRadius: '0',
              transition: 'color 0.2s ease, border-color 0.2s ease',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* TAB 1: OVERVIEW                         */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {overviewLoading && !dashboardStats && <LoadingSpinner message="Loading overview..." />}
          {overviewError && <ErrorMessage message={overviewError} onRetry={fetchOverview} />}

          {dashboardStats && (
            <>
              {/* Metric Cards */}
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Total Users</span>
                    <span className="metric-value">{dashboardStats.users.total}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {dashboardStats.users.active} Active · {dashboardStats.users.inactive} Inactive
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-purple">
                    <Users size={20} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Total Issues</span>
                    <span className="metric-value">{dashboardStats.issues.total}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {dashboardStats.issues.reported} Reported · {dashboardStats.issues.assigned} Assigned
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-amber">
                    <Bug size={20} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">In Progress</span>
                    <span className="metric-value">
                      {dashboardStats.issues.in_development + dashboardStats.issues.in_review + dashboardStats.issues.in_testing}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Dev · Review · Testing
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-indigo">
                    <Clock size={20} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Resolved Issues</span>
                    <span className="metric-value">{dashboardStats.issues.resolved}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {dashboardStats.issues.closed} Closed · {dashboardStats.issues.reopened} Reopened
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-emerald">
                    <CheckCircle size={20} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Projects</span>
                    <span className="metric-value">{dashboardStats.projects.total}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {dashboardStats.projects.active} Active
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-emerald">
                    <FolderGit2 size={20} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Last 7 Days</span>
                    <span className="metric-value" style={{ fontSize: '1.3rem', color: '#818cf8' }}>
                      +{dashboardStats.recent.recently_created}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Created · ✓{dashboardStats.recent.recently_resolved} Resolved
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-purple">
                    <TrendingUp size={20} />
                  </div>
                </div>
              </div>

              {/* Two-column: Status Distribution + Recent Reported */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Status Distribution */}
                {statusDist && (
                  <div className="card">
                    <div className="card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={18} color="#818cf8" />
                        <h3 className="card-title">Issue Status Distribution</h3>
                      </div>
                    </div>
                    <div className="card-body">
                      {Object.entries(statusDist).map(([status, count]) => (
                        <StatBar
                          key={status}
                          label={status.replace(/_/g, ' ')}
                          value={count as number}
                          total={dashboardStats.issues.total}
                          color={
                            status === 'REPORTED' ? '#6366f1' :
                            status === 'ASSIGNED' ? '#f59e0b' :
                            status === 'IN_DEVELOPMENT' ? '#0ea5e9' :
                            status === 'IN_REVIEW' ? '#a78bfa' :
                            status === 'RESOLVED' ? '#10b981' :
                            status === 'CLOSED' ? '#34d399' :
                            status === 'REOPENED' ? '#f87171' :
                            '#64748b'
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Severity Distribution */}
                {severityDist && (
                  <div className="card">
                    <div className="card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={18} color="#f59e0b" />
                        <h3 className="card-title">Severity Breakdown</h3>
                      </div>
                    </div>
                    <div className="card-body">
                      <StatBar label="BLOCKER" value={severityDist.BLOCKER} total={dashboardStats.issues.total} color="#ef4444" />
                      <StatBar label="CRITICAL" value={severityDist.CRITICAL} total={dashboardStats.issues.total} color="#f97316" />
                      <StatBar label="MAJOR" value={severityDist.MAJOR} total={dashboardStats.issues.total} color="#f59e0b" />
                      <StatBar label="MINOR" value={severityDist.MINOR} total={dashboardStats.issues.total} color="#6366f1" />

                      <div
                        style={{
                          marginTop: '1.25rem',
                          paddingTop: '1rem',
                          borderTop: '1px solid var(--border-subtle)',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#ef4444' }}>
                            {severityDist.BLOCKER + severityDist.CRITICAL}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Critical + Blocker</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#f59e0b' }}>
                            {dashboardStats.issues.total > 0
                              ? Math.round((dashboardStats.issues.resolved / dashboardStats.issues.total) * 100)
                              : 0}%
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Resolution Rate</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Reported Issues */}
              <div className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Bug size={18} color="#f59e0b" />
                    <h3 className="card-title">Recently Reported Issues</h3>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActiveTab('issues')}
                  >
                    Manage All Issues
                  </button>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {recentReported.length === 0 ? (
                    <EmptyState title="No reported issues" description="No new issues awaiting review." />
                  ) : (
                    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Key</th>
                            <th>Title</th>
                            <th>Severity</th>
                            <th>Priority</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentReported.map((issue) => (
                            <tr key={issue.id}>
                              <td>
                                <Link
                                  to={`/issues/${issue.id}`}
                                  style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--primary)' }}
                                >
                                  {issue.issue_key}
                                </Link>
                              </td>
                              <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {issue.title}
                              </td>
                              <td><SeverityBadge severity={issue.severity} /></td>
                              <td><PriorityBadge priority={issue.priority} /></td>
                              <td><StatusBadge status={issue.status} /></td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {formatRelativeTime(issue.created_at)}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <Link to={`/issues/${issue.id}`} className="btn btn-secondary btn-sm">
                                    <ExternalLink size={12} /> View
                                  </Link>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => { setActiveTab('issues'); }}
                                    title="Go to Issue Management to assign"
                                  >
                                    <UserPlus size={12} /> Assign
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB 2: ISSUE MANAGEMENT                 */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === 'issues' && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bug size={18} color="#818cf8" />
              <h3 className="card-title">All Issues ({issuesTotal})</h3>
            </div>
          </div>
          <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
            {/* Filters */}
            <form
              onSubmit={(e) => { e.preventDefault(); setIssuesPage(1); fetchIssues(); }}
              style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <input
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="Search by key, title..."
                  value={issuesSearch}
                  onChange={(e) => setIssuesSearch(e.target.value)}
                />
                <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
              <select className="form-select" style={{ width: 'auto', minWidth: '130px' }} value={issuesStatus} onChange={(e) => { setIssuesStatus(e.target.value as IssueStatus | ''); setIssuesPage(1); }}>
                <option value="">All Statuses</option>
                {(['REPORTED','TRIAGED','ASSIGNED','IN_DEVELOPMENT','IN_REVIEW','IN_TESTING','RESOLVED','CLOSED','REOPENED'] as IssueStatus[]).map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <select className="form-select" style={{ width: 'auto', minWidth: '110px' }} value={issuesSeverity} onChange={(e) => { setIssuesSeverity(e.target.value as Severity | ''); setIssuesPage(1); }}>
                <option value="">All Severities</option>
                {(['MINOR','MAJOR','CRITICAL','BLOCKER'] as Severity[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="form-select" style={{ width: 'auto', minWidth: '110px' }} value={issuesPriority} onChange={(e) => { setIssuesPriority(e.target.value as Priority | ''); setIssuesPage(1); }}>
                <option value="">All Priorities</option>
                {(['LOW','MEDIUM','HIGH','URGENT'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="submit" className="btn btn-secondary btn-sm">Search</button>
            </form>

            {issuesLoading && <LoadingSpinner message="Loading issues..." />}
            {issuesError && <ErrorMessage message={issuesError} onRetry={fetchIssues} />}

            {!issuesLoading && !issuesError && (
              issues.length === 0 ? (
                <EmptyState title="No issues found" description="No issues match your current filters." />
              ) : (
                <>
                  <div className="table-container" style={{ border: 'none' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Key</th>
                          <th>Title</th>
                          <th>Severity</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Updated</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issues.map((issue) => (
                          <tr key={issue.id}>
                            <td>
                              <Link to={`/issues/${issue.id}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--primary)' }}>
                                {issue.issue_key}
                              </Link>
                            </td>
                            <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <Link to={`/issues/${issue.id}`} style={{ color: 'var(--text-primary)' }}>{issue.title}</Link>
                            </td>
                            <td><SeverityBadge severity={issue.severity} /></td>
                            <td><PriorityBadge priority={issue.priority} /></td>
                            <td><StatusBadge status={issue.status} /></td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {formatRelativeTime(issue.updated_at)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                <Link to={`/issues/${issue.id}`} className="btn btn-secondary btn-sm">
                                  <ExternalLink size={12} /> View
                                </Link>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => openAssignModal(issue)}
                                >
                                  <UserPlus size={12} /> Assign
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {issuesTotalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                      <button onClick={() => setIssuesPage((p) => Math.max(1, p - 1))} disabled={issuesPage === 1} className="btn btn-secondary btn-sm">Previous</button>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0.5rem' }}>
                        Page {issuesPage} of {issuesTotalPages}
                      </span>
                      <button onClick={() => setIssuesPage((p) => Math.min(issuesTotalPages, p + 1))} disabled={issuesPage === issuesTotalPages} className="btn btn-secondary btn-sm">Next</button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB 3: TESTER WORKLOAD                   */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === 'workload' && (
        <>
          {workloadLoading && <LoadingSpinner message="Loading workload data..." />}
          {workloadError && <ErrorMessage message={workloadError} onRetry={fetchWorkload} />}

          {!workloadLoading && !workloadError && (
            <>
              {/* Tester Performance */}
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} color="#818cf8" />
                    <h3 className="card-title">Tester Performance</h3>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {devPerformance.length} tester{devPerformance.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {devPerformance.length === 0 ? (
                    <EmptyState title="No tester data" description="No tester performance data available." />
                  ) : (
                    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Tester</th>
                            <th>Assigned</th>
                            <th>Resolved</th>
                            <th>Open</th>
                            <th>Resolution Rate</th>
                            <th>Avg. Time (hrs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {devPerformance.map((dev) => (
                            <tr key={dev.developer_id}>
                              <td>
                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{dev.developer_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dev.developer_email}</div>
                              </td>
                              <td>
                                <span className="badge" style={{ backgroundColor: 'var(--primary-subtle)', color: '#818cf8' }}>
                                  {dev.assigned_issues}
                                </span>
                              </td>
                              <td>
                                <span className="badge" style={{ backgroundColor: 'var(--success-subtle)', color: '#34d399' }}>
                                  {dev.resolved_issues}
                                </span>
                              </td>
                              <td>
                                <span className="badge" style={{ backgroundColor: 'var(--warning-subtle)', color: '#f59e0b' }}>
                                  {dev.open_issues}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', backgroundColor: 'var(--bg-surface-elevated)' }}>
                                    <div style={{
                                      height: '100%', borderRadius: '3px',
                                      width: `${Math.round(dev.resolution_rate * 100)}%`,
                                      backgroundColor: dev.resolution_rate > 0.6 ? '#10b981' : dev.resolution_rate > 0.3 ? '#f59e0b' : '#ef4444',
                                    }} />
                                  </div>
                                  <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)', minWidth: '36px' }}>
                                    {Math.round(dev.resolution_rate * 100)}%
                                  </span>
                                </div>
                              </td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {dev.average_resolution_time_hours !== null
                                  ? `${Math.round(dev.average_resolution_time_hours)}h`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Tester List */}
              <div className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserCheck size={18} color="#34d399" />
                    <h3 className="card-title">Active Testers</h3>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {testersList.length} tester{testersList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {testersList.length === 0 ? (
                    <EmptyState title="No active testers" description="No testers are currently active in the system." />
                  ) : (
                    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Tester</th>
                            <th>Status</th>
                            <th>Email Verified</th>
                            <th>Member Since</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testersList.map((tester) => (
                            <tr key={tester.id}>
                              <td>
                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{tester.full_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tester.email}</div>
                              </td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: '600', color: tester.is_active ? '#34d399' : '#f87171' }}>
                                  {tester.is_active ? <CheckCircle size={13} /> : <XCircle size={13} />}
                                  {tester.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: tester.is_email_verified ? '#34d399' : 'var(--text-muted)' }}>
                                  {tester.is_email_verified ? <CheckCircle size={13} /> : <XCircle size={13} />}
                                  {tester.is_email_verified ? 'Verified' : 'Pending'}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {formatDate(tester.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB 4: ANALYTICS                        */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <>
          {analyticsLoading && <LoadingSpinner message="Loading analytics..." />}
          {analyticsError && <ErrorMessage message={analyticsError} onRetry={fetchAnalytics} />}

          {!analyticsLoading && !analyticsError && sysAnalytics && (
            <>
              {/* System Overview Cards */}
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Total Users</span>
                    <span className="metric-value">{sysAnalytics.total_users}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {sysAnalytics.active_users} Active
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-purple"><Users size={20} /></div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Active Projects</span>
                    <span className="metric-value">{sysAnalytics.active_projects}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      of {sysAnalytics.total_projects} total
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-emerald"><FolderGit2 size={20} /></div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Open Issues</span>
                    <span className="metric-value">{sysAnalytics.open_issues}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {sysAnalytics.in_progress_issues} In Progress
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-amber"><Clock size={20} /></div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Resolved + Closed</span>
                    <span className="metric-value">{sysAnalytics.resolved_issues + sysAnalytics.closed_issues}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {sysAnalytics.total_issues > 0
                        ? `${Math.round(((sysAnalytics.resolved_issues + sysAnalytics.closed_issues) / sysAnalytics.total_issues) * 100)}% Rate`
                        : '0% Rate'}
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-emerald"><CheckCircle size={20} /></div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Critical Issues</span>
                    <span className="metric-value" style={{ color: '#ef4444' }}>
                      {sysAnalytics.critical_issues}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Needs Immediate Attention
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-rose"><AlertTriangle size={20} /></div>
                </div>

                <div className="metric-card">
                  <div className="metric-info">
                    <span className="metric-label">Total Issues</span>
                    <span className="metric-value">{sysAnalytics.total_issues}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      All time
                    </span>
                  </div>
                  <div className="metric-icon-box metric-icon-indigo"><Bug size={20} /></div>
                </div>
              </div>

              {/* Distribution Charts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
                {statusDist && (
                  <div className="card">
                    <div className="card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={18} color="#818cf8" />
                        <h3 className="card-title">Status Distribution</h3>
                      </div>
                    </div>
                    <div className="card-body">
                      {Object.entries(statusDist).map(([status, count]) => (
                        <StatBar
                          key={status}
                          label={status.replace(/_/g, ' ')}
                          value={count as number}
                          total={sysAnalytics.total_issues}
                          color={
                            status === 'REPORTED' ? '#6366f1' :
                            status === 'ASSIGNED' ? '#f59e0b' :
                            status === 'IN_DEVELOPMENT' ? '#0ea5e9' :
                            status === 'IN_REVIEW' ? '#a78bfa' :
                            status === 'RESOLVED' ? '#10b981' :
                            status === 'CLOSED' ? '#34d399' :
                            status === 'REOPENED' ? '#f87171' : '#64748b'
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {severityDist && (
                  <div className="card">
                    <div className="card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={18} color="#f59e0b" />
                        <h3 className="card-title">Severity Distribution</h3>
                      </div>
                    </div>
                    <div className="card-body">
                      <StatBar label="BLOCKER" value={severityDist.BLOCKER} total={sysAnalytics.total_issues} color="#ef4444" />
                      <StatBar label="CRITICAL" value={severityDist.CRITICAL} total={sysAnalytics.total_issues} color="#f97316" />
                      <StatBar label="MAJOR" value={severityDist.MAJOR} total={sysAnalytics.total_issues} color="#f59e0b" />
                      <StatBar label="MINOR" value={severityDist.MINOR} total={sysAnalytics.total_issues} color="#6366f1" />

                      <div
                        style={{
                          marginTop: '1.25rem',
                          paddingTop: '1rem',
                          borderTop: '1px solid var(--border-subtle)',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '0.75rem',
                        }}
                      >
                        {[
                          { label: 'BLOCKER', val: severityDist.BLOCKER, color: '#ef4444' },
                          { label: 'CRITICAL', val: severityDist.CRITICAL, color: '#f97316' },
                          { label: 'MAJOR', val: severityDist.MAJOR, color: '#f59e0b' },
                          { label: 'MINOR', val: severityDist.MINOR, color: '#6366f1' },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ textAlign: 'center', padding: '0.75rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: '700', color }}>{val}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB 5: USER MANAGEMENT                  */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} color="#818cf8" />
              <h3 className="card-title">User Directory & Role Provisioning</h3>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Total Registered: {usersTotal}
            </span>
          </div>
          <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
            {/* Search & Filters */}
            <form
              onSubmit={(e) => { e.preventDefault(); setUsersPage(1); fetchUsers(); }}
              style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="Search user by name or email..."
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                />
                <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
              <select className="form-select" style={{ width: 'auto', minWidth: '130px' }} value={usersRoleFilter} onChange={(e) => { setUsersRoleFilter(e.target.value as UserRole | ''); setUsersPage(1); }}>
                <option value="">All Roles</option>
                <option value="ADMIN">ADMIN</option>
                <option value="DEVELOPER">DEVELOPER</option>
                <option value="TESTER">TESTER</option>
              </select>
              <select className="form-select" style={{ width: 'auto', minWidth: '130px' }} value={usersActiveFilter === '' ? '' : usersActiveFilter ? 'true' : 'false'} onChange={(e) => { setUsersActiveFilter(e.target.value === '' ? '' : e.target.value === 'true'); setUsersPage(1); }}>
                <option value="">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive Only</option>
              </select>
              <button type="submit" className="btn btn-secondary btn-sm">Search</button>
            </form>

            {usersLoading && <LoadingSpinner message="Loading users..." />}
            {usersError && <ErrorMessage message={usersError} onRetry={fetchUsers} />}

            {!usersLoading && !usersError && (
              usersList.length === 0 ? (
                <EmptyState title="No users found" description="No user records matched your search or filters." />
              ) : (
                <>
                  <div className="table-container" style={{ border: 'none' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleUsersSort('full_name')} style={{ cursor: 'pointer' }}>
                            User {usersSortBy === 'full_name' ? (usersSortDesc ? '▼' : '▲') : ''}
                          </th>
                          <th onClick={() => handleUsersSort('role')} style={{ cursor: 'pointer' }}>
                            Role {usersSortBy === 'role' ? (usersSortDesc ? '▼' : '▲') : ''}
                          </th>
                          <th onClick={() => handleUsersSort('is_active')} style={{ cursor: 'pointer' }}>
                            Status {usersSortBy === 'is_active' ? (usersSortDesc ? '▼' : '▲') : ''}
                          </th>
                          <th onClick={() => handleUsersSort('is_email_verified')} style={{ cursor: 'pointer' }}>
                            Email Verified {usersSortBy === 'is_email_verified' ? (usersSortDesc ? '▼' : '▲') : ''}
                          </th>
                          <th onClick={() => handleUsersSort('created_at')} style={{ cursor: 'pointer' }}>
                            Created {usersSortBy === 'created_at' ? (usersSortDesc ? '▼' : '▲') : ''}
                          </th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                {u.full_name} {u.id === currentUser?.id && '(You)'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                            </td>
                            <td>
                              <span className={`user-role-badge ${u.role === 'ADMIN' ? 'role-admin' : u.role === 'DEVELOPER' ? 'role-developer' : 'role-tester'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: '600', color: u.is_active ? '#34d399' : '#f87171' }}>
                                {u.is_active ? <CheckCircle size={13} /> : <XCircle size={13} />}
                                {u.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: u.is_email_verified ? '#34d399' : 'var(--text-muted)' }}>
                                {u.is_email_verified ? <CheckCircle size={13} /> : <XCircle size={13} />}
                                {u.is_email_verified ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {formatDate(u.created_at)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                <button onClick={() => handleOpenRoleModal(u)} className="btn btn-secondary btn-sm" title="Change Role">
                                  <Edit2 size={13} /> Role
                                </button>
                                {u.is_active ? (
                                  <button onClick={() => handleDeactivateUser(u)} className="btn btn-outline-danger btn-sm" title="Deactivate Account">
                                    <PowerOff size={13} /> Deactivate
                                  </button>
                                ) : (
                                  <button onClick={() => handleActivateUser(u)} className="btn btn-secondary btn-sm" style={{ color: '#34d399' }} title="Activate Account">
                                    <UserCheck size={13} /> Activate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {usersTotalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                      <button onClick={() => setUsersPage((p) => Math.max(1, p - 1))} disabled={usersPage === 1} className="btn btn-secondary btn-sm">Previous</button>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0.5rem' }}>
                        Page {usersPage} of {usersTotalPages}
                      </span>
                      <button onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))} disabled={usersPage === usersTotalPages} className="btn btn-secondary btn-sm">Next</button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* ASSIGN ISSUE MODAL                      */}
      {/* ═══════════════════════════════════════ */}
      <Modal
        isOpen={!!assignModalIssue}
        onClose={() => setAssignModalIssue(null)}
        title={`Assign Issue: ${assignModalIssue?.issue_key}`}
      >
        {assignError && (
          <div className="alert-box alert-danger" style={{ marginBottom: '1rem' }}>
            <span>{assignError}</span>
          </div>
        )}
        {devsLoading ? (
          <LoadingSpinner message="Loading testers..." />
        ) : (
          <form onSubmit={handleAssignSubmit}>
            <div className="form-group">
              <label className="form-label">Issue</label>
              <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: '600' }}>{assignModalIssue?.issue_key}</span>{' '}
                — {assignModalIssue?.title}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="assign-dev-select">Assign to Tester</label>
              <select
                id="assign-dev-select"
                className="form-select"
                value={selectedDevId}
                onChange={(e) => setSelectedDevId(e.target.value === '' ? '' : Number(e.target.value))}
                required
              >
                <option value="">— Select a tester —</option>
                {availableDevs.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.full_name} ({dev.email})
                  </option>
                ))}
              </select>
              <span className="form-help">
                Only active testers are listed.
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" onClick={() => setAssignModalIssue(null)} className="btn btn-secondary" disabled={assignLoading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={assignLoading || !selectedDevId}>
                {assignLoading ? 'Assigning...' : 'Assign Issue'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ═══════════════════════════════════════ */}
      {/* CHANGE ROLE MODAL                       */}
      {/* ═══════════════════════════════════════ */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        title={`Change Role: ${selectedUser?.full_name}`}
      >
        {roleModalError && (
          <div className="alert-box alert-danger">
            <span>{roleModalError}</span>
          </div>
        )}
        <form onSubmit={handleRoleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="new-role-select">Select New System Role</label>
            <select id="new-role-select" className="form-select" value={targetRole} onChange={(e) => setTargetRole(e.target.value as UserRole)}>
              <option value="ADMIN">ADMIN (Full management access)</option>
              <option value="TESTER">TESTER (Issue investigation & resolution)</option>
              <option value="DEVELOPER">DEVELOPER (Legacy — issue assignee)</option>
            </select>
            <span className="form-help">
              Note: Last active admin protection is enforced automatically by the server.
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" onClick={() => setIsRoleModalOpen(false)} className="btn btn-secondary" disabled={isSubmittingRole}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingRole}>
              {isSubmittingRole ? 'Updating...' : 'Save Role'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
