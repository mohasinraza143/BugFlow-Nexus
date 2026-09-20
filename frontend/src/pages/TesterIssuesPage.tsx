import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpDown,
  Bug,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { getApiErrorMessage } from '../api/client';
import { issuesApi } from '../api/issues';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { PriorityBadge } from '../components/common/PriorityBadge';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import type { Issue, IssueStatus, Priority, Severity } from '../types/issue';
import { formatDate, formatRelativeTime } from '../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const TESTER_VALID_TRANSITIONS: Record<string, string[]> = {
  REPORTED: ['IN_DEVELOPMENT'],
  TRIAGED: ['IN_DEVELOPMENT'],
  ASSIGNED: ['IN_DEVELOPMENT'],
  IN_DEVELOPMENT: ['IN_REVIEW'],
  IN_REVIEW: ['IN_TESTING', 'IN_DEVELOPMENT'],
  REOPENED: ['IN_DEVELOPMENT'],
};

const RESOLVABLE_STATUSES = new Set(['IN_REVIEW', 'IN_TESTING', 'IN_DEVELOPMENT', 'ASSIGNED']);
const REOPENABLE_STATUSES = new Set(['RESOLVED', 'CLOSED', 'IN_TESTING']);

function getNextStatus(current: string): string | null {
  const t = TESTER_VALID_TRANSITIONS[current];
  if (!t || t.length === 0) return null;
  if (current === 'IN_REVIEW') return 'IN_TESTING';
  return t[0];
}

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
      return 'Advance';
  }
}



const PRIORITY_OPTIONS: Array<{ value: Priority | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All Priorities' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const SEVERITY_OPTIONS: Array<{ value: Severity | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All Severities' },
  { value: 'BLOCKER', label: 'Blocker' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
];

