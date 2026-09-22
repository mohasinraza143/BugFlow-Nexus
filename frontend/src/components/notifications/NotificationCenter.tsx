import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Target,
  Bug,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { notificationsApi } from '../../api/notifications';
import type { NotificationItem, NotificationType } from '../../types/notification';
import { formatRelativeTime } from '../../utils/formatters';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD' | 'ISSUES' | 'SPRINTS'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Poll unread count
  const fetchUnreadCount = async () => {
    try {
      const count = await notificationsApi.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // Ignore background network blips
    }
  };

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const params: any = { page_size: 50 };
      if (activeTab === 'UNREAD') {
        params.unread_only = true;
      }
      const data = await notificationsApi.list(params);
      setNotifications(data.items);
      // Re-sync unread count
      const unread = data.items.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 6000);
    const handleFocus = () => fetchUnreadCount();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, activeTab]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleDelete = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await notificationsApi.delete(id);
      const target = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      await handleMarkAsRead(n.id);
    }
    setIsOpen(false);

    // Deep link navigation
    if (n.entity_type === 'ISSUE' && n.entity_id) {
      navigate(`/issues/${n.entity_id}`);
    } else if (n.entity_type === 'SPRINT') {
      navigate(`/projects`);
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'ISSUE_ASSIGNED':
      case 'ISSUE_REPORTED':
        return <Bug size={16} style={{ color: '#818cf8' }} />;
      case 'ISSUE_STATUS_CHANGED':
      case 'ISSUE_REOPENED':
        return <RefreshCw size={16} style={{ color: '#fbbf24' }} />;
      case 'ISSUE_RESOLVED':
        return <CheckCircle2 size={16} style={{ color: '#34d399' }} />;
      case 'ISSUE_COMMENTED':
      case 'ISSUE_MENTIONED':
        return <MessageSquare size={16} style={{ color: '#38bdf8' }} />;
      case 'SPRINT_STARTED':
      case 'SPRINT_ENDED':
        return <Target size={16} style={{ color: '#a78bfa' }} />;
      case 'SPRINT_OVERDUE':
        return <AlertTriangle size={16} style={{ color: '#f87171' }} />;
      default:
        return <Sparkles size={16} style={{ color: '#94a3b8' }} />;
    }
  };

  const filteredItems = notifications.filter((n) => {
    if (activeTab === 'UNREAD') return !n.is_read;
    if (activeTab === 'ISSUES') return n.entity_type === 'ISSUE' || n.notification_type.startsWith('ISSUE');
    if (activeTab === 'SPRINTS') return n.entity_type === 'SPRINT' || n.notification_type.startsWith('SPRINT');
    return true;
  });

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Header Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="header-icon-btn"
        aria-label="Notifications"
        style={{
          position: 'relative',
          cursor: 'pointer',
          background: isOpen ? 'var(--bg-surface-hover)' : 'var(--bg-surface-elevated)',
        }}
      >
        <Bell size={18} style={{ color: unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }} />
        {unreadCount > 0 && (
          <span
            className="icon-unread-indicator"
            style={{
              background: '#ef4444',
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)',
              animation: 'sprint-pulse 2s infinite',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: '380px',
            maxWidth: '92vw',
            background: 'var(--bg-surface)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--border-subtle)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'dropdown-fade-in 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-surface-elevated)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                  }}
                >
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAll}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    padding: '0.3rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--primary-subtle)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Read All</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  padding: '0.3rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '0.5rem 0.75rem',
              gap: '0.35rem',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface-elevated)',
            }}
          >
            {[
              { key: 'ALL', label: 'All' },
              { key: 'UNREAD', label: 'Unread' },
              { key: 'ISSUES', label: 'Issues' },
              { key: 'SPRINTS', label: 'Sprints' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  flex: 1,
                  padding: '0.35rem 0',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  color: activeTab === tab.key ? '#ffffff' : 'var(--text-secondary)',
                  background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notifications Scroll List */}
          <div
            style={{
              maxHeight: '380px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isLoading ? (
              <div style={{ padding: '2.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <RefreshCw size={20} className="spin" style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                <div>Loading live alerts...</div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div
                style={{
                  padding: '3rem 1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.75rem',
                    color: '#818cf8',
                  }}
                >
                  <Sparkles size={22} />
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                  You're all caught up!
                </div>
                <div style={{ fontSize: '0.78rem' }}>No new notifications in this category.</div>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  style={{
                    padding: '0.85rem 1.1rem',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    background: item.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.08)',
                    transition: 'background 0.15s ease',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = item.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.08)';
                  }}
                >
                  {/* Left Icon */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '0.1rem',
                    }}
                  >
                    {getNotificationIcon(item.notification_type)}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.15rem' }}>
                      <span
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: item.is_read ? 500 : 700,
                          color: item.is_read ? 'var(--text-secondary)' : 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </span>
                      {!item.is_read && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#6366f1',
                            boxShadow: '0 0 6px #6366f1',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.message}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {formatRelativeTime(item.created_at)}
                      </span>

                      {/* Item Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                        {!item.is_read && (
                          <button
                            onClick={(e) => handleMarkAsRead(item.id, e)}
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--primary)',
                              fontWeight: 600,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.1rem 0.3rem',
                            }}
                            title="Mark read"
                          >
                            Read
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(item.id, e)}
                          style={{
                            color: 'var(--text-muted)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.1rem 0.3rem',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Delete notification"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '0.65rem 1.25rem',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface-elevated)',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            Live synced with <span className="brand-tricolor-text" style={{ fontSize: '0.78rem' }}>BugFlow-Nexus</span> Engine
          </div>
        </div>
      )}
    </div>
  );
};
