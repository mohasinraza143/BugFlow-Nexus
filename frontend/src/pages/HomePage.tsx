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
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './HomePage.css';

const features = [
  {
    icon: Bug,
    title: 'Track every issue',
    text: 'Create, assign, prioritize and follow bugs from one clean workspace.',
    tone: 'blue',
  },
  {
    icon: LayoutDashboard,
    title: 'Plan the work',
    text: 'Organize issues into projects and sprints without unnecessary complexity.',
    tone: 'violet',
  },
  {
    icon: BarChart3,
    title: 'See what matters',
    text: 'Use simple analytics to understand progress, workload and open defects.',
    tone: 'green',
  },
];

const steps = [
  ['01', 'Create', 'Log the defect with the important details.'],
  ['02', 'Assign', 'Send it to the right developer or tester.'],
  ['03', 'Resolve', 'Track the status until the issue is closed.'],
];

export const HomePage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const dashboardPath = () => {
    if (!user) return '/login';
    if (user.role === 'ADMIN') return '/admin-dashboard';
    if (user.role === 'TESTER' || user.role === 'DEVELOPER') return '/tester-dashboard';
    return '/dashboard';
  };

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="home">
      <div className="home-noise" />

      <div className="home-announcement">
        <Sparkles size={14} />
        <span>Simple defect tracking for modern QA teams</span>
        <ChevronRight size={14} />
      </div>

      <nav className="home-nav">
        <div className="home-nav-inner">
          <button className="home-brand" onClick={() => go('/')}>
            <span className="home-brand-mark"><Bug size={19} /></span>
            <span>BugFlow</span>
          </button>

          <div className={`home-links ${menuOpen ? 'open' : ''}`}>
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
            <button onClick={() => document.getElementById('process')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
            <button onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}>About</button>
            {isAuthenticated ? (
              <button className="mobile-only" onClick={() => go(dashboardPath())}>Dashboard</button>
            ) : (
              <button className="mobile-only" onClick={() => go('/login')}>Login</button>
            )}
          </div>

          <div className="home-actions">
            {isAuthenticated ? (
              <button className="home-dashboard" onClick={() => go(dashboardPath())}>
                <LayoutDashboard size={16} /> Dashboard
              </button>
            ) : (
              <>
                <button className="home-login" onClick={() => go('/login')}>
                  <LogIn size={16} /> Login
                </button>
                <button className="home-start" onClick={() => go('/register')}>
                  Get started <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>

          <button className="home-menu" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      <main>
        <section className="home-hero">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span className="kicker-dot" />
              Built for QA & development
            </div>

            <h1>
              Find bugs.
              <br />
              <span>Fix faster.</span>
            </h1>

            <p>
              BugFlow gives your team one focused place to report defects,
              manage sprints and see what needs attention next.
            </p>

            <div className="hero-buttons">
              <button className="primary-cta" onClick={() => go(isAuthenticated ? dashboardPath() : '/register')}>
                {isAuthenticated ? 'Open dashboard' : 'Start tracking bugs'}
                <ArrowRight size={18} />
              </button>
              <button className="secondary-cta" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                Explore features
              </button>
            </div>

            <div className="hero-proof">
              <div><CheckCircle2 size={16} /> Easy to use</div>
              <div><ShieldCheck size={16} /> Team-ready</div>
              <div><Bell size={16} /> Real-time updates</div>
            </div>
          </div>

          <div className="hero-product">
            <div className="product-window">
              <div className="window-top">
                <div className="window-dots"><i /><i /><i /></div>
                <span>bugflow / issues</span>
                <span className="live"><b /> LIVE</span>
              </div>

              <div className="product-body">
                <aside>
                  <div className="side-logo"><Bug size={16} /> BugFlow</div>
                  <span className="side-active">Issues</span>
                  <span>Projects</span>
                  <span>Sprints</span>
                  <span>Analytics</span>
                  <div className="side-spacer" />
                  <span>Settings</span>
                </aside>

                <div className="issue-area">
                  <div className="issue-head">
                    <div>
                      <small>PROJECT / WEBSITE</small>
                      <h3>Open issues</h3>
                    </div>
                    <button>+ New issue</button>
                  </div>

                  <div className="issue-summary">
                    <div><b>24</b><span>Total</span></div>
                    <div><b>08</b><span>In progress</span></div>
                    <div><b>11</b><span>Resolved</span></div>
                  </div>

                  <div className="issue-list">
                    <div className="issue-row">
                      <span className="priority high">HIGH</span>
                      <div><b>Login button not responding</b><small>#BF-104 · Assigned to Rahul</small></div>
                      <span className="status progress">In progress</span>
                    </div>
                    <div className="issue-row">
                      <span className="priority medium">MED</span>
                      <div><b>Dashboard chart loads slowly</b><small>#BF-103 · Assigned to Aisha</small></div>
                      <span className="status review">Review</span>
                    </div>
                    <div className="issue-row">
                      <span className="priority low">LOW</span>
                      <div><b>Update empty state copy</b><small>#BF-102 · Assigned to Mohit</small></div>
                      <span className="status done">Resolved</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="floating-note note-one">
              <CheckCircle2 size={18} />
              <div><b>Issue resolved</b><span>2 min ago</span></div>
            </div>
            <div className="floating-note note-two">
              <BarChart3 size={18} />
              <div><b>+18% progress</b><span>This sprint</span></div>
            </div>
          </div>
        </section>

        <section className="home-stats" id="about">
          <div><strong>01</strong><span>One workspace</span></div>
          <div><strong>03</strong><span>Simple core modules</span></div>
          <div><strong>24/7</strong><span>Issue visibility</span></div>
          <div><strong>∞</strong><span>Team collaboration</span></div>
        </section>

        <section className="features-section" id="features">
          <div className="section-heading">
            <div>
              <span className="section-label">CORE FEATURES</span>
              <h2>Everything you need.<br /><em>Nothing you don't.</em></h2>
            </div>
            <p>A focused homepage and a focused product. BugFlow keeps the important parts of defect management easy to reach.</p>
          </div>

          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text, tone }) => (
              <article className={`feature-box ${tone}`} key={title}>
                <div className="feature-number">0{features.findIndex(f => f.title === title) + 1}</div>
                <div className="feature-icon"><Icon size={21} /></div>
                <h3>{title}</h3>
                <p>{text}</p>
                <ArrowRight className="feature-arrow" size={19} />
              </article>
            ))}
          </div>
        </section>

        <section className="process-section" id="process">
          <div className="process-intro">
            <span className="section-label">HOW IT WORKS</span>
            <h2>A cleaner way to<br /><em>close defects.</em></h2>
            <p>No complicated flow. Report it, assign it, resolve it.</p>
          </div>

          <div className="process-steps">
            {steps.map(([number, title, text]) => (
              <div className="process-step" key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span className="section-label">READY WHEN YOU ARE</span>
            <h2>Make bug tracking<br /><em>less complicated.</em></h2>
          </div>
          <button onClick={() => go(isAuthenticated ? dashboardPath() : '/register')}>
            {isAuthenticated ? 'Go to dashboard' : 'Create your workspace'}
            <ArrowRight size={18} />
          </button>
        </section>
      </main>

      <footer className="home-footer">
        <div className="footer-brand">
          <span className="home-brand-mark"><Bug size={17} /></span>
          <b>BugFlow</b>
          <span>Simple issue management for focused teams.</span>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} BugFlow. Built for better software.</div>
      </footer>
    </div>
  );
};

export default HomePage;
