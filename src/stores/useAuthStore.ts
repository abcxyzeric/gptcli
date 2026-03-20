import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AuthState,
  ConnectionStatus,
  LoginCredentials,
  RegisterCredentials,
} from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { secureStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { webAuthApi } from '@/services/webAuth';
import { useConfigStore } from './useConfigStore';
import { useUsageStatsStore } from './useUsageStatsStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  hasRestoredSession: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

type PersistedAuthStore = Partial<
  Pick<AuthStoreState, 'apiBase' | 'serverVersion' | 'serverBuildDate' | 'currentUser'>
>;

let restoreSessionPromise: Promise<boolean> | null = null;
const AUTH_STORE_VERSION = 3;

const getDefaultApiBase = () => normalizeApiBase(detectApiBaseFromLocation());

const configureApiClient = (apiBase: string) => {
  apiClient.setConfig({
    apiBase,
    managementKey: '',
  });
};

const resetDerivedStores = () => {
  useConfigStore.getState().clearCache();
  useUsageStatsStore.getState().clearUsageStats();
};

const syncBackendConnection = async () => {
  await useConfigStore.getState().fetchConfig(undefined, true);
};

const clearLegacyKeys = () => {
  secureStorage.migratePlaintextKeys(['apiBase', 'apiUrl']);
  secureStorage.removeItem('managementKey');
  localStorage.removeItem('isLoggedIn');
};

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      apiBase: getDefaultApiBase(),
      managementKey: '',
      currentUser: null,
      serverVersion: null,
      serverBuildDate: null,
      connectionStatus: 'disconnected',
      connectionError: null,
      hasRestoredSession: false,

      restoreSession: () => {
        if (restoreSessionPromise) {
          return restoreSessionPromise;
        }

        restoreSessionPromise = (async () => {
          clearLegacyKeys();
          const apiBase = getDefaultApiBase();
          configureApiClient(apiBase);

          try {
            const session = await webAuthApi.getSession();

            if (!session.authenticated || !session.user) {
              set({
                apiBase,
                managementKey: '',
                currentUser: null,
                isAuthenticated: false,
                connectionStatus: 'disconnected',
                connectionError: null,
                hasRestoredSession: true,
              });
              return false;
            }

            set({
              apiBase,
              managementKey: '',
              currentUser: session.user,
              isAuthenticated: true,
              connectionStatus: 'connecting',
              connectionError: null,
              hasRestoredSession: true,
            });

            try {
              await syncBackendConnection();
              set({
                connectionStatus: 'connected',
                connectionError: null,
              });
            } catch (error: unknown) {
              const message =
                error instanceof Error
                  ? error.message
                  : typeof error === 'string'
                    ? error
                    : 'Backend unavailable';
              set({
                connectionStatus: 'error',
                connectionError: message,
              });
            }

            return true;
          } catch {
            set({
              apiBase,
              managementKey: '',
              currentUser: null,
              isAuthenticated: false,
              connectionStatus: 'disconnected',
              connectionError: null,
              hasRestoredSession: true,
            });
            return false;
          }
        })();

        return restoreSessionPromise.finally(() => {
          restoreSessionPromise = null;
        });
      },

      login: async (credentials) => {
        const apiBase = getDefaultApiBase();
        configureApiClient(apiBase);
        set({
          connectionStatus: 'connecting',
          connectionError: null,
        });

        const user = await webAuthApi.login(credentials);

        set({
          apiBase,
          managementKey: '',
          currentUser: user,
          isAuthenticated: true,
          connectionStatus: 'connecting',
          connectionError: null,
          hasRestoredSession: true,
        });

        try {
          await syncBackendConnection();
          set({
            connectionStatus: 'connected',
            connectionError: null,
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Backend unavailable';
          set({
            connectionStatus: 'error',
            connectionError: message,
          });
        }
      },

      register: async (credentials) => {
        const apiBase = getDefaultApiBase();
        configureApiClient(apiBase);
        set({
          connectionStatus: 'connecting',
          connectionError: null,
        });

        const user = await webAuthApi.register(credentials);

        set({
          apiBase,
          managementKey: '',
          currentUser: user,
          isAuthenticated: true,
          connectionStatus: 'connecting',
          connectionError: null,
          hasRestoredSession: true,
        });

        try {
          await syncBackendConnection();
          set({
            connectionStatus: 'connected',
            connectionError: null,
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Backend unavailable';
          set({
            connectionStatus: 'error',
            connectionError: message,
          });
        }
      },

      logout: async () => {
        restoreSessionPromise = null;
        resetDerivedStores();
        try {
          await webAuthApi.logout();
        } catch {
          // Ignore logout API failures and clear local state anyway.
        }

        set({
          isAuthenticated: false,
          apiBase: getDefaultApiBase(),
          managementKey: '',
          currentUser: null,
          serverVersion: null,
          serverBuildDate: null,
          connectionStatus: 'disconnected',
          connectionError: null,
          hasRestoredSession: true,
        });

        clearLegacyKeys();
      },

      checkAuth: async () => {
        const apiBase = getDefaultApiBase();
        configureApiClient(apiBase);

        try {
          const session = await webAuthApi.getSession();
          if (!session.authenticated || !session.user) {
            set({
              isAuthenticated: false,
              currentUser: null,
              connectionStatus: 'disconnected',
              connectionError: null,
            });
            return false;
          }

          set({
            apiBase,
            managementKey: '',
            currentUser: session.user,
            isAuthenticated: true,
            connectionStatus: 'connecting',
            connectionError: null,
          });

          try {
            await syncBackendConnection();
            set({
              connectionStatus: 'connected',
              connectionError: null,
            });
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : typeof error === 'string'
                  ? error
                  : 'Backend unavailable';
            set({
              connectionStatus: 'error',
              connectionError: message,
            });
          }

          return true;
        } catch {
          set({
            isAuthenticated: false,
            currentUser: null,
            connectionStatus: 'disconnected',
            connectionError: null,
          });
          return false;
        }
      },

      updateServerVersion: (version, buildDate) => {
        set({ serverVersion: version || null, serverBuildDate: buildDate || null });
      },

      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error,
        });
      },
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
        },
      })),
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as PersistedAuthStore;
        return {
          apiBase: typeof state.apiBase === 'string' ? state.apiBase : getDefaultApiBase(),
          managementKey: '',
          currentUser: state.currentUser || null,
          serverVersion: typeof state.serverVersion === 'string' ? state.serverVersion : null,
          serverBuildDate:
            typeof state.serverBuildDate === 'string' ? state.serverBuildDate : null,
          isAuthenticated: false,
          connectionStatus: 'disconnected',
          connectionError: null,
          hasRestoredSession: false,
        };
      },
      partialize: (state) => ({
        apiBase: state.apiBase,
        currentUser: state.currentUser,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate,
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    void useAuthStore.getState().logout();
  });

  window.addEventListener(
    'server-version-update',
    ((event: CustomEvent) => {
      const detail = event.detail || {};
      useAuthStore
        .getState()
        .updateServerVersion(detail.version || null, detail.buildDate || null);
    }) as EventListener
  );
}
