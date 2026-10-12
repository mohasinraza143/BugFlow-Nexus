import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bug,
  FlaskConical,
  FolderGit2,
  Home,
  LayoutDashboard,
  LogOut,
  Shield,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getRoleLabel, getRoleDescription } from '../../types/auth';

import { BrandLogo } from '../common/BrandLogo';
import { UserAvatar } from '../common/UserAvatar';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { user, logout } = useAuth();

  const getRoleBadgeClass = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'role-badge-admin';
      case 'TESTER':
        return 'role-badge-tester';
      case 'DEVELOPER':
        return 'role-badge-developer';
      case 'USER':
        return 'role-badge-user';
      default:
        return 'role-badge-tester';
    }
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Top Tricolor Brand Accent Line */}
        <div className="brand-tricolor-stripe" />

        {/* Brand Header */}
        <div className="sidebar-header" style={{ padding: '0 1.25rem' }}>
          <BrandLogo size={32} edition="NEXUS" />
        </div>

        {/* User Card */}
        {user && (
          <div className="sidebar-user-card">
            <UserAvatar
              userId={user.id}
              fullName={user.full_name}
              role={user.role}
              size={38}
            />
            <div className="user-info-text">
              <div className="user-display-name" title={user.full_name}>
                {user.full_name}
              </div>
              <span className={`user-role-badge ${getRoleBadgeClass(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.1rem',
                  lineHeight: 1.3,
                }}
              >
                {getRoleDescription(user.role)}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          {/* USER: User Dashboard & Issues */}
          {user?.role === 'USER' && (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/issues"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <Bug size={18} />
                <span>My Issues</span>
              </NavLink>
              <NavLink
                to="/analytics"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <BarChart3 size={18} />
                <span>Analytics</span>
              </NavLink>
            </>
          )}

          {/* ADMIN: Full Management Navigation */}
          {user?.role === 'ADMIN' && (
            <>
              <NavLink
                to="/admin-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <LayoutDashboard size={18} />
                <span>Admin Dashboard</span>
              </NavLink>

              <NavLink
                to="/projects"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <FolderGit2 size={18} />
                <span>Projects</span>
              </NavLink>

              <NavLink
                to="/issues"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <Bug size={18} />
                <span>Issues &amp; Defects</span>
              </NavLink>

              <NavLink
                to="/analytics"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <BarChart3 size={18} />
                <span>Analytics</span>
              </NavLink>

              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <Shield size={18} />
                <span>Admin Management</span>
              </NavLink>
            </>
          )}

          {/* TESTER / DEVELOPER: Tester-specific Navigation */}
          {(user?.role === 'TESTER' || user?.role === 'DEVELOPER') && (
            <>
              <NavLink
                to="/tester-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <FlaskConical size={18} />
                <span>Tester Dashboard</span>
              </NavLink>

              <NavLink
                to="/tester-issues"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <Bug size={18} />
                <span>My Assigned Issues</span>
              </NavLink>

              <NavLink
                to="/analytics"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <BarChart3 size={18} />
                <span>Analytics</span>
              </NavLink>
            </>
          )}


          {/* Nexus Copilot AI Assistant Quick Launch */}
          <button
            type="button"
            className="nav-link"
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.18))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              color: '#818cf8',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              marginTop: '0.4rem',
              marginBottom: '0.4rem',
            }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('copilot:open'));
              onCloseMobile();
            }}
            title="Launch Nexus Copilot (Alt + C)"
          >
            <Sparkles size={18} color="#818cf8" />
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Nexus Copilot</span>
              <span style={{ fontSize: '0.62rem', background: '#6366f1', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>AI</span>
            </span>
          </button>

          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onCloseMobile}
          >
            <UserCheck size={18} />
            <span>My Profile</span>
          </NavLink>

          <NavLink
            to="/"
            className={({ isActive }) => `nav-link ${isActive && window.location.pathname === '/' ? 'active' : ''}`}
            onClick={onCloseMobile}
            style={{ marginTop: 'auto' }}
          >
            <Home size={18} />
            <span>Go to Home Page</span>
          </NavLink>
        </nav>

        {/* Footer Logout */}
        <div className="sidebar-footer">
          <button
            onClick={() => logout()}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
