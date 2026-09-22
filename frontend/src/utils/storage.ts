const TOKEN_KEY = 'bugtracker_jwt_token';
const USER_KEY = 'bugtracker_user_data';

export const storage = {
  getToken: (): string | null => {
    return sessionStorage.getItem(TOKEN_KEY);
  },
  setToken: (token: string): void => {
    sessionStorage.setItem(TOKEN_KEY, token);
  },
  removeToken: (): void => {
    sessionStorage.removeItem(TOKEN_KEY);
  },
  getUser: <T>(): T | null => {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setUser: <T>(user: T): void => {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  removeUser: (): void => {
    sessionStorage.removeItem(USER_KEY);
  },
  clearAll: (): void => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};
