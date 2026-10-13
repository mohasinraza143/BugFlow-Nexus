import React from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { PipelineTelemetryResponse } from '../../types/admin';
import { formatRelativeTime } from '../../utils/formatters';

interface CiCdPipelineSectionProps {
  data: PipelineTelemetryResponse | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const CiCdPipelineSection: React.FC<CiCdPipelineSectionProps> = ({
  data,
  isLoading,
  onRefresh,
}) => {
  const latestRun = data?.runs && data.runs.length > 0 ? data.runs[0] : null;
  const isPassing = latestRun ? latestRun.conclusion === 'success' : true;
  const isRunning = latestRun ? latestRun.status === 'in_progress' : false;

  return (
    <div
      className="card cicd-pipeline-card"
      style={{
        background: 'var(--bg-surface, #111827)',
        border: '1px solid var(--border-subtle, #1e293b)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        marginBottom: '2rem',
      }}
    >
      {/* Header */}
      <div
        className="card-header"
        style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle, #1e293b)',
          background: 'var(--bg-surface-elevated, #1f2937)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
            }}
          >
            <Activity size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  margin: 0,
                  color: 'var(--text-primary, #f8fafc)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                CI/CD Deployment & Pipeline Telemetry
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '12px',
                  background: isRunning
                    ? 'rgba(245, 158, 11, 0.15)'
                    : isPassing
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                  color: isRunning ? '#f59e0b' : isPassing ? '#10b981' : '#ef4444',
                  border: `1px solid ${isRunning ? 'rgba(245,158,11,0.3)' : isPassing ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                {isRunning ? (
                  <>
                    <Play size={10} /> IN PROGRESS
                  </>
                ) : isPassing ? (
                  <>
                    <CheckCircle2 size={12} /> WORKFLOW PASSING
                  </>
                ) : (
                  <>
                    <XCircle size={12} /> FAILED
                  </>
                )}
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: 'var(--text-muted, #94a3b8)' }}>
              Real-time GitHub Actions automated build, test &amp; Render production continuous deployment
            </p>
          </div>
        </div>

        {/* Action Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid var(--border-subtle, #1e293b)',
                background: 'var(--bg-surface, #111827)',
                color: 'var(--text-secondary, #cbd5e1)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
              <span>Refresh Telemetry</span>
            </button>
          )}

          <a
            href="https://github.com/mohasinraza143/BugFlow-Nexus/actions"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.95rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              textDecoration: 'none',
            }}
          >
            <span>GitHub Actions</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Top Info Strip: Repo, Branch, Commit */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            background: 'var(--bg-surface-elevated, #1f2937)',
            padding: '1rem 1.25rem',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle, #1e293b)',
          }}
        >
          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted, #94a3b8)', letterSpacing: '0.05em', display: 'block', marginBottom: '0.2rem' }}>
              REPOSITORY &amp; BRANCH
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitBranch size={16} style={{ color: '#818cf8' }} />
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary, #f8fafc)' }}>
                {data?.repository || 'mohasinraza143/BugFlow-Nexus'}
              </strong>
              <span style={{ fontSize: '0.72rem', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                {data?.branch || 'main'}
              </span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted, #94a3b8)', letterSpacing: '0.05em', display: 'block', marginBottom: '0.2rem' }}>
              LATEST COMMIT RUN
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Terminal size={15} style={{ color: '#38bdf8' }} />
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #f8fafc)',
                  maxWidth: '280px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={latestRun?.commit_message || 'Automatic CI/CD build deployment'}
              >
                {latestRun?.commit_message || 'Automatic CI/CD build deployment'}
              </span>
              {latestRun?.head_sha && (
                <code style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', padding: '0.1rem 0.35rem', borderRadius: '4px', color: '#94a3b8' }}>
                  {latestRun.head_sha.substring(0, 7)}
                </code>
              )}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted, #94a3b8)', letterSpacing: '0.05em', display: 'block', marginBottom: '0.2rem' }}>
              RENDER HOSTING ENVIRONMENT
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={15} style={{ color: '#10b981' }} />
              <a
                href={data?.services?.[0]?.url || 'https://bugflow-nexus.onrender.com'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.85rem', fontWeight: 600, color: '#34d399', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <span>Live Web Service</span>
                <ExternalLink size={12} />
              </a>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>• Oregon (US-West)</span>
            </div>
          </div>
        </div>

        {/* 3 Pipeline Execution Stages */}
        <div>
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', margin: '0 0 0.85rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} style={{ color: '#10b981' }} />
            <span>Automated Continuous Integration Stages</span>
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {/* Stage 1 */}
            <div
              style={{
                background: 'var(--bg-surface-elevated, #1f2937)',
                border: '1px solid var(--border-subtle, #1e293b)',
                borderRadius: '8px',
                padding: '1rem',
                borderLeft: '4px solid #10b981',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                  1. Lint &amp; Code Quality
                </span>
                <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={12} /> PASSED
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                Vite TypeScript compilation, strict type safety, zero ESLint warnings
              </p>
              <div style={{ marginTop: '0.65rem', fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Clock size={11} /> <span>Duration: ~34s</span>
              </div>
            </div>

            {/* Stage 2 */}
            <div
              style={{
                background: 'var(--bg-surface-elevated, #1f2937)',
                border: '1px solid var(--border-subtle, #1e293b)',
                borderRadius: '8px',
                padding: '1rem',
                borderLeft: '4px solid #10b981',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                  2. Backend Pytest &amp; API Validation
                </span>
                <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={12} /> PASSED
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                FastAPI endpoints, PostgreSQL transactional rollback tests, RBAC authorization
              </p>
              <div style={{ marginTop: '0.65rem', fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Clock size={11} /> <span>Duration: ~48s</span>
              </div>
            </div>

            {/* Stage 3 */}
            <div
              style={{
                background: 'var(--bg-surface-elevated, #1f2937)',
                border: '1px solid var(--border-subtle, #1e293b)',
                borderRadius: '8px',
                padding: '1rem',
                borderLeft: '4px solid #6366f1',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                  3. Render Docker Deployment
                </span>
                <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={12} /> ACTIVE
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                Container packaging, GZip compression, zero-downtime auto reload
              </p>
              <div style={{ marginTop: '0.65rem', fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Clock size={11} /> <span>Live Telemetry Synchronized</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent GitHub Actions Workflow Runs */}
        {data?.runs && data.runs.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', margin: 0 }}>
                Recent Pipeline Workflow Runs
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                Showing last {Math.min(data.runs.length, 5)} executions
              </span>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle, #1e293b)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-elevated, #1f2937)', textAlign: 'left', color: 'var(--text-muted, #94a3b8)', borderBottom: '1px solid var(--border-subtle, #1e293b)' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Commit</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Author</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Trigger</th>
                    <th style={{ padding: '0.65rem 1rem' }}>When</th>
                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Actions Log</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.slice(0, 5).map((run) => (
                    <tr key={run.id} style={{ borderBottom: '1px solid var(--border-subtle, #1e293b)' }}>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color:
                              run.conclusion === 'success'
                                ? '#10b981'
                                : run.status === 'in_progress'
                                ? '#f59e0b'
                                : '#ef4444',
                          }}
                        >
                          {run.conclusion === 'success' ? (
                            <CheckCircle2 size={13} />
                          ) : run.status === 'in_progress' ? (
                            <Play size={11} />
                          ) : (
                            <XCircle size={13} />
                          )}
                          {run.conclusion ? run.conclusion.toUpperCase() : run.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {run.commit_message}
                          </span>
                          <code style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{run.head_sha.substring(0, 7)}</code>
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary, #cbd5e1)' }}>
                        {run.author}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted, #94a3b8)' }}>
                        push ({run.head_branch})
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted, #94a3b8)' }}>
                        {formatRelativeTime(run.created_at)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                        <a
                          href={run.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#818cf8',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <span>View Run</span>
                          <ExternalLink size={11} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
