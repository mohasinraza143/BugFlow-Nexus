import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  User as UserIcon,
  XCircle,
  Zap,
} from 'lucide-react';
import { authApi } from '../api/auth';
import { getApiErrorMessage } from '../api/client';
import { issuesApi } from '../api/issues';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Modal } from '../components/common/Modal';
import { UserAvatar } from '../components/common/UserAvatar';
import { useAuth } from '../hooks/useAuth';
import type { User as UserType } from '../types/auth';
import { getRoleDescription, getRoleLabel } from '../types/auth';
import {
  AVATAR_PRESETS,
  getUserAvatar,
  removeUserAvatar,
  setUserAvatar,
} from '../utils/avatar';
import { formatDate } from '../utils/formatters';

export const ProfilePage: React.FC = () => {
  const { user, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserType | null>(user);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Avatar Studio State
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(() => (user ? getUserAvatar(user.id) : null));
  const [avatarSuccessMsg, setAvatarSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete Account State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // Edit Profile Form State
  const [fullName, setFullName] = useState<string>(user?.full_name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState<boolean>(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPass, setShowCurrentPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [showConfirmPass, setShowConfirmPass] = useState<boolean>(false);
  const [isChangingPass, setIsChangingPass] = useState<boolean>(false);
  const [passSuccessMsg, setPassSuccessMsg] = useState<string | null>(null);
  const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null);

  // Quick Stats
  const [userIssueCount, setUserIssueCount] = useState<number>(0);

  const fetchProfileData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [profileData, issuesData] = await Promise.all([
        authApi.getMe(),
        issuesApi.list({ page_size: 1 }).catch(() => ({ total: 0 })),
      ]);
      setProfile(profileData);
      setFullName(profileData.full_name);
      setUserIssueCount(issuesData.total || 0);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  // Handle Edit Profile Save
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg(null);
    setProfileErrorMsg(null);

    const trimmed = fullName.trim();
    if (!trimmed) {
      setProfileErrorMsg('Full name cannot be empty.');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const updatedUser = await authApi.updateProfile({ full_name: trimmed });
      setProfile(updatedUser);
      await refreshMe();
      setProfileSuccessMsg('Profile updated successfully!');
      setTimeout(() => setProfileSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setProfileErrorMsg(getApiErrorMessage(err));
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Handle Change Password Submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassSuccessMsg(null);
    setPassErrorMsg(null);

    if (!currentPassword) {
      setPassErrorMsg('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPassErrorMsg('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassErrorMsg('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPassErrorMsg('New password must be different from current password.');
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPassSuccessMsg(res.message || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPassSuccessMsg(null), 5000);
    } catch (err: unknown) {
      setPassErrorMsg(getApiErrorMessage(err));
    } finally {
      setIsChangingPass(false);
    }
  };

  // Handle Delete Account Submit
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErrorMsg(null);

    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteErrorMsg('Please type DELETE to confirm permanent account deletion.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await authApi.deleteAccount();
      await logout();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      setDeleteErrorMsg(getApiErrorMessage(err));
      setIsDeletingAccount(false);
    }
  };

  // Handle Avatar Selection & Upload
  const handleSelectPreset = (presetId: string) => {
    if (!profile) return;
    setUserAvatar(profile.id, presetId);
    setCurrentAvatar(presetId);
    setAvatarSuccessMsg('Avatar changed successfully!');
    setTimeout(() => setAvatarSuccessMsg(null), 3000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size exceeds 2MB limit. Please select a smaller photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setUserAvatar(profile.id, dataUrl);
        setCurrentAvatar(dataUrl);
        setAvatarSuccessMsg('Custom profile picture uploaded successfully!');
        setTimeout(() => setAvatarSuccessMsg(null), 3000);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetAvatar = () => {
    if (!profile) return;
    removeUserAvatar(profile.id);
    setCurrentAvatar(null);
    setAvatarSuccessMsg('Reset avatar to default initials.');
    setTimeout(() => setAvatarSuccessMsg(null), 3000);
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading user profile & account settings..." />;
  }

  if (error || !profile) {
    return <ErrorMessage message={error || 'Failed to load profile.'} onRetry={fetchProfileData} />;
  }

  const roleLabel = getRoleLabel(profile.role);
  const roleDesc = getRoleDescription(profile.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1100px' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile & Account Settings</h1>
          <p className="page-subtitle">Manage your personal avatar, credentials, and role privileges</p>
        </div>

        <button onClick={fetchProfileData} className="btn btn-secondary btn-sm" title="Refresh Profile">
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Top Identity & Account Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* User Identity Card & Avatar Studio */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserIcon size={18} color="#818cf8" />
              <h3 className="card-title">User Information & Avatar</h3>
            </div>
            <span className="badge" style={{ backgroundColor: 'var(--primary-subtle)', color: '#818cf8', fontWeight: '700' }}>
              {profile.role}
            </span>
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              {/* Dynamic User Avatar */}
              <div style={{ position: 'relative' }}>
                <UserAvatar
                  userId={profile.id}
                  fullName={profile.full_name}
                  role={profile.role}
                  size={68}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    border: '2px solid var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                  title="Upload profile picture"
                >
                  <Camera size={13} />
                </button>
              </div>

              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {profile.full_name}
                </h2>
                <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                  {profile.email}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Account ID #{profile.id}
                </span>
              </div>
            </div>

            {/* Avatar Studio Controls */}
            <div
              style={{
                padding: '0.85rem',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sparkles size={14} color="#818cf8" /> Avatar Presets & Custom Photo
                </span>
                {currentAvatar && (
                  <button
                    type="button"
                    onClick={handleResetAvatar}
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'pointer',
                    }}
                    title="Reset to default initials"
                  >
                    <RotateCcw size={11} /> Reset Default
                  </button>
                )}
              </div>

              {avatarSuccessMsg && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '0.4rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.78rem',
                    marginBottom: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <CheckCircle2 size={13} />
                  <span>{avatarSuccessMsg}</span>
                </div>
              )}

              {/* Preset Avatars Row */}
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = currentAvatar === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: preset.bgGradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '17px',
                        cursor: 'pointer',
                        border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: isSelected ? '0 0 10px rgba(99, 102, 241, 0.8)' : 'none',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 0.15s ease',
                      }}
                      title={preset.name}
                    >
                      {preset.emoji}
                    </button>
                  );
                })}
              </div>

              {/* Upload Custom File Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', gap: '0.4rem' }}
              >
                <Upload size={13} />
                <span>Upload Custom Photo (JPG, PNG)</span>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Mail size={15} /> Primary Email
                </span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{profile.email}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShieldCheck size={15} /> Email Verification
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    color: profile.is_email_verified ? '#34d399' : '#f87171',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                  }}
                >
                  {profile.is_email_verified ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {profile.is_email_verified ? 'Verified (Secure)' : 'Unverified'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Shield size={15} /> Account Status
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    color: profile.is_active ? '#34d399' : '#f87171',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                  }}
                >
                  {profile.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {profile.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={15} /> Member Since
                </span>
                <span style={{ color: 'var(--text-primary)', fontSize: '0.825rem' }}>
                  {formatDate(profile.created_at)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={15} /> Defect Activity
                </span>
                <span style={{ fontWeight: '700', color: '#818cf8' }}>
                  {userIssueCount} {profile.role === 'USER' ? 'Reported Issues' : 'Tracked Items'}
                </span>
              </div>
            </div>
          </div>

          <div className="card-footer">
            <button
              onClick={() => logout()}
              className="btn btn-outline-danger btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <LogOut size={14} />
              <span>Sign Out from this Device</span>
            </button>
          </div>
        </div>

        {/* Role Privileges & Access Overview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={18} color="#818cf8" />
                <h3 className="card-title">Role Privileges & Access</h3>
              </div>
            </div>

            <div className="card-body" style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{roleLabel}</span>
                  <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
                    RBAC Level
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0 0' }}>
                  {roleDesc}
                </p>
              </div>

              <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
                {profile.role === 'USER' && (
                  <>
                    <li>Report new defects with reproduction steps, environment, and evidence.</li>
                    <li>Track real-time defect investigation status from assigned testers.</li>
                    <li>Verify tester solutions and 1-click confirm resolution as Closed.</li>
                    <li>Reopen defects with detailed feedback if issues persist.</li>
                    <li>Export personal defect analytics and audit reports to PDF and CSV.</li>
                  </>
                )}
                {profile.role === 'TESTER' && (
                  <>
                    <li>Investigate assigned defects across projects.</li>
                    <li>Advance defect investigation status (`In Development`, `In Review`, `In Testing`).</li>
                    <li>Mark defects resolved with comprehensive fix summaries.</li>
                    <li>Participate in issue discussion trails and manage attachments.</li>
                  </>
                )}
                {profile.role === 'ADMIN' && (
                  <>
                    <li>Full organization-wide administration and project management.</li>
                    <li>Assign defects to testers and reassign workloads.</li>
                    <li>Manage user accounts, roles, and activation status.</li>
                    <li>View global defect analytics and developer productivity metrics.</li>
                  </>
                )}
                {profile.role === 'DEVELOPER' && (
                  <>
                    <li>Legacy developer role — full access to assigned defect workflows.</li>
                    <li>Investigate and resolve assigned defects.</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          <div className="card-footer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Role permissions are enforced server-side via PostgreSQL RBAC.
          </div>
        </div>
      </div>

      {/* Profile Edit & Password Change Two-Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* 1. Edit Profile Details Form */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={18} color="#818cf8" />
              <h3 className="card-title">Edit Profile Information</h3>
            </div>
          </div>

          <form onSubmit={handleProfileSubmit}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {profileSuccessMsg && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '0.65rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {profileErrorMsg && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    padding: '0.65rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <XCircle size={16} />
                  <span>{profileErrorMsg}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="profile-full-name">
                  Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="profile-full-name"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Vinay Kumar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="profile-email-readonly">
                  Email Address (Identity)
                </label>
                <input
                  id="profile-email-readonly"
                  type="email"
                  disabled
                  className="form-input"
                  value={profile.email}
                  style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--bg-surface-elevated)' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Email is locked to account authentication.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="profile-role-readonly">
                  Assigned System Role
                </label>
                <input
                  id="profile-role-readonly"
                  type="text"
                  disabled
                  className="form-input"
                  value={profile.role}
                  style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--bg-surface-elevated)' }}
                />
              </div>
            </div>

            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isUpdatingProfile || fullName.trim() === profile.full_name}
                className="btn btn-primary"
              >
                <Save size={15} />
                <span>{isUpdatingProfile ? 'Saving Changes...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* 2. Change Password & Security Form */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <KeyRound size={18} color="#818cf8" />
              <h3 className="card-title">Change Password</h3>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {passSuccessMsg && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '0.65rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{passSuccessMsg}</span>
                </div>
              )}

              {passErrorMsg && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    padding: '0.65rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <XCircle size={16} />
                  <span>{passErrorMsg}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="current-pass">
                  Current Password <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="current-pass"
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    className="form-input"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-pass">
                  New Password <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="new-pass"
                    type={showNewPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="form-input"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirm-pass">
                  Confirm New Password <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirm-pass"
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="form-input"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isChangingPass || !currentPassword || !newPassword || !confirmPassword}
                className="btn btn-primary"
              >
                <Lock size={15} />
                <span>{isChangingPass ? 'Updating Password...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Danger Zone Card ────────────────────────────── */}
      <div
        className="card"
        style={{
          border: '1px solid rgba(239, 68, 68, 0.35)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div
          className="card-header"
          style={{
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} color="#f87171" />
            <h3 className="card-title" style={{ color: '#f87171' }}>
              Danger Zone
            </h3>
          </div>
          <span
            className="badge"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              fontWeight: '700',
            }}
          >
            Irreversible
          </span>
        </div>

        <div className="card-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>
                Delete Personal Account
              </h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '600px' }}>
                Permanently remove your personal credentials, profile data, and session tokens. Any reported issues will be archived according to organization retention rules.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText('');
                setDeleteErrorMsg(null);
                setIsDeleteModalOpen(true);
              }}
              className="btn btn-outline-danger"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Trash2 size={15} />
              <span>Delete My Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Delete Account Confirmation Modal ─────────── */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Permanently Delete Account"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: '#f87171',
              fontSize: '0.85rem',
              lineHeight: '1.5',
            }}
          >
            <strong>Warning: This action is permanent and cannot be undone.</strong>
            <p style={{ margin: '0.35rem 0 0 0' }}>
              Your account details, active sessions, and personal notification preferences will be permanently wiped.
            </p>
          </div>

          {deleteErrorMsg && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                padding: '0.65rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <XCircle size={16} />
              <span>{deleteErrorMsg}</span>
            </div>
          )}

          <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="delete-confirm-input">
                To confirm deletion, please type <strong style={{ color: 'var(--danger)' }}>DELETE</strong> below:
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                className="form-input"
                placeholder="Type DELETE to confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn btn-secondary"
                disabled={isDeletingAccount}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Trash2 size={15} />
                <span>{isDeletingAccount ? 'Deleting Account...' : 'Permanently Delete'}</span>
              </button>
            </div>
          </form>
        </div>
      </Modal>

    </div>
  );
};