type SortField = 'created_at' | 'updated_at' | 'priority' | 'severity' | 'status';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};
const SEVERITY_ORDER: Record<string, number> = {
  BLOCKER: 4, CRITICAL: 3, MAJOR: 2, MINOR: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Select helper
// ─────────────────────────────────────────────────────────────────────────────

const FilterSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      padding: '0.4rem 0.7rem',
      fontSize: '0.82rem',
      background: 'var(--bg-input)',
      border: '1px solid var(--border-muted)',
      borderRadius: 'var(--radius-sm)',
      color: 'var(--text-primary)',
      cursor: 'pointer',
      minWidth: '130px',
    }}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const TesterIssuesPage: React.FC = () => {
  const { user } = useAuth();
  // ── Data state ──
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [totalFromServer, setTotalFromServer] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filter / sort state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  // ── Inline action state ──
  const [transitioning, setTransitioning] = useState<number | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // ─────────────────────────────────────────────────────────────────
  // Load assigned issues
  // ─────────────────────────────────────────────────────────────────

  const loadIssues = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      // Fetch all assigned issues to allow client-side filtering/sorting
      const res = await issuesApi.list({ page_size: 100 });
      setAllIssues(res.items || []);
      setTotalFromServer(res.total || 0);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, priorityFilter, severityFilter, sortField, sortDir]);

  // ─────────────────────────────────────────────────────────────────
  // Filter + Sort + Paginate (client-side)
  // ─────────────────────────────────────────────────────────────────

  const filteredSorted = useMemo(() => {
    let list = [...allIssues];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.issue_key.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      list = list.filter((i) => i.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'ALL') {
      list = list.filter((i) => i.priority === priorityFilter);
    }

    // Severity filter
    if (severityFilter !== 'ALL') {
      list = list.filter((i) => i.severity === severityFilter);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          cmp =
            new Date(a.updated_at || a.created_at).getTime() -
            new Date(b.updated_at || b.created_at).getTime();
          break;
        case 'priority':
          cmp = (PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0);
          break;
        case 'severity':
          cmp = (SEVERITY_ORDER[a.severity] ?? 0) - (SEVERITY_ORDER[b.severity] ?? 0);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [allIssues, searchQuery, statusFilter, priorityFilter, severityFilter, sortField, sortDir]);

  const totalFiltered = filteredSorted.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginated = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─────────────────────────────────────────────────────────────────
  // Sort toggle
  // ─────────────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Workflow quick action
  // ─────────────────────────────────────────────────────────────────

  const handleAdvanceStatus = async (issue: Issue) => {
    const next = getNextStatus(issue.status);
    if (!next) return;
    setTransitioning(issue.id);
    setActionError(null);
    try {
      await issuesApi.updateStatus(issue.id, { status: next as IssueStatus });
      window.dispatchEvent(new Event('issue:status-updated'));
      setActionSuccess(`${issue.issue_key} → ${next.replace(/_/g, ' ')}`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadIssues(true);
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err));
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setTransitioning(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Derived counts for filter chips
  // ─────────────────────────────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    allIssues.forEach((i) => {
      map[i.status] = (map[i.status] || 0) + 1;
    });
    return map;
  }, [allIssues]);

  const hasActiveFilters =
    statusFilter !== 'ALL' || priorityFilter !== 'ALL' || severityFilter !== 'ALL' || searchQuery.trim() !== '';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setSeverityFilter('ALL');
  };

  // ─────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 0' }}>
        <LoadingSpinner message="Fetching your assigned issues…" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={() => loadIssues()} />;
  }

  // ─────────────────────────────────────────────────────────────────
  // Sortable column header
  // ─────────────────────────────────────────────────────────────────

  const SortTh: React.FC<{ field: SortField; label: string }> = ({ field, label }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        textAlign: 'left',
        padding: '0.5rem 0.75rem',
        color: sortField === field ? 'var(--primary)' : 'var(--text-muted)',
        fontWeight: '600',
        fontSize: '0.75rem',
        borderBottom: '1px solid var(--border-subtle)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        {label}
        <ArrowUpDown
          size={11}
          style={{ opacity: sortField === field ? 1 : 0.4 }}
          color={sortField === field ? 'var(--primary)' : undefined}
        />
        {sortField === field && (
          <span style={{ fontSize: '0.7rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  const StaticTh: React.FC<{ label: string }> = ({ label }) => (
    <th
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
      {label}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Toast messages ── */}
      {actionSuccess && (
        <div
          style={{
            backgroundColor: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.35)',
            color: '#34d399',
            padding: '0.65rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <CheckCheck size={15} />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div
          style={{
            backgroundColor: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: '#f87171',
            padding: '0.65rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <AlertCircle size={15} />
          {actionError}
        </div>
      )}

      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.4rem',
              fontWeight: '700',
              color: 'var(--text-primary)',
              margin: '0 0 0.2rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Bug size={22} color="#818cf8" />
            My Assigned Issues
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            {user?.full_name} · {totalFromServer} total assigned
            {isRefreshing && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--primary)' }}>↻ refreshing…</span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => loadIssues(true)}
            disabled={isRefreshing}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <Link to="/tester-dashboard" className="btn btn-secondary btn-sm">
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* ── Quick Status Chip Filter ── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {([
          { label: 'All', value: 'ALL' },
          { label: 'Assigned', value: 'ASSIGNED' },
          { label: 'In Progress', value: 'IN_DEVELOPMENT' },
          { label: 'In Review', value: 'IN_REVIEW' },
          { label: 'In Testing', value: 'IN_TESTING' },
          { label: 'Resolved', value: 'RESOLVED' },
          { label: 'Reopened', value: 'REOPENED' },
        ] as Array<{ label: string; value: IssueStatus | 'ALL' }>).map((chip) => {
          const count = chip.value === 'ALL' ? allIssues.length : (statusCounts[chip.value] ?? 0);
          const isActive = statusFilter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-muted)'}`,
                backgroundColor: isActive ? 'var(--primary-subtle)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: isActive ? '600' : '400',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {chip.label}
              {count > 0 && (
                <span
                  style={{
                    backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.68rem',
                    padding: '0.05rem 0.35rem',
                    fontWeight: '600',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search + Advanced Filters ── */}
      <div className="card" style={{ padding: '1rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '0.65rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '320px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search by key or title…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '2.1rem',
                paddingRight: '0.75rem',
                paddingTop: '0.45rem',
                paddingBottom: '0.45rem',
                fontSize: '0.85rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Toggle advanced filters */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="btn btn-secondary btn-sm"
          >
            <Filter size={14} />
            <span>{showFilters ? 'Hide Filters' : 'More Filters'}</span>
            {hasActiveFilters && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  display: 'inline-block',
                }}
              />
            )}
          </button>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn btn-secondary btn-sm">
              <X size={13} />
              <span>Clear</span>
            </button>
          )}

          <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {totalFiltered} issue{totalFiltered !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Advanced filter dropdowns */}
        {showFilters && (
          <div
            style={{
              display: 'flex',
              gap: '0.65rem',
              marginTop: '0.85rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <FilterSelect
              value={priorityFilter}
              onChange={(v) => setPriorityFilter(v as Priority | 'ALL')}
              options={PRIORITY_OPTIONS}
            />
            <FilterSelect
              value={severityFilter}
              onChange={(v) => setSeverityFilter(v as Severity | 'ALL')}
              options={SEVERITY_OPTIONS}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Sort by:
              <FilterSelect
                value={sortField}
                onChange={(v) => setSortField(v as SortField)}
                options={[
                  { value: 'updated_at', label: 'Last Updated' },
                  { value: 'created_at', label: 'Created Date' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'severity', label: 'Severity' },
                  { value: 'status', label: 'Status' },
                ]}
              />
              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.35rem 0.55rem' }}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Issue Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {paginated.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--text-muted)',
            }}
          >
            <Bug size={40} style={{ opacity: 0.25, marginBottom: '0.85rem' }} />
            <p style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.3rem' }}>
              {hasActiveFilters ? 'No issues match your filters.' : 'No issues assigned to you yet.'}
            </p>
            <p style={{ fontSize: '0.82rem' }}>
              {hasActiveFilters
                ? 'Try adjusting or clearing your filters.'
                : 'Issues will appear here when an admin assigns them to you.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '0.75rem' }}
              >
                Clear Filters
              </button>
            )}
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
                <tr style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                  <StaticTh label="Issue Key" />
                  <StaticTh label="Title" />
                  <SortTh field="priority" label="Priority" />
                  <SortTh field="severity" label="Severity" />
                  <SortTh field="status" label="Status" />
                  <StaticTh label="Reporter" />
                  <SortTh field="created_at" label="Created" />
                  <SortTh field="updated_at" label="Updated" />
                  <StaticTh label="Actions" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((issue) => {
                  const nextStatus = getNextStatus(issue.status);
                  const canAdvance = !!nextStatus;
                  const canResolve = RESOLVABLE_STATUSES.has(issue.status) && !canAdvance;
                  const canReopen = REOPENABLE_STATUSES.has(issue.status);
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
                      <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
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
                          padding: '0.7rem 0.75rem',
                          maxWidth: '240px',
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
                      <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <PriorityBadge priority={issue.priority} />
                      </td>

                      {/* Severity */}
                      <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <SeverityBadge severity={issue.severity} />
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <StatusBadge status={issue.status} />
                      </td>

                      {/* Reporter */}
                      <td
                        style={{
                          padding: '0.7rem 0.75rem',
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                          maxWidth: '130px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        #{issue.reporter_id}
                      </td>

                      {/* Created */}
                      <td
                        style={{
                          padding: '0.7rem 0.75rem',
                          color: 'var(--text-muted)',
                          fontSize: '0.78rem',
                          whiteSpace: 'nowrap',
                        }}
                        title={formatDate(issue.created_at)}
                      >
                        {formatRelativeTime(issue.created_at)}
                      </td>

                      {/* Updated */}
                      <td
                        style={{
                          padding: '0.7rem 0.75rem',
                          color: 'var(--text-muted)',
                          fontSize: '0.78rem',
                          whiteSpace: 'nowrap',
                        }}
                        title={formatDate(issue.updated_at || issue.created_at)}
                      >
                        {formatRelativeTime(issue.updated_at || issue.created_at)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          {/* Advance status */}
                          {canAdvance && (
                            <button
                              onClick={() => handleAdvanceStatus(issue)}
                              disabled={isTransitioning}
                              className="btn btn-primary btn-sm"
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.25rem 0.55rem',
                              }}
                              title={getWorkflowLabel(issue.status)}
                            >
                              <Play size={10} />
                              <span>{isTransitioning ? '…' : getWorkflowLabel(issue.status)}</span>
                            </button>
                          )}

                          {/* Resolve (direct) */}
                          {canResolve && (
                            <Link
                              to={`/issues/${issue.id}`}
                              className="btn btn-primary btn-sm"
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.25rem 0.55rem',
                                backgroundColor: '#10b981',
                                borderColor: '#10b981',
                              }}
                              title="Resolve issue"
                            >
                              <CheckCheck size={10} />
                              <span>Resolve</span>
                            </Link>
                          )}

                          {/* Reopen link */}
                          {canReopen && (
                            <Link
                              to={`/issues/${issue.id}`}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.25rem 0.55rem',
                              }}
                              title="Reopen issue"
                            >
                              <RotateCcw size={10} />
                              <span>Reopen</span>
                            </Link>
                          )}

                          {/* View details */}
                          <Link
                            to={`/issues/${issue.id}`}
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: '0.72rem',
                              padding: '0.25rem 0.45rem',
                            }}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1.25rem',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} · {totalFiltered} issues
            </span>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.3rem 0.55rem' }}
              >
                <ChevronLeft size={15} />
              </button>

              {/* Page number buttons (show up to 5) */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, page - 2);
                const pageNum = start + i;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={pageNum === page ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ padding: '0.3rem 0.6rem', minWidth: '32px' }}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.3rem 0.55rem' }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Summary footer ── */}
      {allIssues.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
            flexWrap: 'wrap',
            padding: '0.85rem 1.1rem',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>{totalFromServer}</strong> total assigned
          </span>
          <span>
            <strong style={{ color: '#fbbf24' }}>
              {allIssues.filter((i) => ['ASSIGNED', 'IN_DEVELOPMENT', 'IN_REVIEW', 'IN_TESTING', 'REOPENED'].includes(i.status)).length}
            </strong>{' '}
            active
          </span>
          <span>
            <strong style={{ color: '#34d399' }}>
              {allIssues.filter((i) => i.status === 'RESOLVED').length}
            </strong>{' '}
            resolved
          </span>
          <span>
            <strong style={{ color: '#f87171' }}>
              {allIssues.filter((i) => i.status === 'REOPENED').length}
            </strong>{' '}
            reopened
          </span>
        </div>
      )}
    </div>
  );
};
