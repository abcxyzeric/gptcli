export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  providers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  confirmPassword: string;
  displayName: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  apiBase: string;
  managementKey: string;
  currentUser: SessionUser | null;
  serverVersion: string | null;
  serverBuildDate: string | null;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ConnectionInfo {
  status: ConnectionStatus;
  lastCheck: Date | null;
  error: string | null;
}
