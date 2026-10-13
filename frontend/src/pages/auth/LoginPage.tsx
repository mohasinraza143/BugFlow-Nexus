import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
  CheckCircle2,
  Shield,
  UserCheck,
} from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { User, UserRole } from '../../types/auth';
import { storage } from '../../utils/storage';
import { BrandLogo } from '../../components/common/BrandLogo';
import { ThemeToggle } from '../../components/common/ThemeToggle';

interface RoleOption {
  id: UserRole;
  name: string;
  sub: string;
  placeholderEmail: string;
  icon: React.ReactNode;
  badgeClass: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'ADMIN',
    name: 'Admin',
    sub: 'System Administration',
    placeholderEmail: 'admin@company.com',
    icon: <Shield size={16} />,
    badgeClass: 'role-badge-admin',
  },
  {
    id: 'TESTER',
    name: 'QA Tester',
    sub: 'Defects & Verification',
    placeholderEmail: 'tester@company.com',
    icon: <CheckCircle2 size={16} />,
    badgeClass: 'role-badge-tester',
  },
  {
    id: 'USER',
    name: 'User',
    sub: 'Report & Track Issues',
    placeholderEmail: 'user@company.com',
    icon: <UserCheck size={16} />,
    badgeClass: 'role-badge-user',
  },
];

function getRoleRedirect(role: UserRole, requestedFrom: string): string {
  const isAdminPath = requestedFrom === '/admin' || requestedFrom.startsWith('/admin-dashboard');
  const isInvestigatorPath = requestedFrom === '/tester-issues' || requestedFrom.startsWith('/tester-dashboard');
  const canAccessRequestedPath =
    role === 'ADMIN'
      ? isAdminPath
      : role === 'TESTER' || role === 'DEVELOPER'
        ? isInvestigatorPath
        : !isAdminPath && !isInvestigatorPath;

  if (requestedFrom && requestedFrom !== '/' && requestedFrom !== '/login' && requestedFrom !== '/register' && canAccessRequestedPath) {
    return requestedFrom;
  }
  if (role === 'ADMIN') return '/admin-dashboard';
  if (role === 'TESTER' || role === 'DEVELOPER') return '/tester-dashboard';
  return '/dashboard';
}

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const loginState = location.state as { from?: { pathname: string }; successMessage?: string } | null;
  const rawFrom = loginState?.from?.pathname ?? '';
  const from = rawFrom !== '/' ? rawFrom : '';

  const [selectedRole, setSelectedRole] = useState<UserRole>('ADMIN');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSelectRole = (opt: RoleOption) => {
    setSelectedRole(opt.id);
    setError(null);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      const freshUser: User | null = storage.getUser<User>();
      const userRole: UserRole = freshUser?.role ?? 'USER';

      // Check if user's account role matches the selected role
      if (userRole !== selectedRole && !(selectedRole === 'TESTER' && userRole === 'DEVELOPER')) {
        storage.clearAll();
        setError(`This account is registered as ${userRole}, not ${selectedRole}. Please select the ${userRole === 'USER' ? 'User (Reporter)' : userRole} role.`);
        return;
      }

      navigate(getRoleRedirect(userRole, from), { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeOption = ROLE_OPTIONS.find((r) => r.id === selectedRole);

  return (
    <div className="auth-split-screen">
      {/* Top Tricolor Brand Accent Line */}
      <div className="brand-tricolor-stripe" />

      {/* Top Navbar */}
      <nav className="auth-top-nav">
        <div onClick={() => navigate('/')}>
          <BrandLogo size={32} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle />
          <button className="btn-nav-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </nav>

      <div className="auth-split-container">
        {/* Left Side: Enterprise Showcase */}
        <div className="auth-showcase-panel">
          <div className="showcase-content">
            <div className="showcase-badge">
              <Sparkles size={14} style={{ color: '#fbbf24' }} />
              <span>Enterprise Defect Telemetry</span>
            </div>

            <h2 className="showcase-heading">
              Accelerate QA execution with precision intelligence.
            </h2>

            <p className="showcase-description">
              Seamlessly coordinate agile sprints, auto-progress defect verification, and eliminate
              production bottlenecks with zero latency.
            </p>

            <div className="showcase-stats-grid">
              <div className="showcase-stat-box">
                <span className="stat-num">99.9%</span>
                <span className="stat-desc">Telemetry Uptime</span>
              </div>
              <div className="showcase-stat-box">
                <span className="stat-num">&lt; 30ms</span>
                <span className="stat-desc">Real-Time Sync</span>
              </div>
            </div>

            <div className="showcase-quote-card">
              <p>
                "<span className="brand-tricolor-text">BugFlow-Nexus</span>'s automated sprint rollover and live burndown intelligence transformed our QA release
                cycles completely."
              </p>
              <div className="quote-author">
                <span className="author-avatar">N</span>
                <div>
                  <b>Nexus Engineering Lead</b>
                  <span>FinTech Systems</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: High-Tech Login Form Card */}
        <div className="auth-form-panel">
          <div className="auth-card-modern">
            <div className="auth-header-block">
              <h1 className="auth-card-title">Welcome Back</h1>
              <p className="auth-card-subtitle">Sign in to your <span className="brand-tricolor-text" style={{ fontSize: '0.95rem' }}>BugFlow-Nexus</span> workspace</p>
            </div>

            {loginState?.successMessage && (
              <div className="alert-box alert-success" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} /> {loginState.successMessage}
              </div>
            )}

            {error && (
              <div className="alert-box alert-danger" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            {/* Role Selection Grid */}
            <div className="role-selector-wrap">
              <div className="role-selector-header">
                <span className="role-selector-label">Select Your Role</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click role to switch</span>
              </div>
              <div className="role-selector-grid">
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = selectedRole === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`role-card-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectRole(opt)}
                      aria-label={`Select role ${opt.name}`}
                    >
                      <div className={`role-card-icon ${opt.badgeClass}`}>
                        {opt.icon}
                      </div>
                      <div className="role-card-text">
                        <span className="role-card-name">{opt.name}</span>
                        <span className="role-card-sub">{opt.sub}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handlePasswordLogin} className="auth-form-element">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-with-icon">
                  <Mail size={16} className="input-icon-left" />
                  <input
                    type="email"
                    required
                    className="form-input"
                    placeholder={activeOption ? activeOption.placeholderEmail : 'name@company.com'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Password</label>
                </div>
                <div className="input-with-icon">
                  <Lock size={16} className="input-icon-left" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="form-input"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="input-icon-right"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn-auth-submit"
                disabled={isSubmitting}
              >
                <span>
                  {isSubmitting
                    ? 'Authenticating...'
                    : activeOption
                      ? `Sign In as ${activeOption.name}`
                      : 'Sign In to Workspace'}
                </span>
                <ArrowRight size={16} />
              </button>
            </form>

            <div className="auth-footer-link">
              <span>Don't have an account?</span>{' '}
              <Link to="/register">Create workspace account</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
