import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bug,
  FlaskConical,
  FolderGit2,
  LayoutDashboard,
  LogOut,
  Shield,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getRoleLabel, getRoleDescription } from '../../types/auth';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { user, logout } = useAuth();

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="brand-logo">
            <Bug size={20} />
          </div>
          <span className="brand-title">BugTracker</span>
        </div>

        {/* User Card */}
        {user && (
          <div className="sidebar-user-card">
            <div className="user-avatar-circle">{getInitials(user.full_name)}</div>
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
            </>
          )}

          {/* ADMIN: Full Management Navigation */}
          {user?.role === 'ADMIN' && (
            <>
              <NavLink
                to="/issues"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <Bug size={18} />
                <span>Issues &amp; Defects</span>
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
                to="/analytics"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <BarChart3 size={18} />
                <span>Analytics</span>
              </NavLink>

              <NavLink
                to="/admin-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onCloseMobile}
              >
                <LayoutDashboard size={18} />
                <span>Admin Dashboard</span>
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
            </>
          )}


          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onCloseMobile}
          >
            <UserCheck size={18} />
            <span>My Profile</span>
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
