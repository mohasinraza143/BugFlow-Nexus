import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getRoleLabel } from '../../types/auth';

import { NotificationCenter } from '../notifications/NotificationCenter';
import { ThemeToggle } from '../common/ThemeToggle';
import { UserAvatar } from '../common/UserAvatar';

interface HeaderProps {
  onToggleMobile: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobile }) => {
  const { user } = useAuth();
  const location = useLocation();

  const getPageTitle = (pathname: string) => {
    if (pathname.startsWith('/dashboard')) return 'Dashboard';
    if (pathname.startsWith('/projects')) return 'Projects';
    if (pathname.startsWith('/issues/')) return 'Issue Details';
    if (pathname.startsWith('/issues')) return 'Issues & Defects';
    if (pathname.startsWith('/analytics')) return 'Analytics & Reporting';
    if (pathname.startsWith('/admin')) return 'Admin Center';
    if (pathname.startsWith('/profile')) return 'My Profile';
    return 'BugFlow-Nexus';
  };

  /** Avatar circle color keyed by role */
  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'ADMIN':      return '#f97316';  // orange
      case 'TESTER':     return '#22c55e';  // green
      case 'USER':       return '#6366f1';  // indigo
      case 'DEVELOPER':  return '#818cf8';  // indigo-light (legacy)
      default:           return '#6366f1';
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <button
          onClick={onToggleMobile}
          className="mobile-menu-btn"
          aria-label="Toggle menu"
        >
          <Menu size={22} />
        </button>
        <span className="header-title-breadcrumb">
          {getPageTitle(location.pathname)}
        </span>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Light/Dark Mode Switcher */}
        <ThemeToggle />

        {/* Real-time Notification Bell Center */}
        {user && <NotificationCenter />}

        {/* User Pill — shows name and role */}
        {user && (
          <Link
            to="/profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
            }}
          >
            {/* Dynamic Avatar */}
            <UserAvatar
              userId={user.id}
              fullName={user.full_name}
              role={user.role}
              size={28}
            />

            {/* Name + Role label */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '600', lineHeight: 1.2 }}>
                {user.full_name.split(' ')[0]}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: getRoleColor(user.role),
                  fontWeight: '700',
                  lineHeight: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {getRoleLabel(user.role)}
              </span>
            </div>
          </Link>
        )}
      </div>
    </header>
  );
};
