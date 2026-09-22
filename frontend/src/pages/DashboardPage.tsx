import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bug,
  CheckCheck,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileDown,
  FilePlus2,
  FolderGit2,
  HeartPulse,
  PieChart,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { analyticsApi } from '../api/analytics';
import { getApiErrorMessage } from '../api/client';
import { issuesApi } from '../api/issues';
import { projectsApi } from '../api/projects';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type {
  IssueStatusDistributionResponse,
  IssueTrendResponse,
  PriorityDistributionResponse,
  ProjectAnalyticsResponse,
  SeverityDistributionResponse,
  SystemAnalyticsResponse,
} from '../types/analytics';
import type { Issue, IssueStatus, Priority, Severity } from '../types/issue';
import type { Project } from '../types/project';
import { getRoleLabel } from '../types/auth';
import { formatDate, formatRelativeTime } from '../utils/formatters';
import { generateAnalyticsPdfReport, generateIssuesPdfReport } from '../utils/pdfGenerator';

type DashboardDensity = 'comfortable' | 'compact';
type TrendRange = '7d' | '30d' | '90d' | 'all';
type FilterChip =
  | 'ALL'
  | 'OPEN'
  | 'AWAITING_REVIEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'HIGH_SEVERITY'
  | 'URGENT';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isUser = user?.role === 'USER';
  const isTester = user?.role === 'TESTER' || user?.role === 'DEVELOPER';
  const isAdmin = user?.role === 'ADMIN';

  // --- Real Data State from PostgreSQL ---
  const [systemStats, setSystemStats] = useState<SystemAnalyticsResponse | null>(null);
  const [statusDist, setStatusDist] = useState<IssueStatusDistributionResponse | null>(null);
  const [severityDist, setSeverityDist] = useState<SeverityDistributionResponse | null>(null);
  const [priorityDist, setPriorityDist] = useState<PriorityDistributionResponse | null>(null);
  const [userIssues, setUserIssues] = useState<Issue[]>([]);
  const [projectAnalytics, setProjectAnalytics] = useState<ProjectAnalyticsResponse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trendData, setTrendData] = useState<IssueTrendResponse | null>(null);
  const [trendRange, setTrendRange] = useState<TrendRange>('30d');
  const [totalIssueCount, setTotalIssueCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // --- UI Preferences State (Persisted in localStorage) ---
  const [density, setDensity] = useState<DashboardDensity>(() => {
    return (localStorage.getItem('bugtracker_dashboard_density') as DashboardDensity) || 'comfortable';
  });
  const [selectedChip, setSelectedChip] = useState<FilterChip>(() => {
    return (localStorage.getItem('bugtracker_dashboard_default_filter') as FilterChip) || 'ALL';
  });

  // --- Search & Multi-Filter State ---
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'ALL'>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'ALL'>('ALL');

  // --- Action Modal State (for quick Reopen from Dashboard) ---
  const [reopenModalIssue, setReopenModalIssue] = useState<Issue | null>(null);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [isActionSubmitting, setIsActionSubmitting] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Project map for instant key/name lookups
  const projectMap = useMemo(() => {
    const map = new Map<number, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Load Dashboard Data from Real PostgreSQL Backend
  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      // 1. Fetch user's scoped issues list
      const issuesRes = await issuesApi.list({ page_size: 100 });
      setUserIssues(issuesRes.items || []);
      setTotalIssueCount(issuesRes.total || 0);

      // 2. Fetch scoped status, severity, and priority distributions
      const [distRes, sevRes, priRes] = await Promise.all([
        analyticsApi.getStatusDistribution(),
        analyticsApi.getSeverityDistribution(),
        analyticsApi.getPriorityDistribution(),
      ]);
      setStatusDist(distRes);
      setSeverityDist(sevRes);
      setPriorityDist(priRes);

      // 3. Fetch Project Analytics for My Projects breakdown
      try {
        const projRes = await analyticsApi.getAllProjectsAnalytics();
        setProjectAnalytics(projRes.items || []);
      } catch {
        // Fallback gracefully
      }

      // 4. Fetch Projects for dropdown filtering
      try {
        const projsList = await projectsApi.list({ page_size: 50 });
        setProjects(projsList.items || []);
      } catch {
        // Soft fail
      }

      // 5. Global overview for Admin role
      if (isAdmin) {
        try {
          const sysRes = await analyticsApi.getSystemOverview();
          setSystemStats(sysRes);
        } catch {
          // Soft fail
        }
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAdmin]);

  // Fetch Activity Trends based on selected range
  const loadTrends = useCallback(async () => {
    try {
      let interval: 'day' | 'week' | 'month' = 'day';
      let startDate: string | undefined = undefined;
      const now = new Date();

      if (trendRange === '7d') {
        interval = 'day';
        const d = new Date();
        d.setDate(now.getDate() - 7);
        startDate = d.toISOString();
      } else if (trendRange === '30d') {
        interval = 'day';
        const d = new Date();
        d.setDate(now.getDate() - 30);
        startDate = d.toISOString();
      } else if (trendRange === '90d') {
        interval = 'week';
        const d = new Date();
        d.setDate(now.getDate() - 90);
        startDate = d.toISOString();
      } else {
        interval = 'month';
      }

      const res = await analyticsApi.getTrends({
        interval,
        start_date: startDate,
      });
      setTrendData(res);
    } catch {
      // Soft fail for trends
    }
  }, [trendRange]);

  useEffect(() => {
    let isMounted = true;
    let timerId: number;

    const pollData = async () => {
      await loadDashboardData(true);
      if (isMounted) {
        timerId = window.setTimeout(pollData, 3000);
      }
    };

    loadDashboardData();
    timerId = window.setTimeout(pollData, 3000);
    
    const handleFocus = () => loadDashboardData(true);
    const handleStatusUpdate = () => loadDashboardData(true);
    
    window.addEventListener("focus", handleFocus);
    window.addEventListener("issue:status-updated", handleStatusUpdate);
    
    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("issue:status-updated", handleStatusUpdate);
    };
  }, [loadDashboardData]);

  useEffect(() => {
    loadTrends();
    const trendTimer = window.setInterval(() => {
      loadTrends();
    }, 10000); // Trends update slightly less often
    
    return () => window.clearInterval(trendTimer);
  }, [loadTrends]);

  // Preferences Handlers
  const handleDensityChange = (newDensity: DashboardDensity) => {
    setDensity(newDensity);
    localStorage.setItem('bugtracker_dashboard_density', newDensity);
  };

  const handleDefaultFilterChange = (newFilter: FilterChip) => {
    setSelectedChip(newFilter);
    localStorage.setItem('bugtracker_dashboard_default_filter', newFilter);
  };

  // Quick Action: Confirm Resolution from Dashboard
  const handleConfirmClose = async (issueId: number) => {
    if (!window.confirm('Confirm that this defect has been resolved satisfactorily?')) return;
    setIsActionSubmitting(true);
    try {
      await issuesApi.close(issueId);
      setActionSuccessMsg('Issue confirmed and closed successfully!');
      setTimeout(() => setActionSuccessMsg(null), 4000);
      await loadDashboardData(true);
    } catch (err: unknown) {
      alert('Failed to close issue: ' + getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Quick Action: Submit Reopen
  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenModalIssue) return;
    setIsActionSubmitting(true);
    try {
      await issuesApi.reopen(reopenModalIssue.id, { reason: reopenReason.trim() || undefined });
      setReopenModalIssue(null);
      setReopenReason('');
      setActionSuccessMsg(`Issue ${reopenModalIssue.issue_key} has been reopened for further investigation.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
      await loadDashboardData(true);
    } catch (err: unknown) {
      alert('Failed to reopen issue: ' + getApiErrorMessage(err));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // --- Real Core Metric Calculations (STEP 3 B) ---
  const awaitingReviewCount = statusDist
    ? (statusDist.REPORTED || 0) + (statusDist.TRIAGED || 0)
    : 0;

  const assignedToTesterCount = statusDist ? statusDist.ASSIGNED || 0 : 0;

  const inProgressCount = statusDist
    ? (statusDist.IN_DEVELOPMENT || 0) +
      (statusDist.IN_REVIEW || 0) +
      (statusDist.IN_TESTING || 0)
    : 0;

  const resolvedCount = statusDist ? statusDist.RESOLVED || 0 : 0;
  const closedCount = statusDist ? statusDist.CLOSED || 0 : 0;
  const reopenedCount = statusDist ? statusDist.REOPENED || 0 : 0;

  // Open issues = Total minus (Resolved + Closed)
  const openIssuesCount = Math.max(0, totalIssueCount - (resolvedCount + closedCount));

  // Safe resolution rate = ((resolved + closed) / total) * 100
  const resolutionRate =
    totalIssueCount > 0
      ? Math.round(((resolvedCount + closedCount) / totalIssueCount) * 100)
      : 0;

  // --- STEP 3 A: Live Dynamic Summary Header ---
  const smartSummaryText = useMemo(() => {
    if (totalIssueCount === 0) {
      return 'Welcome to your defect dashboard! Report your first issue to track investigation and resolution.';
    }
    if (resolvedCount > 0) {
      return `You have ${resolvedCount} resolved issue${resolvedCount > 1 ? 's' : ''} awaiting your confirmation.`;
    }
    if (openIssuesCount > 0) {
      return `You have ${awaitingReviewCount} issue${awaitingReviewCount > 1 ? 's' : ''} awaiting review and ${assignedToTesterCount + inProgressCount} currently being investigated.`;
    }
    return 'All your reported issues are currently resolved or closed.';
  }, [totalIssueCount, resolvedCount, openIssuesCount, awaitingReviewCount, assignedToTesterCount, inProgressCount]);

  // --- STEP 3 C: Action Required Section (Resolved awaiting confirmation + Reopened) ---
  const actionRequiredIssues = useMemo(() => {
    return userIssues.filter((iss) => iss.status === 'RESOLVED' || iss.status === 'REOPENED');
  }, [userIssues]);

  // --- STEP 3 D: Needs Attention (Ranked by priority) ---
  const needsAttentionIssues = useMemo(() => {
    return userIssues
      .filter((iss) => {
        if (iss.status === 'RESOLVED') return true;
        if (iss.status === 'REOPENED') return true;
        if (iss.severity === 'BLOCKER' || iss.severity === 'CRITICAL') return !['CLOSED'].includes(iss.status);
        if (iss.priority === 'URGENT') return !['CLOSED'].includes(iss.status);
        const ageHours = (Date.now() - new Date(iss.created_at).getTime()) / (1000 * 60 * 60);
        return ageHours > 168 && !['CLOSED'].includes(iss.status);
      })
      .sort((a, b) => {
        // Priority weight ranking
        const getWeight = (i: Issue) => {
          if (i.status === 'RESOLVED') return 100;
          if (i.severity === 'BLOCKER') return 90;
          if (i.severity === 'CRITICAL') return 80;
          if (i.priority === 'URGENT') return 70;
          if (i.status === 'REOPENED') return 60;
          return 50;
        };
        return getWeight(b) - getWeight(a);
      })
      .slice(0, 5);
  }, [userIssues]);

  // --- STEP 3 E: Recent Issues (Most recently updated) ---
  const recentIssues = useMemo(() => {
    return [...userIssues]
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 6);
  }, [userIssues]);

  // --- STEP 5: Issue Aging (Open issues in 5 buckets) ---
  const agingStats = useMemo(() => {
    const openList = userIssues.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status));
    const now = Date.now();
    const buckets = {
      today: 0,
      days1to3: 0,
      days4to7: 0,
      days8to14: 0,
      days15plus: 0,
    };

    openList.forEach((iss) => {
      const created = new Date(iss.created_at).getTime();
      const ageHours = (now - created) / (1000 * 60 * 60);

      if (ageHours < 24) buckets.today++;
      else if (ageHours < 72) buckets.days1to3++;
      else if (ageHours < 168) buckets.days4to7++;
      else if (ageHours < 336) buckets.days8to14++;
      else buckets.days15plus++;
    });

    const totalOpen = openList.length;
    return {
      totalOpen,
      buckets: [
        { label: 'Today (<24h)', count: buckets.today, pct: totalOpen ? Math.round((buckets.today / totalOpen) * 100) : 0, color: '#34d399' },
        { label: '1–3 Days', count: buckets.days1to3, pct: totalOpen ? Math.round((buckets.days1to3 / totalOpen) * 100) : 0, color: '#818cf8' },
        { label: '4–7 Days', count: buckets.days4to7, pct: totalOpen ? Math.round((buckets.days4to7 / totalOpen) * 100) : 0, color: '#fbbf24' },
        { label: '8–14 Days', count: buckets.days8to14, pct: totalOpen ? Math.round((buckets.days8to14 / totalOpen) * 100) : 0, color: '#fb923c' },
        { label: '15+ Days', count: buckets.days15plus, pct: totalOpen ? Math.round((buckets.days15plus / totalOpen) * 100) : 0, color: '#f87171' },
      ],
    };
  }, [userIssues]);

  // --- STEP 6: Deterministic Issue Health Score ---
  const healthScoreInfo = useMemo(() => {
    if (totalIssueCount === 0) {
      return {
        score: 100,
        status: 'Optimal',
        color: '#34d399',
        reasons: ['No open defects found in your account.', 'Defect tracking environment in optimal state.'],
      };
    }

    let score = 100;
    const reasons: string[] = [];

    // -15 for each open critical/blocker issue
    const openCritical = userIssues.filter(
      (i) => !['RESOLVED', 'CLOSED'].includes(i.status) && (i.severity === 'CRITICAL' || i.severity === 'BLOCKER')
    ).length;
    if (openCritical > 0) {
      score -= openCritical * 15;
      reasons.push(`${openCritical} open Critical/Blocker defect${openCritical > 1 ? 's' : ''} (-${openCritical * 15})`);
    }

    // -10 for each open urgent issue
    const openUrgent = userIssues.filter(
      (i) => !['RESOLVED', 'CLOSED'].includes(i.status) && i.priority === 'URGENT'
    ).length;
    if (openUrgent > 0) {
      score -= openUrgent * 10;
      reasons.push(`${openUrgent} open Urgent priority defect${openUrgent > 1 ? 's' : ''} (-${openUrgent * 10})`);
    }

    // -5 for each issue older than 7 days
    const agingCount = (agingStats.buckets[3]?.count || 0) + (agingStats.buckets[4]?.count || 0);
    if (agingCount > 0) {
      score -= agingCount * 5;
      reasons.push(`${agingCount} defect${agingCount > 1 ? 's' : ''} open >7 days (-${agingCount * 5})`);
    }

    // +10 if resolution rate is 75% or higher
    if (resolutionRate >= 75) {
      score += 10;
      reasons.push(`High resolution rate (${resolutionRate}%) (+10)`);
    }

    const clampedScore = Math.max(0, Math.min(100, score));
    let statusLabel = 'Excellent';
    let statusColor = '#34d399';

    if (clampedScore < 50) {
      statusLabel = 'Needs Attention';
      statusColor = '#ef4444';
    } else if (clampedScore < 75) {
      statusLabel = 'Moderate';
      statusColor = '#f59e0b';
    } else if (clampedScore < 90) {
      statusLabel = 'Good';
      statusColor = '#6366f1';
    }

    if (reasons.length === 0) {
      reasons.push(`${resolvedCount + closedCount} of ${totalIssueCount} defects resolved (${resolutionRate}%)`);
    }

    return {
      score: clampedScore,
      status: statusLabel,
      color: statusColor,
      reasons,
    };
  }, [totalIssueCount, userIssues, agingStats, resolutionRate, resolvedCount, closedCount]);

  // --- STEP 4 D: Scoped Project Breakdown ---
  const myProjectsBreakdown = useMemo(() => {
    // Only projects where the logged-in user has reported issues
    return projectAnalytics.filter((p) => p.total_issues > 0);
  }, [projectAnalytics]);

  // --- STEP 7: Search and Multi-Filtering ---
  const filteredIssues = useMemo(() => {
    return userIssues.filter((issue) => {
      // 1. Quick Chip Filter
      if (selectedChip === 'OPEN' && ['RESOLVED', 'CLOSED'].includes(issue.status)) return false;
      if (selectedChip === 'AWAITING_REVIEW' && !['REPORTED', 'TRIAGED'].includes(issue.status)) return false;
      if (selectedChip === 'ASSIGNED' && issue.status !== 'ASSIGNED') return false;
      if (selectedChip === 'IN_PROGRESS' && !['IN_DEVELOPMENT', 'IN_REVIEW', 'IN_TESTING'].includes(issue.status)) return false;
      if (selectedChip === 'RESOLVED' && issue.status !== 'RESOLVED') return false;
      if (selectedChip === 'CLOSED' && issue.status !== 'CLOSED') return false;
      if (selectedChip === 'REOPENED' && issue.status !== 'REOPENED') return false;
      if (selectedChip === 'HIGH_SEVERITY' && !['BLOCKER', 'CRITICAL'].includes(issue.severity)) return false;
      if (selectedChip === 'URGENT' && issue.priority !== 'URGENT') return false;

      // 2. Dropdown Filters
      if (statusFilter !== 'ALL' && issue.status !== statusFilter) return false;
      if (projectFilter !== 'ALL' && String(issue.project_id) !== projectFilter) return false;
      if (severityFilter !== 'ALL' && issue.severity !== severityFilter) return false;
      if (priorityFilter !== 'ALL' && issue.priority !== priorityFilter) return false;

      // 3. Search query filter (Issue key, Title, Description)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKey = issue.issue_key.toLowerCase().includes(q);
        const matchTitle = issue.title.toLowerCase().includes(q);
        return matchKey || matchTitle;
      }

      return true;
    });
  }, [userIssues, selectedChip, statusFilter, projectFilter, severityFilter, priorityFilter, searchQuery]);

  // Export handlers (STEP 10)
  const handleExportPdf = () => {
    generateAnalyticsPdfReport({
      user,
      statusDist,
      severityDist,
      projectAnalytics,
      systemOverview: systemStats,
    });
  };

  const handleExportIssuesPdf = () => {
    generateIssuesPdfReport(filteredIssues, user, `Filter: ${selectedChip}`, projects);
  };

  const handleExportCsv = async () => {
    try {
      await analyticsApi.exportIssuesCsv();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 0' }}>
        <LoadingSpinner message="Aggregating live defect analytics..." />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={() => loadDashboardData()} />;
  }

  return (
    <div className="dashboard-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Toast Notification Alert */}
      {actionSuccessMsg && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.9rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* STEP 3 A: Live Dynamic Summary Header */}
      <div
        className="card dashboard-summary-card"
        style={{
          padding: '1.25rem 1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.25rem',
          }}
        >
          <div style={{ flex: '1', minWidth: '280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span className="badge" style={{ backgroundColor: 'var(--primary-subtle)', color: '#818cf8', fontWeight: '600' }}>
                <Sparkles size={13} /> {getRoleLabel(user?.role ?? 'USER')} PORTAL
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.email}</span>
            </div>

            <h1 style={{ fontSize: '1.65rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
              Welcome back, {user?.full_name}!
            </h1>

            {/* Dynamic Summary Text */}
            <p
              style={{
                color: resolvedCount > 0 ? '#34d399' : 'var(--text-secondary)',
                fontSize: '0.925rem',
                margin: 0,
                fontWeight: resolvedCount > 0 ? '600' : 'normal',
                lineHeight: 1.4,
              }}
            >
              {smartSummaryText}
            </p>
          </div>

          {/* Action Header Buttons & Layout Density Controls */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => handleDensityChange(density === 'comfortable' ? 'compact' : 'comfortable')}
              className="btn btn-secondary btn-sm"
              title={`Toggle Density (Currently ${density})`}
            >
              <SlidersHorizontal size={14} />
              <span>{density === 'comfortable' ? 'Compact' : 'Comfortable'}</span>
            </button>

            <button
              onClick={() => loadDashboardData(true)}
              className="btn btn-secondary btn-sm"
              disabled={isRefreshing}
              title="Refresh Dashboard Metrics"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExportPdf}
              disabled={userIssues.length === 0}
              title="Download Personal PDF Report"
            >
              <FileDown size={15} />
              <span>Export PDF</span>
            </button>

            {isUser && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/create-issue')}
                style={{ fontWeight: '600' }}
              >
                <FilePlus2 size={16} />
                <span>Create New Issue</span>
              </button>
            )}

            {isTester && (
              <Link to="/issues" className="btn btn-primary btn-sm">
                <Bug size={16} />
                <span>My Assigned Issues</span>
              </Link>
            )}

            {isAdmin && (
              <Link to="/admin" className="btn btn-primary btn-sm">
                <Shield size={16} />
                <span>Admin Panel</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Admin Global Summary Metric Cards (If Admin Role) */}
      {isAdmin && systemStats && (
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-info">
              <span className="metric-label">Total Users</span>
              <span className="metric-value">{systemStats.total_users}</span>
            </div>
            <div className="metric-icon-box metric-icon-purple">
              <Shield size={20} />
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-info">
              <span className="metric-label">Active Projects</span>
              <span className="metric-value">{systemStats.active_projects}</span>
            </div>
            <div className="metric-icon-box metric-icon-indigo">
              <FolderGit2 size={20} />
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-info">
              <span className="metric-label">Global Defects</span>
              <span className="metric-value">{systemStats.total_issues}</span>
            </div>
            <div className="metric-icon-box metric-icon-amber">
              <Bug size={20} />
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-info">
              <span className="metric-label">Critical / Blocker</span>
              <span className="metric-value" style={{ color: '#f87171' }}>{systemStats.critical_issues}</span>
            </div>
            <div className="metric-icon-box metric-icon-rose">
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>
      )}

      {/* STEP 3 C: Action Required Section (⚡ ACTION REQUIRED) */}
      {actionRequiredIssues.length > 0 && (
        <div
          className="card"
          style={{
            border: '1px solid rgba(245, 158, 11, 0.4)',
            backgroundColor: 'rgba(245, 158, 11, 0.05)',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={18} color="#f59e0b" />
              <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Action Required ({actionRequiredIssues.length})
              </h2>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Defects waiting for your verification & response
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {actionRequiredIssues.map((issue) => (
              <div
                key={issue.id}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--primary)', fontSize: '0.85rem' }}>
                      {issue.issue_key}
                    </span>
                    <StatusBadge status={issue.status} />
                  </div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
                    {issue.title}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {issue.status === 'RESOLVED'
                      ? 'The tester marked this defect resolved. Has the problem been verified on your end?'
                      : 'This defect was reopened and is awaiting renewed inspection.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  {issue.status === 'RESOLVED' && isUser && (
                    <>
                      <button
                        onClick={() => handleConfirmClose(issue.id)}
                        disabled={isActionSubmitting}
                        className="btn btn-primary btn-sm"
                        style={{ backgroundColor: '#10b981', borderColor: '#10b981', flex: '1', justifyContent: 'center' }}
                      >
                        <CheckCircle2 size={14} />
                        <span>Confirm Resolution</span>
                      </button>
                      <button
                        onClick={() => setReopenModalIssue(issue)}
                        disabled={isActionSubmitting}
                        className="btn btn-outline-danger btn-sm"
                        style={{ flex: '1', justifyContent: 'center' }}
                      >
                        <RotateCcw size={14} />
                        <span>Reopen Issue</span>
                      </button>
                    </>
                  )}
                  <Link
                    to={`/issues/${issue.id}`}
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'center' }}
                  >
                    <Eye size={14} />
                    <span>View Details</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3 B: Core Live Metrics Cards (All 9 Metrics) */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <span className="metric-label">{isUser ? 'My Submitted Issues' : 'Tracked Issues'}</span>
            <span className="metric-value">{totalIssueCount}</span>
          </div>
          <div className="metric-icon-box metric-icon-purple">
            <Bug size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="metric-label">Open Issues</span>
            <span className="metric-value" style={{ color: '#fbbf24' }}>{openIssuesCount}</span>
          </div>
          <div className="metric-icon-box metric-icon-amber">
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="metric-label">In Progress</span>
            <span className="metric-value">{inProgressCount}</span>
          </div>
          <div className="metric-icon-box metric-icon-indigo">
            <Activity size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="metric-label">Resolution Rate</span>
            <span className="metric-value" style={{ color: '#34d399' }}>
              {resolutionRate}%
            </span>
          </div>
          <div className="metric-icon-box metric-icon-emerald">
            <CheckCheck size={20} />
          </div>
        </div>
      </div>

      {/* STEP 3 B (cont.): Detailed 6-Status Metric Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div className="card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Awaiting Review</span>
          <span style={{ fontSize: '1.35rem', fontWeight: '700', color: '#fbbf24' }}>{awaitingReviewCount}</span>
        </div>

        <div className="card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Assigned to Tester</span>
          <span style={{ fontSize: '1.35rem', fontWeight: '700', color: '#818cf8' }}>{assignedToTesterCount}</span>
        </div>

        <div className="card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>In Progress</span>
          <span style={{ fontSize: '1.35rem', fontWeight: '700', color: '#38bdf8' }}>{inProgressCount}</span>
        </div>

        <div className="card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Resolved</span>
          <span style={{ fontSize: '1.35rem', fontWeight: '700', color: '#34d399' }}>{resolvedCount}</span>
        </div>

        <div className="card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Closed</span>
          <span style={{ fontSize: '1.35rem', fontWeight: '700', color: '#94a3b8' }}>{closedCount}</span>
        </div>

        <div className="card" style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Reopened</span>
          <span style={{ fontSize: '1.35rem', fontWeight: '700', color: '#f87171' }}>{reopenedCount}</span>
        </div>
      </div>

      {/* Multi-Card Analytics Row: Health Score, Issue Aging & Distribution Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* STEP 6: Deterministic Issue Health Score */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HeartPulse size={18} color={healthScoreInfo.color} />
                <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                  My Issue Health Score
                </span>
              </div>
              <span
                className="badge"
                style={{ backgroundColor: `${healthScoreInfo.color}22`, color: healthScoreInfo.color, fontWeight: '700' }}
              >
                {healthScoreInfo.status}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: '800', color: healthScoreInfo.color, lineHeight: 1 }}>
                {healthScoreInfo.score}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: '600' }}>/ 100</span>
            </div>

            <div style={{ height: '8px', backgroundColor: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
              <div
                style={{
                  height: '100%',
                  width: `${healthScoreInfo.score}%`,
                  backgroundColor: healthScoreInfo.color,
                  borderRadius: '4px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {healthScoreInfo.reasons.map((r, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.785rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: healthScoreInfo.color }} />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', margin: '1rem 0 0 0', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
            Deterministic score calculated from open critical issues, urgent defects, aging, and resolution rate.
          </p>
        </div>

        {/* STEP 5: Issue Aging Breakdown */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#818cf8" />
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Issue Aging Analysis
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {agingStats.totalOpen} Open Issues
            </span>
          </div>

          {agingStats.totalOpen === 0 ? (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <CheckCircle2 size={28} color="#34d399" style={{ margin: '0 auto 0.5rem' }} />
              <span>Zero open defects currently aging.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {agingStats.buckets.map((b) => (
                <div key={b.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.785rem', marginBottom: '0.2rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{b.label}</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {b.count} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({b.pct}%)</span>
                    </span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${b.pct}%`, backgroundColor: b.color, borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 4 A/B/C: Personal Analytics Overview (Status, Priority & Severity Distribution) */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <PieChart size={18} color="#818cf8" />
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Personal Distributions
              </span>
            </div>

            {totalIssueCount === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1.5rem 0', textAlign: 'center' }}>
                No issue distribution recorded yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Severity Breakdown */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                    Severity Distribution
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', textAlign: 'center' }}>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#f87171', display: 'block' }}>BLOCKER</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f87171' }}>{severityDist?.BLOCKER || 0}</span>
                    </div>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: '4px', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#fb923c', display: 'block' }}>CRITICAL</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fb923c' }}>{severityDist?.CRITICAL || 0}</span>
                    </div>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#facc15', display: 'block' }}>MAJOR</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#facc15' }}>{severityDist?.MAJOR || 0}</span>
                    </div>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#60a5fa', display: 'block' }}>MINOR</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#60a5fa' }}>{severityDist?.MINOR || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Priority Breakdown */}
                <div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                    Priority Distribution
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', textAlign: 'center' }}>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#f87171', display: 'block' }}>URGENT</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f87171' }}>{priorityDist?.URGENT || 0}</span>
                    </div>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: '4px', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#fb923c', display: 'block' }}>HIGH</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fb923c' }}>{priorityDist?.HIGH || 0}</span>
                    </div>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#facc15', display: 'block' }}>MEDIUM</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#facc15' }}>{priorityDist?.MEDIUM || 0}</span>
                    </div>
                    <div style={{ padding: '0.35rem', backgroundColor: 'rgba(148, 163, 184, 0.1)', borderRadius: '4px', border: '1px solid rgba(148, 163, 184, 0.3)' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>LOW</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#94a3b8' }}>{priorityDist?.LOW || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Tracked Projects:</span>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{myProjectsBreakdown.length}</span>
          </div>
        </div>
      </div>

      {/* Activity Trends Chart */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} color="#818cf8" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              My Defect Activity & Resolution Velocity
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {(['7d', '30d', '90d', 'all'] as TrendRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTrendRange(r)}
                style={{
                  padding: '0.2rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: trendRange === r ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                  color: trendRange === r ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: trendRange === r ? 'var(--primary)' : 'var(--border-subtle)',
                  cursor: 'pointer',
                }}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : r === '90d' ? '90 Days' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        {!trendData || trendData.items.length === 0 ? (
          <div style={{ padding: '2.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Not enough historical defect activity for this period.
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', backgroundColor: '#6366f1', borderRadius: '2px' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Reported:</span>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{trendData.total_created}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', backgroundColor: '#10b981', borderRadius: '2px' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Resolved:</span>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{trendData.total_resolved}</span>
              </div>
            </div>

            {/* Visual Bar Timeline */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '120px', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
              {trendData.items.slice(-14).map((item) => {
                const maxVal = Math.max(1, ...trendData.items.map((i) => Math.max(i.created_count, i.resolved_count)));
                const createdHeight = Math.round((item.created_count / maxVal) * 90);
                const resolvedHeight = Math.round((item.resolved_count / maxVal) * 90);

                return (
                  <div key={item.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '32px', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '90px' }}>
                      <div
                        style={{ width: '10px', height: `${Math.max(4, createdHeight)}px`, backgroundColor: '#6366f1', borderRadius: '2px 2px 0 0' }}
                        title={`${item.date}: ${item.created_count} reported`}
                      />
                      <div
                        style={{ width: '10px', height: `${Math.max(4, resolvedHeight)}px`, backgroundColor: '#10b981', borderRadius: '2px 2px 0 0' }}
                        title={`${item.date}: ${item.resolved_count} resolved`}
                      />
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem', whiteSpace: 'nowrap' }}>
                      {item.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* STEP 3 D & E: Needs Attention & Recent Issues Two-Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* STEP 3 D: Needs Attention */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <AlertTriangle size={18} color="#ef4444" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Needs Attention
            </h2>
          </div>

          {needsAttentionIssues.length === 0 ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <CheckCircle2 size={24} color="#34d399" style={{ margin: '0 auto 0.4rem' }} />
              <span>All critical issues and resolutions are in order.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {needsAttentionIssues.map((issue) => (
                <div
                  key={issue.id}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', fontSize: '0.8rem', color: 'var(--primary)' }}>
                        {issue.issue_key}
                      </span>
                      <SeverityBadge severity={issue.severity} />
                      <StatusBadge status={issue.status} />
                    </div>
                    <p style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {issue.title}
                    </p>
                  </div>

                  <Link to={`/issues/${issue.id}`} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                    <span>Inspect</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 3 E: 🔄 Recently Updated Issues */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Activity size={18} color="#818cf8" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              🔄 Recent Issues
            </h2>
          </div>

          {recentIssues.length === 0 ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No updated defect activity recorded.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {recentIssues.map((issue) => (
                <div
                  key={issue.id}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', fontSize: '0.8rem', color: 'var(--primary)' }}>
                        {issue.issue_key}
                      </span>
                      <StatusBadge status={issue.status} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {formatRelativeTime(issue.updated_at || issue.created_at)}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {issue.title}
                    </p>
                  </div>

                  <Link to={`/issues/${issue.id}`} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
                    <Eye size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* STEP 7: Main Defect Registry with Advanced Search, Filter Chips & Dense/Comfortable Table */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Bug size={18} color="#818cf8" />
            <h2 className="card-title">My Defect Registry ({filteredIssues.length})</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleExportIssuesPdf}
              className="btn btn-secondary btn-sm"
              title="Download Issues List PDF"
              disabled={filteredIssues.length === 0}
            >
              <FileDown size={14} />
              <span>Export Issues PDF</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="btn btn-secondary btn-sm"
              title="Download CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
            <Link to="/issues" className="btn btn-secondary btn-sm">
              <span>Full Issue Page</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        {/* STEP 7: Advanced Search & Multi-Filter Bar */}
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search issue key, title, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.85rem' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Project Filter */}
          {projects.length > 0 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="form-input"
              style={{ width: '160px', height: '36px', fontSize: '0.85rem' }}
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.project_key} — {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IssueStatus | 'ALL')}
            className="form-input"
            style={{ width: '140px', height: '36px', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="REPORTED">Reported</option>
            <option value="TRIAGED">Triaged</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_DEVELOPMENT">In Development</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="IN_TESTING">In Testing</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="REOPENED">Reopened</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | 'ALL')}
            className="form-input"
            style={{ width: '140px', height: '36px', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Severities</option>
            <option value="BLOCKER">Blocker</option>
            <option value="CRITICAL">Critical</option>
            <option value="MAJOR">Major</option>
            <option value="MINOR">Minor</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | 'ALL')}
            className="form-input"
            style={{ width: '130px', height: '36px', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* STEP 7: Quick Filter Chips */}
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            padding: '0.6rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto',
            backgroundColor: 'var(--bg-surface-elevated)',
          }}
        >
          {[
            { key: 'ALL', label: `All (${totalIssueCount})` },
            { key: 'OPEN', label: `Open (${openIssuesCount})` },
            { key: 'AWAITING_REVIEW', label: `Awaiting Review (${awaitingReviewCount})` },
            { key: 'ASSIGNED', label: `Assigned (${assignedToTesterCount})` },
            { key: 'IN_PROGRESS', label: `In Progress (${inProgressCount})` },
            { key: 'RESOLVED', label: `Resolved (${resolvedCount})` },
            { key: 'CLOSED', label: `Closed (${closedCount})` },
            { key: 'REOPENED', label: `Reopened (${reopenedCount})` },
            { key: 'HIGH_SEVERITY', label: `High Severity (${(severityDist?.CRITICAL || 0) + (severityDist?.BLOCKER || 0)})` },
            { key: 'URGENT', label: `Urgent (${priorityDist?.URGENT || 0})` },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => handleDefaultFilterChange(chip.key as FilterChip)}
              style={{
                padding: '0.25rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: selectedChip === chip.key ? 'var(--primary)' : 'var(--bg-surface)',
                color: selectedChip === chip.key ? '#fff' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: selectedChip === chip.key ? 'var(--primary)' : 'var(--border-subtle)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Table Content */}
        <div className="card-body" style={{ padding: 0 }}>
          {filteredIssues.length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <FilePlus2 size={32} color="#818cf8" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.4rem', fontSize: '1rem' }}>
                {totalIssueCount === 0 ? 'No issues reported yet.' : 'No issues match your current filters.'}
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                {totalIssueCount === 0
                  ? 'Found a defect in any application? Report your first defect to get started.'
                  : 'Try clearing your search query or resetting your filter chips.'}
              </p>
              {totalIssueCount === 0 ? (
                <button className="btn btn-primary" onClick={() => navigate('/issues?create=true')} style={{ margin: '0 auto' }}>
                  <FilePlus2 size={16} />
                  <span>Report Your First Defect</span>
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSelectedChip('ALL');
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setSeverityFilter('ALL');
                    setPriorityFilter('ALL');
                    setProjectFilter('ALL');
                  }}
                  style={{ margin: '0 auto' }}
                >
                  <span>Reset All Filters</span>
                </button>
              )}
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table" style={{ fontSize: density === 'compact' ? '0.8rem' : '0.875rem' }}>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Defect Title</th>
                    <th>Project</th>
                    <th>Severity</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Updated Date</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((issue) => {
                    const proj = projectMap.get(issue.project_id);
                    return (
                      <tr key={issue.id} style={{ height: density === 'compact' ? '40px' : '52px' }}>
                        <td>
                          <Link
                            to={`/issues/${issue.id}`}
                            style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--primary)' }}
                          >
                            {issue.issue_key}
                          </Link>
                        </td>
                        <td style={{ maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Link
                            to={`/issues/${issue.id}`}
                            style={{ color: 'var(--text-primary)', fontWeight: '500' }}
                            title={issue.title}
                          >
                            {issue.title}
                          </Link>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {proj ? proj.project_key : `#${issue.project_id}`}
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
                          {formatDate(issue.updated_at || issue.created_at)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/issues/${issue.id}`}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: density === 'compact' ? '0.2rem 0.4rem' : '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            <span>Open</span>
                            <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* STEP 4 D: Scoped Project Breakdown (📁 MY PROJECTS) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderGit2 size={18} color="#34d399" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              📁 Project Breakdown
            </h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing projects where you have reported defects
          </span>
        </div>

        {myProjectsBreakdown.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
            No project defect history recorded yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {myProjectsBreakdown.map((proj) => (
              <div
                key={proj.project_id}
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        color: '#818cf8',
                        backgroundColor: 'var(--primary-subtle)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      {proj.project_key}
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#34d399' }}>
                      {proj.resolution_rate.toFixed(0)}% Resolved
                    </span>
                  </div>

                  <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
                    {proj.project_name}
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', textAlign: 'center', fontSize: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Total</span>
                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{proj.total_issues}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Open</span>
                    <span style={{ fontWeight: '700', color: '#fbbf24' }}>{proj.open_issues}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Resolved</span>
                    <span style={{ fontWeight: '700', color: '#34d399' }}>{proj.resolved_issues}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Closed</span>
                    <span style={{ fontWeight: '700', color: '#818cf8' }}>{proj.closed_issues}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STEP 3 C: Reopen Issue Modal */}
      {reopenModalIssue && (
        <Modal
          isOpen={true}
          onClose={() => {
            setReopenModalIssue(null);
            setReopenReason('');
          }}
          title={`Reopen Defect: ${reopenModalIssue.issue_key}`}
        >
          <form onSubmit={handleReopenSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Please provide feedback on why this issue remains unresolved or what additional steps are needed.
              </p>
              <textarea
                className="form-input"
                rows={4}
                required
                placeholder="Explain what behavior is still broken..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setReopenModalIssue(null);
                  setReopenReason('');
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isActionSubmitting || !reopenReason.trim()}
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                {isActionSubmitting ? 'Reopening...' : 'Confirm Reopen'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
