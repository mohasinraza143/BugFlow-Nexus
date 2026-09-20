import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bug,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Menu,
  Mail,
  Shield,
  X,
} from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { User, UserRole } from '../../types/auth';
import { storage } from '../../utils/storage';


/**
 * Determines post-login redirect path based on user role.
 * ADMIN → /admin (their primary workspace)
 * TESTER / DEVELOPER → /dashboard
 * If the user had tried to access a specific page (from), honour it.
 */
function getRoleRedirect(role: UserRole, requestedFrom: string): string {
  const isAdminPath = requestedFrom === '/admin' || requestedFrom.startsWith('/admin-dashboard');
  const isInvestigatorPath = requestedFrom === '/tester-issues' || requestedFrom.startsWith('/tester-dashboard');
  const canAccessRequestedPath = role === 'ADMIN' ? isAdminPath : role === 'TESTER' || role === 'DEVELOPER' ? isInvestigatorPath : !isAdminPath && !isInvestigatorPath;

  if (requestedFrom && requestedFrom !== '/' && requestedFrom !== '/login' && requestedFrom !== '/register' && canAccessRequestedPath) {
    return requestedFrom;
  }
  if (role === 'ADMIN') return '/admin-dashboard';
  if (role === 'TESTER' || role === 'DEVELOPER') return '/tester-dashboard';
  return '/dashboard';
}

export const LoginPage: React.FC = () => {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const loginState = location.state as { from?: { pathname: string }; role?: UserRole } | null;

  const rawFrom = loginState?.from?.pathname ?? '';
  const from = rawFrom !== '/' ? rawFrom : '';


  // Password login fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(loginState?.role ?? 'TESTER');
  // Shared state
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      // login() internally calls /auth/login and stores the user+token
      await login({ email: email.trim(), password });
      // Read the freshly stored user to determine role-based redirect
      const freshUser: User | null = storage.getUser<User>();
      const role: UserRole = freshUser?.role ?? 'TESTER';
      if (role !== selectedRole) {
        await logout();
        setError(`This account is registered as ${role}. Please select the correct role.`);
        return;
      }
      navigate(getRoleRedirect(role, from), { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="login-page">
      <nav className="home-nav auth-home-nav">
        <div className="home-nav-inner">
          <button className="home-brand" onClick={() => navigate('/')}>
            <span className="home-brand-mark"><Bug size={19} /></span>
            <span>BugFlow</span>
          </button>

          <div className={`home-links ${menuOpen ? 'open' : ''}`}>
            <button onClick={() => navigate('/')}>Home</button>
            <button onClick={() => navigate('/#features')}>Features</button>
            <button onClick={() => navigate('/#process')}>How it works</button>
          </div>

          <div className="home-actions">
            <button className="home-start" onClick={() => navigate('/register')}>
              Get started <ArrowRight size={16} />
            </button>
          </div>

          <button
            className="home-menu"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      <div className="auth-page-wrapper login-modern">
        <div className="auth-card" style={{ maxWidth: '440px' }}>
        {/* Header */}
        <div className="auth-header">
          <div className="brand-logo auth-logo-center">
            <Bug size={24} />
          </div>
          <h1 className="auth-title">BugTracker</h1>
          <p className="auth-subtitle">
            Software Issue Tracking & Resolution Platform
          </p>
        </div>

        {/* Auth Tabs Toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-surface)',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '7px',
              border: 'none',
              cursor: 'default',
              fontWeight: '600',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              background: 'var(--primary)',
              color: '#fff',
            }}
          >
            <Lock size={14} />
            Login
          </button>
          <button
            type="button"
            onClick={() => navigate('/register')}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
              background: 'transparent',
              color: 'var(--text-secondary)',
            }}
          >
            Create Account
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label className="form-label" htmlFor="login-role">Login As</label>
          <select
            id="login-role"
            className="form-input"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
            disabled={isSubmitting}
          >
            <option value="USER">User</option>
            <option value="TESTER">Tester</option>
            {/* <option value="DEVELOPER">Developer</option> */}
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* ── PASSWORD LOGIN FORM ── */}
        <form onSubmit={handlePasswordLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-email"
                type="email"
                required
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                autoComplete="email"
                autoFocus
              />
              <Mail
                size={16}
                style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="form-input"
                  style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
                <KeyRound
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{
                    position: 'absolute',
                    right: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 0,
                    display: 'flex',
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim() || !password}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>


        {/* Footer links */}
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
          }}
        >
          Don't have an account?{' '}
          <Link to="/register" style={{ fontWeight: '600', color: 'var(--primary)' }}>
            Create Account
          </Link>
        </div>

        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <Shield size={12} />
          <span>Secure authentication · BugTracker</span>
        </div>
        </div>
      </div>
    </div>
  );
};
