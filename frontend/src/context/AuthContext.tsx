import React, { createContext, useCallback, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import type { LoginRequest, RegisterRequest, User } from '../types/auth';
import { storage } from '../utils/storage';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<string>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => storage.getUser<User>());
  const [token, setToken] = useState<string | null>(() => storage.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshMe = useCallback(async () => {
    const currentToken = storage.getToken();
    if (!currentToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }
    try {
      const currentUser = await authApi.getMe();
      setUser(currentUser);
      storage.setUser(currentUser);
    } catch {
      storage.clearAll();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();

    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [refreshMe]);

  const login = async (data: LoginRequest) => {
    setIsLoading(true);
    try {
      const tokenResp = await authApi.login(data);
      storage.setToken(tokenResp.access_token);
      storage.setUser(tokenResp.user);
      setToken(tokenResp.access_token);
      setUser(tokenResp.user);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterRequest): Promise<string> => {
    const resp = await authApi.register(data);
    return resp.message;
  };

  const logout = async () => {
    try {
      if (token) {
        await authApi.logout();
      }
    } catch {
      // Ignore errors on logout
    } finally {
      storage.clearAll();
      setUser(null);
      setToken(null);
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    register,
    logout,
    refreshMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
