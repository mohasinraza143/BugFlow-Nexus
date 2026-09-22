/**
 * Profile Picture & Avatar Management Utility
 * Supports custom image uploads (Base64 data URLs) and preset avatar identifiers.
 */

export interface AvatarPreset {
  id: string;
  name: string;
  emoji: string;
  bgGradient: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'nexus-core', name: 'Nexus Core', emoji: '💎', bgGradient: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' },
  { id: 'cyber-shield', name: 'Cyber SecOps', emoji: '🛡️', bgGradient: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' },
  { id: 'qa-hunter', name: 'QA Hunter', emoji: '🎯', bgGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  { id: 'quantum-bolt', name: 'Quantum Lead', emoji: '⚡', bgGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
  { id: 'ai-architect', name: 'AI Architect', emoji: '🤖', bgGradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' },
  { id: 'rocket-lead', name: 'Release Captain', emoji: '🚀', bgGradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' },
  { id: 'cyber-cat', name: 'Cyber Phantom', emoji: '🐱', bgGradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' },
  { id: 'swift-fox', name: 'Swift Agile', emoji: '🦊', bgGradient: 'linear-gradient(135deg, #f97316 0%, #eab308 100%)' },
];

export const AVATAR_EVENT_NAME = 'bugflow_avatar_update';

export function getUserAvatar(userId?: number | string): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(`bugflow_avatar_${userId}`);
  } catch {
    return null;
  }
}

export function setUserAvatar(userId: number | string, avatarValue: string): void {
  try {
    localStorage.setItem(`bugflow_avatar_${userId}`, avatarValue);
    window.dispatchEvent(new CustomEvent(AVATAR_EVENT_NAME, { detail: { userId, avatar: avatarValue } }));
  } catch (e) {
    console.error('Failed to save user avatar:', e);
  }
}

export function removeUserAvatar(userId: number | string): void {
  try {
    localStorage.removeItem(`bugflow_avatar_${userId}`);
    window.dispatchEvent(new CustomEvent(AVATAR_EVENT_NAME, { detail: { userId, avatar: null } }));
  } catch (e) {
    console.error('Failed to remove user avatar:', e);
  }
}
