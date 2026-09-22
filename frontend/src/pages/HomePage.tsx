import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bug,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  LogIn,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
  Target,
  Check,
  Flame,
  Laptop,
  Activity,
  TrendingUp,
  Clock,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BrandLogo } from '../components/common/BrandLogo';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { UserAvatar } from '../components/common/UserAvatar';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sprints' | 'triage' | 'analytics'>('sprints');
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'7d' | '14d' | '30d'>('7d');

  const dashboardPath = () => {
    if (!user) return '/login';
    if (user.role === 'ADMIN') return '/admin-dashboard';
    if (user.role === 'TESTER' || user.role === 'DEVELOPER') return '/tester-dashboard';
    return '/dashboard';
  };

  const go = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="landing-root">
      {/* Dynamic Background Glows */}
      <div className="glow-top-left" />
      <div className="glow-top-right" />
      {/* Top Tricolor Brand Accent Line */}
      <div className="brand-tricolor-stripe" />

      {/* Top Banner */}
      <div className="top-announcement-bar">
        <div className="announcement-content">
          <span className="brand-tricolor-tag">NEXUS 2.0</span>
          <span className="announcement-text">
            <span className="brand-tricolor-text" style={{ marginRight: '0.3rem' }}>BugFlow-Nexus</span>
            Engine Released with Real-Time Sprint Analytics
          </span>
          <span className="announcement-link" onClick={() => go(isAuthenticated ? dashboardPath() : '/register')}>
            Explore Features <ChevronRight size={14} />
          </span>
        </div>
      </div>

      {/* Modern Sticky Navbar */}
      <nav className="landing-nav">
        <div className="landing-nav-container">
          {/* Brand Logo */}
          <div onClick={() => go('/')}>
            <BrandLogo size={36} edition="NEXUS" />
          </div>

          {/* Desktop Navigation Links */}
          <div className="desktop-nav-links">
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <a href="#analytics">Live Analytics</a>
            <a href="#comparison">Why BugFlow</a>
          </div>

          {/* Nav CTAs */}
          <div className="nav-actions">
            <ThemeToggle />

            {isAuthenticated && user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserAvatar userId={user.id} fullName={user.full_name} role={user.role} size={32} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'none' }} className="desktop-only-name">
                    {user.full_name}
                  </span>
                </div>
                <button className="btn-nav-primary" onClick={() => go(dashboardPath())}>
                  <LayoutDashboard size={16} />
                  <span>Dashboard</span>
                </button>
                <button className="btn-nav-secondary" onClick={() => { logout(); navigate('/'); }} title="Sign Out" style={{ padding: '0.5rem' }}>
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <>
                <button className="btn-nav-secondary" onClick={() => go('/login')}>
                  <LogIn size={15} />
                  <span>Sign In</span>
                </button>
                <button className="btn-nav-primary" onClick={() => go('/register')}>
                  <span>Get Started</span>
                  <ArrowRight size={15} />
                </button>
              </>
            )}

            {/* Mobile Menu Toggle */}
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Slideout Menu */}
        {mobileMenuOpen && (
          <div className="mobile-menu-drawer">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)}>Workflow</a>
            <a href="#analytics" onClick={() => setMobileMenuOpen(false)}>Live Analytics</a>
            <a href="#comparison" onClick={() => setMobileMenuOpen(false)}>Why BugFlow</a>
            <div className="mobile-drawer-cta">
              {isAuthenticated && user ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                    <UserAvatar userId={user.id} fullName={user.full_name} role={user.role} size={36} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.full_name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.role}</span>
                    </div>
                  </div>
                  <button className="btn-nav-primary w-full" onClick={() => go(dashboardPath())} style={{ justifyContent: 'center' }}>
                    <LayoutDashboard size={16} /> Open Workspace
                  </button>
                  <button className="btn-nav-secondary w-full" onClick={() => { logout(); setMobileMenuOpen(false); navigate('/'); }} style={{ justifyContent: 'center' }}>
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button className="btn-nav-secondary w-full" onClick={() => go('/login')}>
                    Sign In
                  </button>
                  <button className="btn-nav-primary w-full" onClick={() => go('/register')}>
                    Get Started Free <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <header className="hero-section">
        <div className="hero-badge-container">
          <div className="hero-pill-badge">
            <span className="pulsing-beacon" />
            <Sparkles size={14} style={{ color: '#fbbf24' }} />
            <span>Next-Generation Defect Intelligence Platform</span>
          </div>
        </div>

        <h1 className="hero-headline">
          Stop wrestling bugs. <br />
          <span className="brand-tricolor-text" style={{ fontSize: '1.05em' }}>Ship with BugFlow-Nexus.</span>
        </h1>

        <p className="hero-subtext">
          The high-velocity issue tracking and agile sprint ecosystem built for high-performance
          engineering & QA teams. Zero fluff, instant telemetry, and automated workflows.
        </p>

        <div className="hero-cta-group">
          <button
            className="btn-hero-primary"
            onClick={() => go(isAuthenticated ? dashboardPath() : '/register')}
          >
            <span>{isAuthenticated ? 'Launch Workspace' : 'Start Free Trial'}</span>
            <ArrowRight size={18} />
          </button>
          <a href="#live-preview" className="btn-hero-secondary">
            <Laptop size={18} />
            <span>Interactive Demo</span>
          </a>
        </div>

        <div className="hero-micro-proof">
          <div className="proof-item"><CheckCircle2 size={16} /> Real-Time WebSocket Sync</div>
          <div className="proof-item"><ShieldCheck size={16} /> Role-Based Security</div>
          <div className="proof-item"><Zap size={16} /> Sub-50ms Response Time</div>
        </div>

        {/* HERO INTERACTIVE APP MOCKUP */}
        <div className="hero-showcase-wrapper" id="live-preview">
          <div className="mockup-window">
            {/* macOS Window Titlebar */}
            <div className="mockup-header">
              <div className="mac-controls">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="mockup-title">
                <ShieldCheck size={13} style={{ color: '#10b981' }} />
                <span><b className="brand-tricolor-text" style={{ fontSize: '0.8rem' }}>bugflow.nexus</b>/workspace/nexus-pay-app</span>
              </div>
              <div className="mockup-status">
                <span className="live-dot" /> LIVE TELEMETRY
              </div>
            </div>

            {/* Mockup Tab Selector */}
            <div className="mockup-tabs">
              <button
                className={`mockup-tab ${activeTab === 'sprints' ? 'active' : ''}`}
                onClick={() => setActiveTab('sprints')}
              >
                <Target size={14} /> Sprint 2: Payments UI
              </button>
              <button
                className={`mockup-tab ${activeTab === 'triage' ? 'active' : ''}`}
                onClick={() => setActiveTab('triage')}
              >
                <Bug size={14} /> Defect Triage (8 Open)
              </button>
              <button
                className={`mockup-tab ${activeTab === 'analytics' ? 'active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                <BarChart3 size={14} /> Burndown Velocity
              </button>
            </div>

            {/* Mockup Content Body */}
            <div className="mockup-body">
              {activeTab === 'sprints' && (
                <div className="mockup-sprint-view">
                  <div className="mockup-kpi-row">
                    <div className="mockup-mini-kpi">
                      <span className="mini-kpi-label">SPRINT PROGRESS</span>
                      <span className="mini-kpi-val text-indigo">78%</span>
                      <div className="mini-progress-bar"><div style={{ width: '78%' }} /></div>
                    </div>
                    <div className="mockup-mini-kpi">
                      <span className="mini-kpi-label">TOTAL SCOPE</span>
                      <span className="mini-kpi-val">14 Issues</span>
                    </div>
                    <div className="mockup-mini-kpi">
                      <span className="mini-kpi-label">VERIFIED RESOLVED</span>
                      <span className="mini-kpi-val text-emerald">11 Issues</span>
                    </div>
                    <div className="mockup-mini-kpi">
                      <span className="mini-kpi-label">BURNDOWN HEALTH</span>
                      <span className="mini-kpi-val text-emerald">ON TRACK</span>
                    </div>
                  </div>

                  <div className="mockup-issues-list">
                    <div className="mockup-issue-item">
                      <span className="mockup-key">NEX-5</span>
                      <div className="mockup-issue-title">
                        <b>Biometric Login UI Glitch</b>
                        <span>Reported by QA Lead · Priority: Urgent</span>
                      </div>
                      <span className="mockup-badge resolved">RESOLVED</span>
                    </div>
                    <div className="mockup-issue-item">
                      <span className="mockup-key">NEX-7</span>
                      <div className="mockup-issue-title">
                        <b>Camera Scanner crash on Android 14</b>
                        <span>Assigned to Tester · In Verification</span>
                      </div>
                      <span className="mockup-badge in-progress">IN TESTING</span>
                    </div>
                    <div className="mockup-issue-item">
                      <span className="mockup-key">NEX-9</span>
                      <div className="mockup-issue-title">
                        <b>Redux Toolkit Payment State Migration</b>
                        <span>Tech Debt · Estimated Effort: 8 pts</span>
                      </div>
                      <span className="mockup-badge dev">IN DEVELOPMENT</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'triage' && (
                <div className="mockup-triage-view">
                  <div className="triage-head">
                    <div>
                      <h4>Active Triage Matrix</h4>
                      <p>Instant severity classification and automated team load routing.</p>
                    </div>
                    <button className="triage-action-btn">+ Report Defect</button>
                  </div>
                  <div className="triage-columns">
                    <div className="triage-col">
                      <div className="col-header critical">CRITICAL / BLOCKER (2)</div>
                      <div className="triage-card">
                        <span className="card-tag red">SEV-1</span>
                        <b>Payment Gateway Timeout</b>
                        <small>Auto-assigned to Senior Dev</small>
                      </div>
                    </div>
                    <div className="triage-col">
                      <div className="col-header high">HIGH PRIORITY (4)</div>
                      <div className="triage-card">
                        <span className="card-tag yellow">SEV-2</span>
                        <b>OAuth Token Refresh Leak</b>
                        <small>In Testing by QA</small>
                      </div>
                    </div>
                    <div className="triage-col">
                      <div className="col-header normal">ENHANCEMENT (6)</div>
                      <div className="triage-card">
                        <span className="card-tag blue">SEV-3</span>
                        <b>Dark Mode Contrast Fixes</b>
                        <small>Backlog Pipeline</small>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="mockup-analytics-view">
                  <div className="analytics-graph-container">
                    <div className="graph-header">
                      <span>Ideal vs Actual Sprint Trajectory</span>
                      <span className="graph-legend"><i className="legend-ideal" /> Ideal <i className="legend-actual" /> Actual</span>
                    </div>
                    <div className="fake-svg-chart">
                      <svg viewBox="0 0 500 120" className="chart-svg">
                        <path d="M 10 10 L 490 110" stroke="#475569" strokeDasharray="5 5" strokeWidth="2" fill="none" />
                        <path d="M 10 10 Q 150 40 250 50 T 490 105" stroke="#6366f1" strokeWidth="3" fill="none" />
                        <circle cx="250" cy="50" r="5" fill="#6366f1" />
                        <circle cx="490" cy="105" r="5" fill="#10b981" />
                      </svg>
                    </div>
                    <div className="analytics-summary-stats">
                      <div><b>4.2 Days</b><span>Avg Resolution Time</span></div>
                      <div><b>94.8%</b><span>Sprint Velocity</span></div>
                      <div><b>0 Overdue</b><span>Current Sprint</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Floating Live Stat Chips */}
          <div className="floating-chip chip-left">
            <CheckCircle2 size={18} style={{ color: '#10b981' }} />
            <div>
              <b>Auto-Rollover Activated</b>
              <span>Unfinished scope shifted cleanly</span>
            </div>
          </div>

          <div className="floating-chip chip-right">
            <Flame size={18} style={{ color: '#f59e0b' }} />
            <div>
              <b>Real-time Reactive</b>
              <span>Burndown recalculated instantly</span>
            </div>
          </div>
        </div>
      </header>

      {/* METRIC COUNTERS SECTION */}
      <section className="metrics-strip">
        <div className="metrics-grid-landing">
          <div className="metric-box">
            <span className="metric-big-num">99.9%</span>
            <span className="metric-tagline">Triage System Uptime</span>
          </div>
          <div className="metric-box">
            <span className="metric-big-num">4.8x</span>
            <span className="metric-tagline">Faster Defect Lifecycle</span>
          </div>
          <div className="metric-box">
            <span className="metric-big-num">100%</span>
            <span className="metric-tagline">Reactive Live Sync</span>
          </div>
          <div className="metric-box">
            <span className="metric-big-num">&lt; 30ms</span>
            <span className="metric-tagline">API Query Latency</span>
          </div>
        </div>
      </section>

      {/* BENTO GRID ENTERPRISE FEATURES */}
      <section className="bento-section" id="features">
        <div className="section-title-block">
          <span className="kicker-pill">CORE CAPABILITIES</span>
          <h2 className="section-h2">Architected for Extreme QA Velocity</h2>
          <p className="section-desc">
            Everything your engineering team needs to capture, triage, execute, and verify defects
            without sluggish UI or configuration bloat.
          </p>
        </div>

        <div className="bento-grid">
          {/* Bento Card 1: Sprint Automation */}
          <div className="bento-card span-2 highlight">
            <div className="bento-icon"><Target size={24} style={{ color: '#818cf8' }} /></div>
            <h3>Company-Grade Sprint Engine</h3>
            <p>
              Auto-progression advances assigned issues to In-Development the moment work begins.
              Auto-rollover protects historical data by preserving completed items and moving
              unfinished tasks smoothly to the Backlog.
            </p>
            <div className="bento-visual sprint-preview-badge">
              <span className="badge-chip">⚡ Auto-Begin Work</span>
              <span className="badge-chip">🛡️ Zero Issue Stealing</span>
              <span className="badge-chip">📈 Daily Burndown Points</span>
            </div>
          </div>

          {/* Bento Card 2: Live Notifications */}
          <div className="bento-card">
            <div className="bento-icon"><Bell size={24} style={{ color: '#fbbf24' }} /></div>
            <h3>Real-Time Notification Hub</h3>
            <p>
              Instant in-app bell center with filter tabs, deep-linking directly to issues, and
              one-click read-all management.
            </p>
          </div>

          {/* Bento Card 3: Role-Based Access */}
          <div className="bento-card">
            <div className="bento-icon"><ShieldCheck size={24} style={{ color: '#34d399' }} /></div>
            <h3>Strict Role Security</h3>
            <p>
              Dedicated tailored dashboards for Admins, QA Testers, and Users. Clean permission
              barriers ensure accountability.
            </p>
          </div>

          {/* Bento Card 4: Live Charts & Reports */}
          <div className="bento-card span-2">
            <div className="bento-icon"><BarChart3 size={24} style={{ color: '#38bdf8' }} /></div>
            <h3>Automated PDF & CSV Reports</h3>
            <p>
              Generate executive-level PDF summaries of sprints, defect severity breakdown, and
              developer workload distributions in a single click.
            </p>
          </div>
        </div>
      </section>

      {/* 3-STEP WORKFLOW SECTION */}
      <section className="workflow-section" id="workflow">
        <div className="section-title-block">
          <span className="kicker-pill">THE AGILE PIPELINE</span>
          <h2 className="section-h2">From Bug Discovery to Verified Fix</h2>
        </div>

        <div className="workflow-timeline">
          <div className="workflow-card">
            <div className="step-number">01</div>
            <h4>Log & Triaged</h4>
            <p>
              Capture full reproduction steps, priority, severity, and environment details into
              centralized backlogs.
            </p>
          </div>
          <div className="workflow-arrow"><ArrowRight size={22} /></div>
          <div className="workflow-card">
            <div className="step-number">02</div>
            <h4>Sprint Execution</h4>
            <p>
              Plan capacity, assign QA testers, and auto-transition issues into live development
              cycles.
            </p>
          </div>
          <div className="workflow-arrow"><ArrowRight size={22} /></div>
          <div className="workflow-card">
            <div className="step-number">03</div>
            <h4>Verified & Closed</h4>
            <p>
              Tester verification updates the burndown graph in real-time. Unfinished tasks roll
              cleanly into subsequent sprints.
            </p>
          </div>
        </div>
      </section>

      {/* LIVE ANALYTICS & BURNDOWN TELEMETRY SHOWCASE (Fixes navbar Live Analytics link) */}
      <section className="analytics-showcase-section" id="analytics">
        <div className="section-title-block">
          <span className="brand-tricolor-tag">REAL-TIME TELEMETRY &amp; SPRINT RADAR</span>
          <h2 className="section-h2">Live Defect Analytics &amp; Burndown Velocity</h2>
          <p className="section-desc">
            Continuous burndown telemetry, defect severity breakdowns, and QA throughput tracking
            with zero latency and instant reactive sync.
          </p>
        </div>

        <div className="analytics-dashboard-showcase">
          {/* Top Control Bar with Live Ping and Timeframe Buttons */}
          <div className="analytics-control-bar">
            <div className="live-telemetry-badge">
              <span className="live-ping-dot" />
              <Activity size={15} style={{ color: '#10b981' }} />
              <span>LIVE TELEMETRY STREAMING</span>
            </div>

            <div className="analytics-pill-tabs">
              {(['7d', '14d', '30d'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  className={`pill-tab-btn ${analyticsTimeframe === tf ? 'active' : ''}`}
                  onClick={() => setAnalyticsTimeframe(tf)}
                >
                  {tf === '7d' ? '⚡ 7-Day Sprint' : tf === '14d' ? '📅 14-Day Cycle' : '📊 30-Day Velocity'}
                </button>
              ))}
            </div>
          </div>

          {/* 4 Key Performance Metric Cards */}
          <div className="analytics-metrics-row">
            <div className="analytics-kpi-card">
              <div className="kpi-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                <TrendingUp size={20} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">BURNDOWN VELOCITY</span>
                <span className="kpi-value text-indigo">{analyticsTimeframe === '7d' ? '96.2%' : analyticsTimeframe === '14d' ? '94.8%' : '91.5%'}</span>
                <span className="kpi-sub positive">↑ +14.2% vs baseline</span>
              </div>
            </div>

            <div className="analytics-kpi-card">
              <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <CheckCircle2 size={20} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">VERIFIED RESOLUTION RATE</span>
                <span className="kpi-value text-emerald">{analyticsTimeframe === '7d' ? '92.0%' : '88.5%'}</span>
                <span className="kpi-sub positive">38 of 43 Defects Closed</span>
              </div>
            </div>

            <div className="analytics-kpi-card">
              <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                <Clock size={20} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">AVG RESOLUTION TIME</span>
                <span className="kpi-value text-amber">{analyticsTimeframe === '7d' ? '3.2 hrs' : '4.6 hrs'}</span>
                <span className="kpi-sub">Sub-4hr QA Turnaround</span>
              </div>
            </div>

            <div className="analytics-kpi-card">
              <div className="kpi-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                <ShieldAlert size={20} />
              </div>
              <div className="kpi-info">
                <span className="kpi-label">BLOCKERS / SEV-1</span>
                <span className="kpi-value text-rose">0 Open</span>
                <span className="kpi-sub positive">100% Release Ready</span>
              </div>
            </div>
          </div>

          {/* Interactive Split Graphs */}
          <div className="analytics-interactive-grid">
            {/* Left: Burndown Velocity Chart */}
            <div className="analytics-chart-card">
              <div className="chart-card-header">
                <div>
                  <h4>Sprint Trajectory &amp; Burndown Curve</h4>
                  <p>Ideal velocity vs real-time team issue resolution</p>
                </div>
                <div className="chart-legend-pills">
                  <span className="legend-chip ideal">Ideal Slope</span>
                  <span className="legend-chip actual">Actual Velocity</span>
                </div>
              </div>

              <div className="chart-svg-wrapper">
                <svg viewBox="0 0 600 200" className="interactive-chart-svg">
                  <defs>
                    <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  <line x1="40" y1="30" x2="570" y2="30" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="40" y1="80" x2="570" y2="80" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="40" y1="130" x2="570" y2="130" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="40" y1="180" x2="570" y2="180" stroke="rgba(255,255,255,0.12)" />

                  {/* Ideal Guideline */}
                  <line x1="40" y1="35" x2="570" y2="180" stroke="#64748b" strokeWidth="2" strokeDasharray="6 6" />

                  {/* Actual Area and Curve */}
                  <path
                    d={
                      analyticsTimeframe === '7d'
                        ? 'M 40 35 Q 180 50 300 85 T 570 175 L 570 180 L 40 180 Z'
                        : 'M 40 35 Q 160 45 320 90 T 570 178 L 570 180 L 40 180 Z'
                    }
                    fill="url(#actualGradient)"
                  />
                  <path
                    d={
                      analyticsTimeframe === '7d'
                        ? 'M 40 35 Q 180 50 300 85 T 570 175'
                        : 'M 40 35 Q 160 45 320 90 T 570 178'
                    }
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="3.5"
                  />

                  {/* Nodes */}
                  <circle cx="40" cy="35" r="5" fill="#818cf8" />
                  <circle cx="180" cy={analyticsTimeframe === '7d' ? '50' : '45'} r="5" fill="#818cf8" />
                  <circle cx="300" cy="85" r="6" fill="#38bdf8" />
                  <circle cx="570" cy="175" r="6" fill="#10b981" />
                </svg>
              </div>

              <div className="chart-bottom-labels">
                <span>Day 1 (Sprint Kickoff)</span>
                <span>Day 5 (Mid-Check)</span>
                <span>Day 10 (Verification)</span>
                <span className="text-emerald">Day 14 (Shipped &amp; Verified)</span>
              </div>
            </div>

            {/* Right: Defect Severity & QA Distribution */}
            <div className="analytics-side-card">
              <h4>Severity Matrix &amp; Status</h4>
              <p>Active issues categorized by impact level</p>

              <div className="severity-bar-list">
                <div className="severity-bar-item">
                  <div className="bar-info">
                    <span className="tag-sev blocker">BLOCKER</span>
                    <span>0 active</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill blocker" style={{ width: '0%' }} /></div>
                </div>

                <div className="severity-bar-item">
                  <div className="bar-info">
                    <span className="tag-sev critical">CRITICAL</span>
                    <span>2 in verification</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill critical" style={{ width: '15%' }} /></div>
                </div>

                <div className="severity-bar-item">
                  <div className="bar-info">
                    <span className="tag-sev major">MAJOR</span>
                    <span>7 resolved</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill major" style={{ width: '48%' }} /></div>
                </div>

                <div className="severity-bar-item">
                  <div className="bar-info">
                    <span className="tag-sev minor">MINOR / ENHANCEMENT</span>
                    <span>14 resolved</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill minor" style={{ width: '85%' }} /></div>
                </div>
              </div>

              <div className="analytics-quick-cta" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-hero-primary w-full"
                  onClick={() => go(isAuthenticated ? '/analytics' : '/login')}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <BarChart3 size={16} />
                  <span>{isAuthenticated ? 'Open Full Analytics Workspace' : 'Sign In to View Full Analytics'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY US VS OTHERS COMPARISON */}
      <section className="comparison-section" id="comparison">
        <div className="section-title-block">
          <span className="brand-tricolor-tag">WHY BUGFLOW-NEXUS</span>
          <h2 className="section-h2">Built for Extreme Speed. Not Meetings.</h2>
        </div>

        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="highlight-col"><span className="brand-tricolor-text">BugFlow-Nexus Platform</span></th>
                <th>Legacy Tools (Jira / Spreadsheets)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sprint Progression</td>
                <td className="highlight-col"><Check size={16} className="text-emerald" /> <b>Automatic on Begin Work</b></td>
                <td><X size={16} className="text-muted" /> Manual per-issue dragging</td>
              </tr>
              <tr>
                <td>Sprint Rollover</td>
                <td className="highlight-col"><Check size={16} className="text-emerald" /> <b>Seamless Backlog Migration</b></td>
                <td><X size={16} className="text-muted" /> Throws block errors & freezes</td>
              </tr>
              <tr>
                <td>Real-time Telemetry</td>
                <td className="highlight-col"><Check size={16} className="text-emerald" /> <b>Live Reactive Charts</b></td>
                <td><X size={16} className="text-muted" /> Requires full browser reload</td>
              </tr>
              <tr>
                <td>Interface Speed</td>
                <td className="highlight-col"><Check size={16} className="text-emerald" /> <b>Instant (&lt;50ms)</b></td>
                <td><X size={16} className="text-muted" /> Heavy, slow enterprise bloat</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* CALL TO ACTION BANNER */}
      <section className="cta-banner-section">
        <div className="cta-banner-card">
          <div className="cta-glow" />
          <h2 className="cta-h2">Supercharge Your QA Workflow Today</h2>
          <p className="cta-sub">
            Join modern engineering teams tracking defects and completing sprints with precision.
          </p>
          <div className="cta-buttons">
            <button
              className="btn-hero-primary"
              onClick={() => go(isAuthenticated ? dashboardPath() : '/register')}
            >
              <span>{isAuthenticated ? 'Open Your Workspace' : 'Create Free Workspace'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ENTERPRISE FOOTER */}
      <footer className="landing-footer">
        <div className="footer-grid">
          <div className="footer-brand-col">
            <div onClick={() => go('/')}>
              <BrandLogo size={32} />
            </div>
            <p className="footer-desc">
              Next-generation agile bug tracking and defect verification system for high-velocity software teams.
            </p>
            <div className="system-health-pill">
              <span className="green-ping" />
              <span>All Systems Fully Operational</span>
            </div>
          </div>

          <div className="footer-links-col">
            <h5>Product</h5>
            <a href="#features">Agile Sprints</a>
            <a href="#workflow">Defect Triage</a>
            <a href="#analytics">Live Burndown</a>
            <a href="#features">Notification Hub</a>
          </div>

          <div className="footer-links-col">
            <h5>Resources</h5>
            <a href="#comparison">Comparison</a>
            <a href="#features">Documentation</a>
            <a href="#workflow">Security & Roles</a>
            <a href="#features">API Reference</a>
          </div>

          <div className="footer-links-col">
            <h5>Platform</h5>
            <button onClick={() => go('/login')}>Sign In</button>
            <button onClick={() => go('/register')}>Create Account</button>
            <a href="mailto:support@bugflow.io">Contact Support</a>
            <span>v2.4.0-Enterprise</span>
          </div>
        </div>

        <div className="brand-tricolor-stripe" style={{ opacity: 0.7, marginTop: '2rem' }} />
        <div className="footer-bottom-bar">
          <p>Mohsin Raza © {new Date().getFullYear()} <span className="brand-tricolor-text" style={{ fontSize: '0.85rem' }}>BugFlow-Nexus</span> Technologies Inc. All rights reserved.</p>
          <div className="footer-legal-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#compliance">Security Compliance</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
