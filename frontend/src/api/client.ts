import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { storage } from '../utils/storage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});


// In-flight GET request deduplication & in-memory cache (5s TTL)
interface CacheEntry {
  data: any;
  status: number;
  statusText: string;
  headers: any;
  config: any;
  expires: number;
}

const apiGetCache = new Map<string, CacheEntry>();
const inFlightGetRequests = new Map<string, Promise<any>>();

export const clearApiCache = () => {
  apiGetCache.clear();
};

const originalGet = apiClient.get.bind(apiClient);

apiClient.get = (function <T = any, R = AxiosResponse<T>, D = any>(
  url: string,
  config?: AxiosRequestConfig<D>
): Promise<R> {
  const isNoCache = config?.headers && (config.headers as any)['Cache-Control'] === 'no-cache';
  if (isNoCache) {
    return originalGet(url, config) as Promise<R>;
  }

  const token = storage.getToken() || '';
  const cacheKey = `${url}?${JSON.stringify(config?.params || {})}:${token}`;

  const cached = apiGetCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return Promise.resolve(cached as unknown as R);
  }

  const existingPromise = inFlightGetRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise as Promise<R>;
  }

  const requestPromise = originalGet(url, config)
    .then((response) => {
      apiGetCache.set(cacheKey, {
        data: (response as any).data,
        status: (response as any).status,
        statusText: (response as any).statusText,
        headers: (response as any).headers,
        config: (response as any).config,
        expires: Date.now() + 5000,
      });
      return response;
    })
    .finally(() => {
      inFlightGetRequests.delete(cacheKey);
    });

  inFlightGetRequests.set(cacheKey, requestPromise);
  return requestPromise as Promise<R>;
}) as typeof apiClient.get;

// Request Interceptor: Attach JWT token if present and clear cache on mutations
apiClient.interceptors.request.use(
  (config) => {
    const method = config.method?.toLowerCase();
    if (method && ['post', 'put', 'patch', 'delete'].includes(method)) {
      clearApiCache();
    }
    const token = storage.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle errors and unauthorized access
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string | { msg?: string }[] }>) => {
    if (error.response?.status === 401) {
      // Clear token on 401 if it wasn't the login request itself
      const requestUrl = error.config?.url || '';
      if (!requestUrl.includes('/auth/login')) {
        storage.clearAll();
        clearApiCache();
        // Dispatch custom event so AuthContext can handle logout gracefully
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data) {
      if (typeof data === 'string') return data;
      if (data.detail) {
        if (typeof data.detail === 'string') return data.detail;
        if (Array.isArray(data.detail) && data.detail.length > 0) {
          return data.detail
            .map((err: { msg?: string } | string) =>
              typeof err === 'object' && err?.msg ? err.msg : String(err)
            )
            .join(', ');
        }
      }
      if (data.message && typeof data.message === 'string') {
        return data.message;
      }
      if (data.error && typeof data.error === 'string') {
        return data.error;
      }
    }
    if (error.response?.status) {
      const status = error.response.status;
      if (status === 403) return 'You do not have permission to perform this action.';
      if (status === 404) return 'The requested resource was not found.';
      if (status === 409) return 'A resource with these details already exists.';
      if (error.response.statusText) {
        return `${status}: ${error.response.statusText}`;
      }
    }
    if (error.message === 'Network Error') {
      return 'Unable to reach backend server. Please check your network connection or try again later.';
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
