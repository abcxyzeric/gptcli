/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, LoginCredentials, ConnectionStatus } from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { secureStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { useConfigStore } from './useConfigStore';
import { useUsageStatsStore } from './useUsageStatsStore';
import {
  detectApiBaseFromLocation,
  isSecureManagementApiBase,
  normalizeApiBase
} from '@/utils/connection';

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

let restoreSessionPromise: Promise<boolean> | null = null;
const AUTH_STORE_VERSION = 2;

type PersistedAuthStore = Partial<
  Pick<AuthStoreState, 'apiBase' | 'serverVersion' | 'serverBuildDate'>
>;

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      serverVersion: null,
      serverBuildDate: null,
      connectionStatus: 'disconnected',
      connectionError: null,

      // 恢复会话并自动登录
      restoreSession: () => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          secureStorage.migratePlaintextKeys(['apiBase', 'apiUrl']);
          secureStorage.removeItem('managementKey');
          localStorage.removeItem('isLoggedIn');

          const legacyBase =
            secureStorage.getItem<string>('apiBase') ||
            secureStorage.getItem<string>('apiUrl', { encrypt: true });

          const detectedBase = detectApiBaseFromLocation();
          const { apiBase } = get();
          const candidateBase = normalizeApiBase(apiBase || legacyBase || detectedBase);
          const resolvedBase = isSecureManagementApiBase(candidateBase)
            ? candidateBase
            : detectedBase;

          set({
            apiBase: resolvedBase,
            managementKey: '',
            isAuthenticated: false,
            connectionStatus: 'disconnected',
            connectionError: null
          });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: '' });

          return false;
        })();

        return restoreSessionPromise;
      },

      // 登录
      login: async (credentials) => {
        const apiBase = normalizeApiBase(credentials.apiBase);
        const managementKey = credentials.managementKey.trim();

        if (!isSecureManagementApiBase(apiBase)) {
          throw new Error('Insecure management API base is not allowed. Use HTTPS or localhost over HTTP.');
        }

        try {
          set({ connectionStatus: 'connecting' });

          // 配置 API 客户端
          apiClient.setConfig({
            apiBase,
            managementKey
          });

          // 测试连接 - 获取配置
          await useConfigStore.getState().fetchConfig(undefined, true);

          // 登录成功
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            connectionStatus: 'connected',
            connectionError: null
          });
          localStorage.removeItem('isLoggedIn');
          secureStorage.removeItem('managementKey');
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Connection failed';
          set({
            connectionStatus: 'error',
            connectionError: message || 'Connection failed'
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        restoreSessionPromise = null;
        useConfigStore.getState().clearCache();
        useUsageStatsStore.getState().clearUsageStats();
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          serverVersion: null,
          serverBuildDate: null,
          connectionStatus: 'disconnected',
          connectionError: null
        });
        localStorage.removeItem('isLoggedIn');
        secureStorage.removeItem('managementKey');
      },

      // 检查认证状态
      checkAuth: async () => {
        const { managementKey, apiBase } = get();

        if (!managementKey || !apiBase) {
          return false;
        }

        try {
          // 重新配置客户端
          apiClient.setConfig({ apiBase, managementKey });

          // 验证连接
          await useConfigStore.getState().fetchConfig();

          set({
            isAuthenticated: true,
            connectionStatus: 'connected'
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error'
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate) => {
        set({ serverVersion: version || null, serverBuildDate: buildDate || null });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error
        });
      }
    }),
    {
      name: STORAGE_KEY_AUTH,
      version: AUTH_STORE_VERSION,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const data = secureStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          secureStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          secureStorage.removeItem(name);
        }
      })),
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as PersistedAuthStore;
        return {
          apiBase: typeof state.apiBase === 'string' ? state.apiBase : '',
          managementKey: '',
          serverVersion: typeof state.serverVersion === 'string' ? state.serverVersion : null,
          serverBuildDate:
            typeof state.serverBuildDate === 'string' ? state.serverBuildDate : null,
          isAuthenticated: false,
          connectionStatus: 'disconnected',
          connectionError: null
        };
      },
      partialize: (state) => ({
        apiBase: state.apiBase,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate
      })
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    useAuthStore.getState().logout();
  });

  window.addEventListener(
    'server-version-update',
    ((e: CustomEvent) => {
      const detail = e.detail || {};
      useAuthStore.getState().updateServerVersion(detail.version || null, detail.buildDate || null);
    }) as EventListener
  );
}
