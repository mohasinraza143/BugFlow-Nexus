import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Calendar,
  Edit2,
  PowerOff,
} from 'lucide-react';
import { getApiErrorMessage } from '../api/client';
import { projectsApi } from '../api/projects';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../hooks/useAuth';
import type { Project, ProjectCreate, ProjectStatus, ProjectUpdate } from '../types/project';
import { formatDate } from '../utils/formatters';

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Form states
  const [formName, setFormName] = useState<string>('');
  const [formKey, setFormKey] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await projectsApi.list({
        page,
        page_size: 12,
        status: statusFilter ? statusFilter : undefined,
      });
      setProjects(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [page, statusFilter]);

  const openCreateModal = () => {
    setFormName('');
    setFormKey('');
    setFormDesc('');
    setFormStatus('ACTIVE');
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (project: Project) => {
    setSelectedProject(project);
    setFormName(project.name);
    setFormDesc(project.description || '');
    setFormStatus(project.status);
    setFormError(null);
    setIsEditOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formKey.trim()) {
      setFormError('Project name and key are required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: ProjectCreate = {
        name: formName.trim(),
        project_key: formKey.trim().toUpperCase(),
        description: formDesc.trim() || null,
        status: formStatus,
      };
      await projectsApi.create(payload);
      setIsCreateOpen(false);
      fetchProjects();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    if (!formName.trim()) {
      setFormError('Project name is required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: ProjectUpdate = {
        name: formName.trim(),
        description: formDesc.trim() || null,
        status: formStatus,
      };
      await projectsApi.update(selectedProject.id, payload);
      setIsEditOpen(false);
      fetchProjects();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (project: Project) => {
    if (!window.confirm(`Are you sure you want to deactivate project "${project.name}"?`)) {
      return;
    }
    try {
      await projectsApi.deactivate(project.id);
      fetchProjects();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.project_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">
            Manage software projects and defect tracking scopes
          </p>
        </div>

        {isAdmin && (
          <button onClick={openCreateModal} className="btn btn-primary">
            <Plus size={16} />
            Create Project
          </button>
        )}
      </div>

      {error && <ErrorMessage message={error} onRetry={fetchProjects} />}

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '400px' }}>
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search projects by key or name..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '150px' }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ProjectStatus | '');
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <LoadingSpinner message="Loading projects..." />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          title="No projects found"
          description={
            searchQuery
              ? 'No projects match your search query.'
              : 'There are currently no projects configured in the system.'
          }
          action={
            isAdmin ? (
              <button onClick={openCreateModal} className="btn btn-primary btn-sm">
                <Plus size={14} />
                Create First Project
              </button>
            ) : undefined
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.75rem',
          }}
        >
          {filteredProjects.map((project) => (
            <div key={project.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--primary-subtle)',
                      color: '#818cf8',
                    }}
                  >
                    {project.project_key}
                  </div>
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '160px',
                    }}
                    title={project.name}
                  >
                    {project.name}
                  </h3>
                </div>

                <span
                  className="badge"
                  style={{
                    backgroundColor:
                      project.status === 'ACTIVE'
                        ? 'var(--success-subtle)'
                        : 'rgba(100, 116, 139, 0.2)',
                    color: project.status === 'ACTIVE' ? '#34d399' : '#94a3b8',
                  }}
                >
                  {project.status === 'ACTIVE' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                  {project.status}
                </span>
              </div>

              <div className="card-body" style={{ flex: 1, padding: '1.25rem' }}>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    minHeight: '44px',
                    lineHeight: '1.45',
                  }}
                >
                  {project.description || 'No description provided.'}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '1rem',
                  }}
                >
                  <Calendar size={12} />
                  <span>Created {formatDate(project.created_at)}</span>
                </div>
              </div>

              {isAdmin && (
                <div
                  className="card-footer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                    padding: '0.75rem 1.25rem',
                  }}
                >
                  <button
                    onClick={() => openEditModal(project)}
                    className="btn btn-secondary btn-sm"
                    title="Edit Project"
                  >
                    <Edit2 size={13} />
                    Edit
                  </button>

                  {project.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleDeactivate(project)}
                      className="btn btn-outline-danger btn-sm"
                      title="Deactivate Project"
                    >
                      <PowerOff size={13} />
                      Deactivate
                    </button>
                  )}
                </div>
              )}
              
              <div
                className="card-footer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '1rem',
                  padding: '0.75rem 1.25rem',
                  borderTop: isAdmin ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                <Link to={`/projects/${project.id}/sprints`} className="text-primary text-sm font-medium hover:underline">
                  Sprints
                </Link>
                <Link to={`/projects/${project.id}/backlog`} className="text-primary text-sm font-medium hover:underline">
                  Backlog
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
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

      {/* Create Project Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Project"
      >
        {formError && (
          <div className="alert-box alert-danger">
            <span>{formError}</span>
          </div>
        )}
        <form onSubmit={handleCreateSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="proj-key">
              Project Key (Uppercase, e.g. PROJ, CORE) *
            </label>
            <input
              id="proj-key"
              type="text"
              required
              maxLength={20}
              placeholder="e.g. CORE"
              className="form-input"
              style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              value={formKey}
              onChange={(e) => setFormKey(e.target.value.toUpperCase())}
            />
            <span className="form-help">2-20 characters: uppercase letters, numbers, hyphens.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="proj-name">
              Project Name *
            </label>
            <input
              id="proj-name"
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Core Banking Platform"
              className="form-input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="proj-desc">
              Description
            </label>
            <textarea
              id="proj-desc"
              className="form-textarea"
              placeholder="Detailed description of the project..."
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="proj-status">
              Initial Status
            </label>
            <select
              id="proj-status"
              className="form-select"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as ProjectStatus)}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit Project: ${selectedProject?.project_key}`}
      >
        {formError && (
          <div className="alert-box alert-danger">
            <span>{formError}</span>
          </div>
        )}
        <form onSubmit={handleEditSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-name">
              Project Name *
            </label>
            <input
              id="edit-name"
              type="text"
              required
              className="form-input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-desc">
              Description
            </label>
            <textarea
              id="edit-desc"
              className="form-textarea"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-status">
              Status
            </label>
            <select
              id="edit-status"
              className="form-select"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as ProjectStatus)}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
