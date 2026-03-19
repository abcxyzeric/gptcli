import { normalizeApiBase } from './connection';

declare global {
  interface Window {
    __CLIPROXY_WEB_CONFIG__?: {
      defaultApiBase?: string;
    };
  }
}

export const getRuntimeDefaultApiBase = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  return normalizeApiBase(window.__CLIPROXY_WEB_CONFIG__?.defaultApiBase || '');
};

export const getApiBasePresetFromSearch = (search: string): string => {
  if (!search) {
    return '';
  }

  try {
    return normalizeApiBase(new URLSearchParams(search).get('apiBase') || '');
  } catch {
    return '';
  }
};

