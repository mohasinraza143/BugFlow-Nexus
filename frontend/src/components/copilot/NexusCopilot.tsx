import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Bot,
  Send,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Bug,
  PlusCircle,
  BarChart3,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { getRoleLabel } from '../../types/auth';
import { projectsApi } from '../../api/projects';
import type { Project } from '../../types/project';
import type { Priority, Severity } from '../../types/issue';
import {
  nexusCopilotService,
  type CopilotMessage,
} from '../../services/nexusCopilotService';
import './NexusCopilot.css';

export const NexusCopilot: React.FC = () => {
  const auth = useContext(AuthContext);
  const currentUser = auth?.user ?? null;
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [inputQuery, setInputQuery] = useState<string>('');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Projects cache for in-chat quick bug reporter
  const [projects, setProjects] = useState<Project[]>([]);
  const [quickFormTitle, setQuickFormTitle] = useState<string>('');
  const [quickFormProjectId, setQuickFormProjectId] = useState<number | ''>('');
  const [quickFormSeverity, setQuickFormSeverity] = useState<Severity>('MAJOR');
  const [quickFormPriority, setQuickFormPriority] = useState<Priority>('HIGH');
  const [quickFormDesc, setQuickFormDesc] = useState<string>('');
  const [isSubmittingBug, setIsSubmittingBug] = useState<boolean>(false);
  const [showFormInChat, setShowFormInChat] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Preload projects for quick bug reporting
  useEffect(() => {
    projectsApi
      .list({ page_size: 50 })
      .then((res) => {
        if (res.items && res.items.length > 0) {
          setProjects(res.items);
          setQuickFormProjectId(res.items[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Global Keyboard Shortcut: Alt + C to toggle Copilot, Esc to close & custom event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    const handleOpenCustom = () => setIsOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copilot:open', handleOpenCustom);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copilot:open', handleOpenCustom);
    };
  }, [isOpen]);

  // Initial welcome message tailored to current user role
  const resetToWelcome = () => {
    setMessages([nexusCopilotService.getWelcomeMessage(currentUser)]);
    setShowFormInChat(false);
  };

  useEffect(() => {
    resetToWelcome();
  }, [currentUser]);

  // Send a user query
  const handleSend = async (queryText?: string) => {
    const query = (queryText || inputQuery).trim();
    if (!query || isThinking) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append user message
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: now,
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsThinking(true);

    try {
      const response = await nexusCopilotService.processQuery(query, currentUser);
      setMessages((prev) => [...prev, response]);

      if (response.showCreateBugForm) {
        setShowFormInChat(true);
        if (response.prefilledTitle) {
          setQuickFormTitle(response.prefilledTitle);
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `⚠️ An unexpected error occurred while communicating with Nexus Copilot. Please check your network connection.`,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // Submit in-chat bug creation
  const handleQuickBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFormProjectId || !quickFormTitle.trim()) return;

    setIsSubmittingBug(true);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      const created = await nexusCopilotService.createBugFromCopilot({
        project_id: Number(quickFormProjectId),
        title: quickFormTitle.trim(),
        description: quickFormDesc.trim() || 'Defect reported via Nexus Copilot assistant.',
        severity: quickFormSeverity,
        priority: quickFormPriority,
      });

      setShowFormInChat(false);
      setQuickFormTitle('');
      setQuickFormDesc('');

      setMessages((prev) => [
        ...prev,
        {
          id: `created-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `🎉 Defect successfully logged! Issue **${created.issue_key}** has been registered in the database.`,
          issues: [
            {
              id: created.id,
              issue_key: created.issue_key,
              title: created.title,
              issue_type: created.issue_type,
              severity: created.severity,
              priority: created.priority,
              status: created.status,
              project_id: created.project.id,
              reporter_id: created.reporter.id,
              assignee_id: created.assignee?.id ?? null,
              sprint_id: created.sprint_id ?? null,
              estimated_effort: created.estimated_effort ?? null,
              created_at: created.created_at,
              updated_at: created.updated_at,
            },
          ],
          suggestedActions: [
            'Show my assigned bugs',
            'List blocker & critical bugs',
          ],
        },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `create-err-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `❌ Could not file defect: ${(err as Error).message || 'Server error'}`,
        },
      ]);
    } finally {
      setIsSubmittingBug(false);
    }
  };

  const copyToClipboard = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to format inline markdown (bold, lists, code blocks)
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    let insideCodeBlock = false;
    let codeBuffer: string[] = [];
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (insideCodeBlock) {
          // Close code block
          elements.push(
            <pre key={`code-${index}`} className="nexus-code-block">
              <code>{codeBuffer.join('\n')}</code>
            </pre>
          );
          codeBuffer = [];
          insideCodeBlock = false;
        } else {
          insideCodeBlock = true;
        }
        return;
      }

      if (insideCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Check for bullet point
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const itemText = line.trim().replace(/^[*|-]\s+/, '');
        elements.push(
          <ul key={`ul-${index}`} style={{ margin: '3px 0' }}>
            <li>{parseInlineFormatting(itemText)}</li>
          </ul>
        );
        return;
      }

      // Regular line
      if (line.trim().length > 0) {
        elements.push(
          <p key={`p-${index}`} style={{ margin: '4px 0' }}>
            {parseInlineFormatting(line)}
          </p>
        );
      }
    });

    if (insideCodeBlock && codeBuffer.length > 0) {
      elements.push(
        <pre key="code-final" className="nexus-code-block">
          <code>{codeBuffer.join('\n')}</code>
        </pre>
      );
    }

    return elements;
  };

  // Parse **bold** inside lines
  const parseInlineFormatting = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <>
      {/* 1. Floating Trigger Button */}
      {!isOpen && (
        <button
          className="nexus-copilot-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Open Nexus Copilot Assistant"
          title="Open Nexus Copilot (Alt + C)"
        >
          <div className="nexus-trigger-icon-wrap">
            <Sparkles size={18} className="nexus-trigger-icon" />
            <span className="nexus-trigger-pulse" />
          </div>
          <span className="nexus-trigger-label">
            Nexus Copilot
            <span className="nexus-trigger-badge">AI</span>
          </span>
        </button>
      )}

      {/* 2. Floating Window Panel */}
      {isOpen && (
        <div
          className={`nexus-copilot-panel ${isExpanded ? 'expanded' : ''}`}
          role="dialog"
          aria-label="Nexus Copilot AI Window"
        >
          {/* Header */}
          <div className="nexus-panel-header">
            <div className="nexus-header-left">
              <div className="nexus-avatar-glow">
                <Bot size={20} />
                <span className="nexus-online-dot" />
              </div>
              <div className="nexus-header-title">
                <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                  Nexus Copilot
                  <span className="nexus-version-pill">v2.6 AI</span>
                  <span
                    className={`nexus-header-role-pill nexus-role-${(currentUser?.role || 'user').toLowerCase()}`}
                  >
                    {getRoleLabel(currentUser?.role || 'USER')}
                  </span>
                </h3>
                <span className="nexus-header-subtitle">
                  <Sparkles size={11} color="#10b981" />
                  Live Defect & Sprint Intelligence
                </span>
              </div>
            </div>

            <div className="nexus-header-actions">
              <button
                className="nexus-action-btn"
                onClick={resetToWelcome}
                title="Clear Chat & Restart"
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="nexus-action-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? 'Restore Size' : 'Expand Window'}
              >
                {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                className="nexus-action-btn"
                onClick={() => setIsOpen(false)}
                title="Close (Esc)"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="nexus-chat-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`nexus-msg-row ${msg.sender}`}>
                <div className={`nexus-msg-avatar ${msg.sender}`}>
                  {msg.sender === 'copilot' ? <Bot size={16} /> : (currentUser?.full_name ? currentUser.full_name[0].toUpperCase() : 'U')}
                </div>

                <div className="nexus-msg-bubble">
                  {msg.roleBadge && (
                    <div className="nexus-role-pill">{msg.roleBadge}</div>
                  )}

                  <div className="nexus-formatted-text">
                    {renderFormattedContent(msg.text)}
                  </div>

                  {/* Issues Deck / Interactive Cards */}
                  {msg.issues && msg.issues.length > 0 && (
                    <div className="nexus-issues-deck">
                      {msg.issues.map((issue) => (
                        <div
                          key={issue.id}
                          className="nexus-issue-card"
                          onClick={() => {
                            navigate(`/issues/${issue.id}`);
                            setIsOpen(false);
                          }}
                        >
                          <div className="nexus-issue-card-top">
                            <span className="nexus-issue-key">{issue.issue_key}</span>
                            <div className="nexus-issue-badges">
                              <span
                                className={`nexus-badge-pill nexus-badge-${issue.severity.toLowerCase()}`}
                              >
                                {issue.severity}
                              </span>
                              <span
                                className="nexus-badge-pill"
                                style={{
                                  background: 'rgba(99, 102, 241, 0.15)',
                                  color: '#a5b4fc',
                                }}
                              >
                                {issue.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>

                          <div className="nexus-issue-card-title">{issue.title}</div>

                          <div className="nexus-issue-card-footer">
                            <span>Priority: {issue.priority}</span>
                            <span className="nexus-view-link">
                              View Ticket <ExternalLink size={11} />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Admin Stats Grid */}
                  {msg.adminStats && (
                    <>
                      <div className="nexus-admin-metrics-grid">
                        <div className="nexus-admin-metric-cell">
                          <span className="cell-label">Users</span>
                          <span className="cell-val">{msg.adminStats.totalUsers}</span>
                        </div>
                        <div className="nexus-admin-metric-cell">
                          <span className="cell-label">Active Projs</span>
                          <span className="cell-val">{msg.adminStats.totalProjects}</span>
                        </div>
                        <div className="nexus-admin-metric-cell">
                          <span className="cell-label">In Dev</span>
                          <span className="cell-val" style={{ color: '#818cf8' }}>
                            {msg.adminStats.inDevIssues}
                          </span>
                        </div>
                        <div className="nexus-admin-metric-cell">
                          <span className="cell-label">Unresolved</span>
                          <span className="cell-val" style={{ color: '#fbbf24' }}>
                            {msg.adminStats.unresolvedIssues}
                          </span>
                        </div>
                        <div className="nexus-admin-metric-cell">
                          <span className="cell-label">Resolved</span>
                          <span className="cell-val" style={{ color: '#34d399' }}>
                            {msg.adminStats.resolvedIssues}
                          </span>
                        </div>
                        <div className="nexus-admin-metric-cell">
                          <span className="cell-label">Blockers</span>
                          <span className="cell-val" style={{ color: '#f87171' }}>
                            {msg.adminStats.blockerCount}
                          </span>
                        </div>
                      </div>

                      <button
                        className="nexus-dashboard-jump-btn"
                        onClick={() => {
                          navigate('/admin');
                          setIsOpen(false);
                        }}
                      >
                        Open Full Admin Center <ExternalLink size={12} />
                      </button>
                    </>
                  )}

                  {/* Regular Metrics Box */}
                  {msg.metrics && !msg.adminStats && (
                    <>
                      <div className="nexus-metrics-card">
                        <div className="nexus-metric-box">
                          <span className="label">Total Issues</span>
                          <span className="val">{msg.metrics.totalIssues ?? 0}</span>
                        </div>
                        <div className="nexus-metric-box">
                          <span className="label">Open / Active</span>
                          <span className="val" style={{ color: '#38bdf8' }}>
                            {msg.metrics.openIssues ?? 0}
                          </span>
                        </div>
                        <div className="nexus-metric-box">
                          <span className="label">Resolved</span>
                          <span className="val" style={{ color: '#34d399' }}>
                            {msg.metrics.resolvedIssues ?? 0}
                          </span>
                        </div>
                        <div className="nexus-metric-box">
                          <span className="label">Blocker / Critical</span>
                          <span className="val" style={{ color: '#f87171' }}>
                            {msg.metrics.criticalIssues ?? 0}
                          </span>
                        </div>
                      </div>

                      {currentUser?.role === 'TESTER' && (
                        <button
                          className="nexus-dashboard-jump-btn"
                          onClick={() => {
                            navigate('/tester-dashboard');
                            setIsOpen(false);
                          }}
                        >
                          Open Tester Dashboard <ExternalLink size={12} />
                        </button>
                      )}

                      {currentUser?.role === 'USER' && (
                        <button
                          className="nexus-dashboard-jump-btn"
                          onClick={() => {
                            navigate('/dashboard');
                            setIsOpen(false);
                          }}
                        >
                          Open My User Dashboard <ExternalLink size={12} />
                        </button>
                      )}
                    </>
                  )}

                  {/* Suggested Action Chips */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="nexus-chips-container">
                      {msg.suggestedActions.map((action, idx) => (
                        <button
                          key={idx}
                          className="nexus-chip-btn"
                          onClick={() => handleSend(action)}
                        >
                          {action.includes('blocker') ? (
                            <Flame size={12} color="#f87171" />
                          ) : action.includes('bug') || action.includes('defect') ? (
                            <Bug size={12} />
                          ) : action.includes('sprint') || action.includes('overview') || action.includes('dashboard') ? (
                            <BarChart3 size={12} />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          {action}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Message Meta Info */}
                  <div className="nexus-msg-meta">
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'copilot' && (
                      <button
                        className="nexus-copy-btn"
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                        title="Copy text"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check size={11} color="#10b981" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={11} /> Copy
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* In-Chat Quick Bug Creation Card */}
            {showFormInChat && (
              <form className="nexus-quick-form-card" onSubmit={handleQuickBugSubmit}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bug size={16} color="#818cf8" />
                  <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                    {currentUser?.role === 'USER'
                      ? 'Submit Defect / Feature Ticket'
                      : currentUser?.role === 'TESTER'
                      ? 'Log QA Defect Report'
                      : 'Create Enterprise Defect'}
                  </strong>
                </div>

                <div className="nexus-form-field">
                  <label>Project</label>
                  <select
                    className="nexus-form-select"
                    value={quickFormProjectId}
                    onChange={(e) => setQuickFormProjectId(Number(e.target.value))}
                    required
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.project_key}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="nexus-form-field">
                  <label>Defect Title</label>
                  <input
                    type="text"
                    className="nexus-form-input"
                    placeholder="e.g. Broken checkout button on Mobile Safari"
                    value={quickFormTitle}
                    onChange={(e) => setQuickFormTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="nexus-form-row">
                  <div className="nexus-form-field">
                    <label>Severity</label>
                    <select
                      className="nexus-form-select"
                      value={quickFormSeverity}
                      onChange={(e) => setQuickFormSeverity(e.target.value as Severity)}
                    >
                      <option value="MINOR">MINOR</option>
                      <option value="MAJOR">MAJOR</option>
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="BLOCKER">BLOCKER</option>
                    </select>
                  </div>
                  <div className="nexus-form-field">
                    <label>Priority</label>
                    <select
                      className="nexus-form-select"
                      value={quickFormPriority}
                      onChange={(e) => setQuickFormPriority(e.target.value as Priority)}
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                </div>

                <div className="nexus-form-field">
                  <label>Brief Description (Optional)</label>
                  <textarea
                    rows={2}
                    className="nexus-form-textarea"
                    placeholder="Summary of reproduction steps or error observation..."
                    value={quickFormDesc}
                    onChange={(e) => setQuickFormDesc(e.target.value)}
                  />
                </div>

                <div className="nexus-form-actions">
                  <button
                    type="button"
                    className="nexus-form-btn-cancel"
                    onClick={() => setShowFormInChat(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="nexus-form-btn-submit"
                    disabled={isSubmittingBug || !quickFormTitle.trim()}
                  >
                    {isSubmittingBug ? (
                      'Filing...'
                    ) : (
                      <>
                        <PlusCircle size={13} /> Submit Defect
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Thinking Animation */}
            {isThinking && (
              <div className="nexus-typing-row">
                <div className="nexus-msg-avatar copilot">
                  <Bot size={16} />
                </div>
                <div className="nexus-typing-bubble">
                  <span className="nexus-typing-dot" />
                  <span className="nexus-typing-dot" />
                  <span className="nexus-typing-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="nexus-panel-footer">
            <div className="nexus-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="nexus-chat-input"
                placeholder="Ask Copilot (e.g. 'Show my bugs', 'Report bug')..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                className="nexus-send-btn"
                onClick={() => handleSend()}
                disabled={!inputQuery.trim() || isThinking}
                title="Send query"
              >
                <Send size={15} />
              </button>
            </div>

            <div className="nexus-input-hint">
              <span>
                Tip: Press <span className="nexus-shortcut-tag">Alt + C</span> to toggle
              </span>
              <span>
                Powered by <strong>Nexus Intelligence</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
