import React, { useEffect, useState } from 'react';
import { AVATAR_EVENT_NAME, AVATAR_PRESETS, getUserAvatar } from '../../utils/avatar';

interface UserAvatarProps {
  userId?: number;
  fullName?: string;
  role?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  fullName = 'User',
  role = 'USER',
  size = 36,
  className = '',
  style = {},
}) => {
  const [avatar, setAvatar] = useState<string | null>(() => getUserAvatar(userId));

  useEffect(() => {
    setAvatar(getUserAvatar(userId));

    const handleAvatarUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ userId: number | string; avatar: string | null }>;
      if (customEvent.detail && String(customEvent.detail.userId) === String(userId)) {
        setAvatar(customEvent.detail.avatar);
      }
    };

    window.addEventListener(AVATAR_EVENT_NAME, handleAvatarUpdate);
    return () => {
      window.removeEventListener(AVATAR_EVENT_NAME, handleAvatarUpdate);
    };
  }, [userId]);

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getRoleGradient = (userRole?: string) => {
    switch (userRole) {
      case 'ADMIN':
        return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
      case 'TESTER':
        return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'DEVELOPER':
        return 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
      case 'USER':
      default:
        return 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
    }
  };

  const preset = AVATAR_PRESETS.find((p) => p.id === avatar);

  if (preset) {
    return (
      <div
        className={`user-avatar-component ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: preset.bgGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${Math.round(size * 0.52)}px`,
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          userSelect: 'none',
          ...style,
        }}
        title={fullName}
      >
        <span>{preset.emoji}</span>
      </div>
    );
  }

  if (avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http'))) {
    return (
      <img
        src={avatar}
        alt={fullName}
        className={`user-avatar-component ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '2px solid rgba(99, 102, 241, 0.4)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          ...style,
        }}
        title={fullName}
      />
    );
  }

  return (
    <div
      className={`user-avatar-component ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: getRoleGradient(role),
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: `${Math.max(11, Math.round(size * 0.38))}px`,
        letterSpacing: '-0.02em',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        userSelect: 'none',
        ...style,
      }}
      title={fullName}
    >
      {getInitials(fullName)}
    </div>
  );
};

export default UserAvatar;
