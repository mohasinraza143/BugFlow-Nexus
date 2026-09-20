import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bug,
  Menu,
  X,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  User,
} from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

/**
 * RegisterPage — public user registration.
 *
 * The backend UserRole enum: ADMIN | DEVELOPER | TESTER | USER.
 * ADMIN cannot be registered publicly.
 *
 * Two roles available for public registration:
 *   - "User" (issue reporter)     → maps to backend USER role
 *   - "Tester" (investigator)     → maps to backend TESTER role
 */

type UIRole = 'USER' | 'TESTER_ROLE' | 'ADMIN';

const ROLE_OPTIONS = [
  { id: 'USER' as UIRole, label: 'User', backendRole: 'USER' as const },
  { id: 'TESTER_ROLE' as UIRole, label: 'Tester', backendRole: 'TESTER' as const },
];

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [selectedUIRole, setSelectedUIRole] = useState<UIRole>('USER');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const getBackendRole = (): 'USER' | 'TESTER' | 'ADMIN' =>
    ROLE_OPTIONS.find((o) => o.id === selectedUIRole)!.backendRole;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please complete all required fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role: getBackendRole() as any, // Cast to any to bypass the mismatch between frontend types and new API
      });
      // Registration successful. Backend auto-activates, now we log in.
      navigate('/login', {
        state: {
          successMessage: 'Registration successful. Please sign in.',
          email: email.trim(),
          role: getBackendRole(),
        },
      });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordStrength = (): { label: string; color: string; width: string } => {
    if (password.length === 0) return { label: '', color: 'transparent', width: '0%' };
    if (password.length < 8) return { label: 'Too short', color: '#ef4444', width: '20%' };
    if (password.length < 10) return { label: 'Weak', color: '#f97316', width: '40%' };
    const hasUpper = /[A-Z]/.test(password);
    const hasNum = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const score = [hasUpper, hasNum, hasSpecial].filter(Boolean).length;
    if (score === 0) return { label: 'Fair', color: '#eab308', width: '55%' };
    if (score === 1) return { label: 'Good', color: '#22c55e', width: '75%' };
    return { label: 'Strong', color: '#10b981', width: '100%' };
  };

  const strength = passwordStrength();

  return (
    <div className="register-page">
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
            <button className="home-login" onClick={() => navigate('/login')}>
              Login
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

    <div className="auth-page-wrapper register-simple">
      <div className="auth-card" style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div className="auth-header">
          <div className="brand-logo auth-logo-center">
            <Bug size={24} />
          </div>
          <h1 className="auth-title">Create Your Account</h1>
          <p className="auth-subtitle">
            Join BugTracker to report, track, and resolve defects
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
            onClick={() => navigate('/login')}
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
            Login
          </button>
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
            Create Account
          </button>
        </div>

        {/* Role Selection */}
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label className="form-label" htmlFor="register-role">
            Role
          </label>
          <select
            id="register-role"
            className="form-input"
            value={selectedUIRole}
            onChange={(e) => setSelectedUIRole(e.target.value as UIRole)}
            disabled={isSubmitting}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="register-name"
                type="text"
                required
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSubmitting}
                autoComplete="name"
                autoFocus
              />
              <User
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

          {/* Email */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-email">
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="register-email"
                type="email"
                required
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                autoComplete="email"
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

          {/* Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-password">
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
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
            {/* Password strength bar */}
            {password.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}>
                <div
                  style={{
                    height: '3px',
                    background: 'var(--border-subtle)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: strength.width,
                      background: strength.color,
                      borderRadius: '2px',
                      transition: 'width 0.3s, background 0.3s',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.72rem', color: strength.color, fontWeight: '600' }}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-confirm">
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="register-confirm"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                className="form-input"
                style={{
                  paddingLeft: '2.5rem',
                  paddingRight: '2.5rem',
                  borderColor:
                    confirmPassword && confirmPassword !== password
                      ? 'var(--danger)'
                      : undefined,
                }}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
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
                onClick={() => setShowConfirmPassword((p) => !p)}
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
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== password && (
              <span style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: '600' }}>
                Passwords do not match
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !fullName.trim() ||
              !email.trim() ||
              !password ||
              password !== confirmPassword ||
              password.length < 8
            }
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="spin" />
                Creating Account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
          }}
        >
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: '600', color: 'var(--primary)' }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
    </div>
  );
};
