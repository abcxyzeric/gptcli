/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';
import { isSafeExternalUrl } from '@/utils/connection';

export type OAuthProvider =
  | 'codex'
  | 'anthropic'
  | 'antigravity'
  | 'gemini-cli'
  | 'kimi'
  | 'qwen';

export interface OAuthStartResponse {
  url: string;
  state?: string;
  codeVerifier?: string;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

export interface IFlowCookieAuthResponse {
  status: 'ok' | 'error';
  error?: string;
  saved_path?: string;
  email?: string;
  expired?: string;
  type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureOAuthStartResponse(value: unknown): OAuthStartResponse {
  if (!isRecord(value) || typeof value.url !== 'string' || !value.url.trim()) {
    throw new Error('OAuth endpoint returned invalid data. Check that API base points to a real CLIProxyAPI backend.');
  }

  const url = value.url.trim();
  if (!isSafeExternalUrl(url)) {
    throw new Error('OAuth endpoint returned an unsafe authorization URL.');
  }

  const result: OAuthStartResponse = { url };
  if (typeof value.state === 'string' && value.state.trim()) {
    result.state = value.state.trim();
  }
  if (typeof value.code_verifier === 'string' && value.code_verifier.trim()) {
    result.codeVerifier = value.code_verifier.trim();
  }
  return result;
}

function ensureOAuthStatusResponse(value: unknown): { status: 'ok' | 'wait' | 'error'; error?: string } {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new Error('OAuth status endpoint returned invalid data. Check that API base points to a real CLIProxyAPI backend.');
  }

  if (value.status !== 'ok' && value.status !== 'wait' && value.status !== 'error') {
    throw new Error('OAuth status endpoint returned an unknown status.');
  }

  return {
    status: value.status,
    ...(typeof value.error === 'string' && value.error ? { error: value.error } : {})
  };
}

const WEBUI_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli'];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  'gemini-cli': 'gemini'
};

export const oauthApi = {
  async startAuth(provider: OAuthProvider, options?: { projectId?: string }) {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === 'gemini-cli' && options?.projectId) {
      params.project_id = options.projectId;
    }
    const response = await apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params: Object.keys(params).length ? params : undefined
    });
    return ensureOAuthStartResponse(response);
  },

  async getAuthStatus(state: string) {
    const response = await apiClient.get<{ status: 'ok' | 'wait' | 'error'; error?: string }>(`/get-auth-status`, {
      params: { state }
    });
    return ensureOAuthStatusResponse(response);
  },

  submitCallback: (
    provider: OAuthProvider,
    redirectUrl: string,
    options?: { tokenResponse?: Record<string, unknown> }
  ) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: callbackProvider,
      redirect_url: redirectUrl,
      ...(options?.tokenResponse ? { token_response: options.tokenResponse } : {})
    });
  },

  /** iFlow cookie 认证 */
  iflowCookieAuth: (cookie: string) =>
    apiClient.post<IFlowCookieAuthResponse>('/iflow-auth-url', { cookie })
};
