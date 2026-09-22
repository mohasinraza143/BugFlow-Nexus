// UserRole values as returned by the backend.
// Backend enum: ADMIN | DEVELOPER | TESTER | USER
// DEVELOPER is a legacy role kept for backward compatibility.
// UI role semantics:
//   ADMIN     → Administrator (full system control)
//   TESTER    → Tester (investigates assigned defects)
//   USER      → User (submits & tracks their own issues)
//   DEVELOPER → Developer (legacy — treated same as TESTER in UI)
export type UserRole = 'ADMIN' | 'DEVELOPER' | 'TESTER' | 'USER';

/** Human-readable display label for each backend role. */
export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'TESTER':
      return 'Tester';
    case 'USER':
      return 'User';
    case 'DEVELOPER':
      return 'Developer (Legacy)';
    default:
      return String(role);
  }
}

/** Role description shown in UI context. */
export function getRoleDescription(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Full system access · Manages users, issues & assignments';
    case 'TESTER':
      return 'Investigates assigned defects · Updates issue progress';
    case 'USER':
      return 'Submits & tracks their own issues · Views progress';
    case 'DEVELOPER':
      return 'Resolves defects & manages workflow (legacy role)';
    default:
      return '';
  }
}

/** Returns true if the role can submit new issues. */
export function canReportIssues(role: UserRole): boolean {
  return role === 'USER' || role === 'ADMIN';
}

/** Returns true if the role works on assigned investigations. */
export function isInvestigator(role: UserRole): boolean {
  return role === 'TESTER' || role === 'DEVELOPER';
}

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
  message?: string;
}

export interface MessageResponse {
  message: string;
}

export interface LogoutResponse {
  message: string;
}

export interface ProfileUpdateRequest {
  full_name: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
