import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { attachmentsApi } from '../api/attachments';
import { analyticsApi } from '../api/analytics';
import { getApiErrorMessage } from '../api/client';
import { issuesApi } from '../api/issues';
import { projectsApi } from '../api/projects';
import { useAuth } from '../hooks/useAuth';
import type { IssueCreate, IssueType, Priority, Severity } from '../types/issue';
import type { Project } from '../types/project';

export const CreateIssuePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isUser = user?.role === 'USER';

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // Form state
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

  // Smart Priority Calculator
  const [isCalcLoading, setIsCalcLoading] = useState(false);
  const [calcHint, setCalcHint] = useState<string | null>(null);

  const handleSmartCalculate = async () => {
    setIsCalcLoading(true);
    setCalcHint(null);
    try {
      const res = await analyticsApi.calculatePriority({
        severity: formSeverity,
        category: formType === 'BUG' ? 'Backend'
          : formType === 'FEATURE_REQUEST' ? 'UI'
          : formType === 'TECHNICAL_DEBT' ? 'API'
          : 'Backend',
      });
      setFormPriority(res.priority as Priority);
      setCalcHint(`⚡ Smart: ${res.priority} (score: ${res.priority_score}, ${res.severity_weight}×${res.category_urgency_weight})`);
    } catch {
      setCalcHint('Could not calculate — using manual selection.');
    } finally {
      setIsCalcLoading(false);
    }
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await projectsApi.list({ page_size: 100, status: 'ACTIVE' });
        setProjects(data.items);
        if (data.items.length > 0) {
          const requestedProjectId = Number(searchParams.get('project_id'));
          const requestedProjectExists = data.items.some((project) => project.id === requestedProjectId);
          setFormProjectId(requestedProjectExists ? requestedProjectId : data.items[0].id);
        }
      } catch (err) {
        setFormError(getApiErrorMessage(err));
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [searchParams]);

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

      setSuccessMsg(`Issue submitted successfully! Your issue has been logged and is now under review.`);
      
      // Redirect after a short delay so the user sees the success message
      setTimeout(() => {
        navigate('/issues');
      }, 2000);
      
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">
            {isUser ? 'Create New Issue' : 'Report New Defect'}
          </h1>
          <p className="page-subtitle">
            Provide details about the issue or defect you encountered.
          </p>
        </div>
      </div>

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
        </div>
      )}

      {formError && (
        <div className="alert-box alert-danger" style={{ marginBottom: '1rem' }}>
          <span>{formError}</span>
        </div>
      )}

      <div className="card" style={{ padding: '2rem' }}>
        <form onSubmit={handleReportSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="rep-proj">Project *</label>
            <select
              id="rep-proj"
              required
              className="form-select"
              value={formProjectId}
              onChange={(e) => setFormProjectId(Number(e.target.value))}
              disabled={isLoadingProjects || isSubmitting}
            >
              {projects.length === 0 && !isLoadingProjects && (
                <option value="">No projects available</option>
              )}
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
              disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                <option value="MINOR">MINOR</option>
                <option value="MAJOR">MAJOR</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="BLOCKER">BLOCKER</option>
              </select>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <label className="form-label" htmlFor="rep-prio" style={{ margin: 0 }}>Priority</label>
                <button
                  type="button"
                  onClick={handleSmartCalculate}
                  disabled={isCalcLoading || isSubmitting}
                  className="btn btn-sm"
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', backgroundColor: '#fbbf2420', color: '#fbbf24', border: '1px solid #fbbf2440', borderRadius: '6px' }}
                  title="Auto-fill priority using Smart Priority Calculator"
                >
                  {isCalcLoading ? '...' : '⚡ Smart Calculate'}
                </button>
              </div>
              <select
                id="rep-prio"
                className="form-select"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as Priority)}
                disabled={isSubmitting}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
              {calcHint && (
                <span style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: '0.25rem', display: 'block' }}>{calcHint}</span>
              )}
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
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-desc">Description *</label>
            <textarea
              id="rep-desc"
              required
              minLength={10}
              className="form-textarea"
              style={{ minHeight: '120px' }}
              placeholder="Detailed description of what occurred..."
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rep-steps">Steps to Reproduce</label>
            <textarea
              id="rep-steps"
              className="form-textarea"
              style={{ minHeight: '100px' }}
              placeholder="1. Navigate to...\n2. Click on...\n3. Observe error..."
              value={formSteps}
              onChange={(e) => setFormSteps(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="rep-exp">Expected Result</label>
              <textarea
                id="rep-exp"
                className="form-textarea"
                style={{ minHeight: '100px' }}
                placeholder="What was expected to happen..."
                value={formExpected}
                onChange={(e) => setFormExpected(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rep-act">Actual Result</label>
              <textarea
                id="rep-act"
                className="form-textarea"
                style={{ minHeight: '100px' }}
                placeholder="What actually happened..."
                value={formActual}
                onChange={(e) => setFormActual(e.target.value)}
                disabled={isSubmitting}
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
              disabled={isSubmitting}
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
              onClick={() => navigate(-1)}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
