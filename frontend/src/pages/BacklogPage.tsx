import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { issuesApi } from '../api/issues';
import { SprintService } from '../services/SprintService';
import type { Issue } from '../types/issue';
import type { Sprint } from '../types/Sprint';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';
import { getApiErrorMessage } from '../api/client';
import { Modal } from '../components/common/Modal';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { Search } from 'lucide-react';

export const BacklogPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [issues, setIssues] = useState<Issue[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting and Filtering
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recommended');
  const [sortDesc, setSortDesc] = useState(true);

  // Bulk Operations
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<number>>(new Set());
  
  // Assign Modal
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<number | ''>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [issuesData, sprintsData] = await Promise.all([
        issuesApi.list({ 
          project_id: projectId, 
          backlog: true, 
          page_size: 100,
          search: search.length >= 3 ? search : undefined,
          sort_by: sortBy,
          sort_desc: sortDesc
        }),
        SprintService.getSprintsByProject(projectId)
      ]);
      setIssues(issuesData.items);
      setSprints(sprintsData.filter(s => s.status !== 'COMPLETED'));
      
      // Clear selection that is no longer visible
      const visibleIds = new Set(issuesData.items.map(i => i.id));
      setSelectedIssueIds(prev => {
        const next = new Set<number>();
        prev.forEach(id => {
          if (visibleIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId, sortBy, sortDesc]); // don't add search yet to avoid debouncing issues

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const toggleSelectAll = () => {
    if (selectedIssueIds.size === issues.length) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(issues.map(i => i.id)));
    }
  };

  const toggleIssue = (id: number) => {
    const next = new Set(selectedIssueIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIssueIds(next);
  };

  const handleBulkAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIssueIds.size === 0 || !selectedSprintId) return;

    setIsAssigning(true);
    setAssignError(null);
    try {
      await issuesApi.bulkAssignSprint({
        issue_ids: Array.from(selectedIssueIds),
        sprint_id: Number(selectedSprintId)
      });
      setIsAssignOpen(false);
      fetchData(); // Refresh list
    } catch (err) {
      setAssignError(getApiErrorMessage(err));
    } finally {
      setIsAssigning(false);
    }
  };

  if (isLoading && issues.length === 0) return <LoadingSpinner message="Loading backlog..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Project Backlog</h1>
          <p className="page-subtitle">Manage, prioritize, and assign unassigned issues to sprints.</p>
        </div>
        {isAdmin && selectedIssueIds.size > 0 && (
          <button className="btn btn-primary" onClick={() => setIsAssignOpen(true)}>
            Assign {selectedIssueIds.size} Issues to Sprint
          </button>
        )}
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flex: 1, gap: '0.5rem' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Search backlog (min 3 chars)..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">
            <Search size={16} /> Search
          </button>
        </form>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sort by:</label>
          <select 
            className="form-select" 
            style={{ width: 'auto' }}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setSortDesc(true);
            }}
          >
            <option value="recommended">Recommended (Priority & Age)</option>
            <option value="created_at">Age (Newest)</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {issues.length === 0 ? (
        <EmptyState 
          title="Backlog is empty" 
          description="There are no unassigned issues in the backlog for this project matching your criteria." 
        />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIssueIds.size === issues.length && issues.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th>Key</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Effort</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {issues.map(issue => (
                <tr key={issue.id} className={selectedIssueIds.has(issue.id) ? 'selected-row' : ''}>
                  {isAdmin && (
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedIssueIds.has(issue.id)}
                        onChange={() => toggleIssue(issue.id)}
                      />
                    </td>
                  )}
                  <td>
                    <Link to={`/issues/${issue.id}`} className="text-primary font-mono font-bold">
                      {issue.issue_key}
                    </Link>
                  </td>
                  <td>{issue.title}</td>
                  <td><StatusBadge status={issue.status} /></td>
                  <td>{issue.priority}</td>
                  <td>
                    {issue.estimated_effort ? (
                      <span style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {issue.estimated_effort} pts
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                    )}
                  </td>
                  <td>
                    {new Date(issue.created_at).toLocaleDateString()}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {Math.floor((Date.now() - new Date(issue.created_at).getTime()) / (1000 * 3600 * 24))} days ago
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Assign Modal */}
      <Modal isOpen={isAssignOpen} onClose={() => setIsAssignOpen(false)} title="Assign to Sprint">
        {assignError && <div className="alert-box alert-danger">{assignError}</div>}
        <form onSubmit={handleBulkAssignSubmit}>
          <div className="form-group">
            <label className="form-label">Selected Issues</label>
            <p>{selectedIssueIds.size} issues selected.</p>
          </div>
          <div className="form-group">
            <label className="form-label">Sprint</label>
            <select
              className="form-select"
              value={selectedSprintId}
              onChange={(e) => setSelectedSprintId(Number(e.target.value))}
              required
            >
              <option value="" disabled>Select a sprint</option>
              {sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAssignOpen(false)} disabled={isAssigning}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isAssigning || !selectedSprintId}>
              {isAssigning ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
