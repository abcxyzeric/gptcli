import type { LoginCredentials, RegisterCredentials, SessionUser } from '@/types';

type AuthSessionResponse = {
  authenticated: boolean;
  user: SessionUser | null;
};

const AUTH_API_PREFIX = '/api/auth';

const toErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${AUTH_API_PREFIX}${path}`, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  return (await response.json()) as T;
};

export const webAuthApi = {
  getSession: () => requestJson<AuthSessionResponse>('/session', { method: 'GET' }),

  login: async (credentials: LoginCredentials) => {
    const response = await requestJson<{ user: SessionUser }>('/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    return response.user;
  },

  register: async (credentials: RegisterCredentials) => {
    const response = await requestJson<{ user: SessionUser }>('/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    return response.user;
  },

  logout: () =>
    requestJson<{ ok: boolean }>('/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  startOAuth: (provider: 'google' | 'discord') => {
    window.location.assign(`${AUTH_API_PREFIX}/oauth/${provider}/start`);
  },
};
