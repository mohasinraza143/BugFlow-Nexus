import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User as UserIcon,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { BrandLogo } from '../../components/common/BrandLogo';
import { ThemeToggle } from '../../components/common/ThemeToggle';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [role, setRole] = useState<'USER' | 'TESTER' | 'ADMIN'>('TESTER');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
        role: role as any,
      });
      navigate('/login', {
        state: {
          successMessage: 'Account created successfully! Sign in to get started.',
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
    if (password.length < 8) return { label: 'Too short', color: '#ef4444', width: '25%' };
    if (password.length < 10) return { label: 'Medium', color: '#f59e0b', width: '50%' };
    const hasUpper = /[A-Z]/.test(password);
    const hasNum = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const score = [hasUpper, hasNum, hasSpecial].filter(Boolean).length;
    if (score <= 1) return { label: 'Good', color: '#6366f1', width: '75%' };
    return { label: 'Strong', color: '#10b981', width: '100%' };
  };

  const strength = passwordStrength();

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
        {/* Left Side: Enterprise Benefits */}
        <div className="auth-showcase-panel">
          <div className="showcase-content">
            <div className="showcase-badge">
              <Sparkles size={14} style={{ color: '#fbbf24' }} />
              <span>Join Modern QA Teams</span>
            </div>

            <h2 className="showcase-heading">
              Build with confidence. Ship with speed.
            </h2>

            <p className="showcase-description">
              Get immediate access to automated sprint tracking, live burndown metrics, and
              real-time collaboration tailored specifically for engineers, QA testers, and admins.
            </p>

            <div className="feature-checklist-modern">
              <div className="check-row">
                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                <span>Automated Sprint Life-cycle & Rollover</span>
              </div>
              <div className="check-row">
                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                <span>Real-Time Notifications & Deep-Linking</span>
              </div>
              <div className="check-row">
                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                <span>Tailored QA Verification & Executive Admin Portals</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Register Form */}
        <div className="auth-form-panel">
          <div className="auth-card-modern">
            <div className="auth-header-block">
              <h1 className="auth-card-title">Create Account</h1>
              <p className="auth-card-subtitle">Get started with your free <span className="brand-tricolor-text" style={{ fontSize: '0.95rem' }}>BugFlow-Nexus</span> workspace</p>
            </div>

            {error && (
              <div className="alert-box alert-danger" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form-element">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div className="input-with-icon">
                  <UserIcon size={16} className="input-icon-left" />
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Alex Morgan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Work Email</label>
                <div className="input-with-icon">
                  <Mail size={16} className="input-icon-left" />
                  <input
                    type="email"
                    required
                    className="form-input"
                    placeholder="alex@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Role Selection Tabs */}
              <div className="form-group">
                <label className="form-label">Select Your Account Role</label>
                <div className="role-selector-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className={`role-pill-btn ${role === 'TESTER' ? 'active' : ''}`}
                    onClick={() => setRole('TESTER')}
                  >
                    🔍 QA Tester
                  </button>
                  <button
                    type="button"
                    className={`role-pill-btn ${role === 'USER' ? 'active' : ''}`}
                    onClick={() => setRole('USER')}
                  >
                    👤 User
                  </button>
                  <button
                    type="button"
                    className={`role-pill-btn ${role === 'ADMIN' ? 'active' : ''}`}
                    onClick={() => setRole('ADMIN')}
                  >
                    👑 Admin
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-with-icon">
                  <Lock size={16} className="input-icon-left" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="form-input"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="input-icon-right"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div style={{ marginTop: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>Strength</span>
                      <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.2rem' }}>
                      <div style={{ width: strength.width, height: '100%', background: strength.color, transition: 'all 0.3s ease' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="input-with-icon">
                  <Lock size={16} className="input-icon-left" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="form-input"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-auth-submit"
                disabled={isSubmitting}
              >
                <span>{isSubmitting ? 'Creating Account...' : 'Complete Registration'}</span>
                <ArrowRight size={16} />
              </button>
            </form>

            <div className="auth-footer-link">
              <span>Already have an account?</span>{' '}
              <Link to="/login">Sign in here</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
