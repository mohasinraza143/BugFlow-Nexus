import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User as UserIcon,
  UserCheck,
  X,
} from 'lucide-react';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { storage } from '../../utils/storage';
import type { UserRole } from '../../types/auth';
import { BrandLogo } from '../common/BrandLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

interface RoleOption {
  id: UserRole;
  name: string;
  sub: string;
  placeholderEmail: string;
  icon: React.ReactNode;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: 'ADMIN',
    name: 'Admin',
    sub: 'Full Governance',
    placeholderEmail: 'admin@gmail.com',
    icon: <Shield size={15} />,
  },
  {
    id: 'TESTER',
    name: 'QA Tester',
    sub: 'Defects & Sprints',
    placeholderEmail: 'tester@gmail.com',
    icon: <CheckCircle2 size={15} />,
  },
  {
    id: 'USER',
    name: 'User',
    sub: 'Report & Track',
    placeholderEmail: 'user@gmail.com',
    icon: <UserCheck size={15} />,
  },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
}) => {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [selectedRole, setSelectedRole] = useState<UserRole>('ADMIN');

  // Form Fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Status
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMessage(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRoleSelect = (roleId: UserRole) => {
    setSelectedRole(roleId);
    setError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      onClose();
      // Redirect based on authenticated user role or selected role
      const loggedInRole = storage.getUser<{ role?: UserRole }>()?.role || selectedRole;
      if (loggedInRole === 'ADMIN') navigate('/admin-dashboard');
      else if (loggedInRole === 'TESTER') navigate('/tester-dashboard');
      else navigate('/dashboard');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
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
        role: selectedRole,
      });
      setSuccessMessage('Account created successfully! Please sign in.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="modal-container"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-surface, #0e1322)',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #94a3b8)',
            cursor: 'pointer',
            padding: '0.4rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <X size={18} />
        </button>

        {/* Modal Top Header */}
        <div
          style={{
            padding: '1.5rem 1.75rem 1rem',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'inline-flex', marginBottom: '0.6rem' }}>
            <BrandLogo size={32} edition="NEXUS" />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem', color: 'var(--text-primary, #f8fafc)' }}>
            {mode === 'login' ? 'Welcome Back' : 'Create Your Workspace'}
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted, #94a3b8)', margin: 0 }}>
            {mode === 'login'
              ? 'Select your role and enter credentials to continue'
              : 'Join the defect intelligence & sprint ecosystem'}
          </p>

          {/* Mode Switch Tabs */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-surface-elevated, #151c30)',
              borderRadius: '8px',
              padding: '0.25rem',
              marginTop: '1rem',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '0.45rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                background: mode === 'login' ? 'var(--primary, #6366f1)' : 'transparent',
                color: mode === 'login' ? '#ffffff' : 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '0.45rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                background: mode === 'register' ? 'var(--primary, #6366f1)' : 'transparent',
                color: mode === 'register' ? '#ffffff' : 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.75rem 1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Alerts */}
          {error && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                borderRadius: '8px',
                fontSize: '0.825rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                borderRadius: '8px',
                fontSize: '0.825rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckCircle2 size={15} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Role Selector Grid */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #94a3b8)', marginBottom: '0.45rem', letterSpacing: '0.05em' }}>
              SELECT ROLE
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {ROLE_OPTIONS.map((opt) => {
                const isSelected = selectedRole === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleRoleSelect(opt.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '0.5rem 0.25rem',
                      borderRadius: '8px',
                      border: isSelected
                        ? '1.5px solid var(--primary, #6366f1)'
                        : '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                      background: isSelected
                        ? 'rgba(99, 102, 241, 0.15)'
                        : 'var(--bg-surface-elevated, #151c30)',
                      cursor: 'pointer',
                      color: isSelected ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #cbd5e1)',
                    }}
                  >
                    <div style={{ color: isSelected ? 'var(--primary, #6366f1)' : 'var(--text-muted, #94a3b8)', marginBottom: '0.2rem' }}>
                      {opt.icon}
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{opt.name}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted, #94a3b8)', textAlign: 'center' }}>{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={ROLE_OPTIONS.find((r) => r.id === selectedRole)?.placeholderEmail || 'name@example.com'}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      borderRadius: '8px',
                      background: 'var(--bg-input, #0b0f19)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    style={{
                      width: '100%',
                      padding: '0.65rem 2.25rem 0.65rem 2.25rem',
                      borderRadius: '8px',
                      background: 'var(--bg-input, #0b0f19)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
                }}
              >
                <span>{isSubmitting ? 'Authenticating...' : `Sign In as ${ROLE_OPTIONS.find((r) => r.id === selectedRole)?.name || 'User'}`}</span>
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      borderRadius: '8px',
                      background: 'var(--bg-input, #0b0f19)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                  Work Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      borderRadius: '8px',
                      background: 'var(--bg-input, #0b0f19)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                  Password (8+ chars)
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{
                      width: '100%',
                      padding: '0.65rem 2.25rem 0.65rem 2.25rem',
                      borderRadius: '8px',
                      background: 'var(--bg-input, #0b0f19)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      borderRadius: '8px',
                      background: 'var(--bg-input, #0b0f19)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #f8fafc)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                }}
              >
                <span>{isSubmitting ? 'Creating Account...' : 'Create Account Free'}</span>
                <Sparkles size={16} />
              </button>
            </form>
          )}

          {/* Footer toggle link */}
          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.825rem', color: 'var(--text-muted, #94a3b8)' }}>
            {mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  style={{ background: 'none', border: 'none', color: '#818cf8', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  style={{ background: 'none', border: 'none', color: '#818cf8', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Sign In instead
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
