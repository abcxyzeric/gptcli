import { AppEnv } from './http';
import { getPortalAuthFile, listPortalAuthFiles, upsertPortalAuthFile } from './portal';

const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const PROCESSING_STATUS = '__processing__';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CODEX_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback';

const CLAUDE_AUTH_URL = 'https://claude.ai/oauth/authorize';
const CLAUDE_TOKEN_URL = 'https://api.anthropic.com/v1/oauth/token';
const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_REDIRECT_URI = 'http://localhost:54545/callback';

const ANTIGRAVITY_CLIENT_ID = [
  '1071006060591-',
  'tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
].join('');
const ANTIGRAVITY_CLIENT_SECRET = ['GOCSPX-', 'K58FWR486LdLJ1mLB8sXC4z6qDAf'].join('');
const ANTIGRAVITY_CALLBACK_PORT = 51121;
const ANTIGRAVITY_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ANTIGRAVITY_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANTIGRAVITY_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const ANTIGRAVITY_LOAD_CODE_ASSIST_URL =
  'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
const ANTIGRAVITY_ONBOARD_USER_URL =
  'https://cloudcode-pa.googleapis.com/v1internal:onboardUser';
const ANTIGRAVITY_REDIRECT_URI = `http://localhost:${ANTIGRAVITY_CALLBACK_PORT}/oauth-callback`;
const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
];
const ANTIGRAVITY_HEADERS = {
  'user-agent': 'google-api-nodejs-client/9.15.1',
  'x-goog-api-client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'client-metadata':
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

const GEMINI_CLIENT_ID = [
  '681255809395-',
  'oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
].join('');
const GEMINI_CLIENT_SECRET = ['GOCSPX-', '4uHgMPm-1o7Sk-geV6Cu5clXFsxl'].join('');
const GEMINI_REDIRECT_URI = 'http://localhost:8085/oauth2callback';
const GEMINI_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GEMINI_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GEMINI_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const GEMINI_PROJECTS_URL = 'https://cloudresourcemanager.googleapis.com/v1/projects';
const GEMINI_SERVICE_USAGE_URL = 'https://serviceusage.googleapis.com';
const GEMINI_REQUIRED_SERVICES = ['cloudaicompanion.googleapis.com'];
const GEMINI_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
const GEMINI_USER_AGENT =
  'GeminiCLI/1.0.0 (Cloudflare Pages Functions; +https://gptcli.pages.dev)';

const QWEN_DEVICE_CODE_URL = 'https://chat.qwen.ai/api/v1/oauth2/device/code';
const QWEN_TOKEN_URL = 'https://chat.qwen.ai/api/v1/oauth2/token';
const QWEN_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
const QWEN_SCOPE = 'openid profile email model.completion';
const QWEN_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const KIMI_OAUTH_HOST = 'https://auth.kimi.com';
const KIMI_DEVICE_CODE_URL = `${KIMI_OAUTH_HOST}/api/oauth/device_authorization`;
const KIMI_TOKEN_URL = `${KIMI_OAUTH_HOST}/api/oauth/token`;
const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';

const IFLOW_API_KEY_URL = 'https://platform.iflow.cn/api/openapi/apikey';

export type UpstreamOAuthProvider =
  | 'anthropic'
  | 'codex'
  | 'gemini'
  | 'antigravity'
  | 'qwen'
  | 'kimi'
  | 'iflow';

type OAuthSessionRow = {
  state: string;
  user_id: string;
  provider: string;
  status: string | null;
  payload_ciphertext: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type OAuthCallbackPayload = {
  redirectUrl?: string;
  code?: string;
  state?: string;
  error?: string;
  receivedAt: string;
};

type OAuthSessionPayload = {
  redirectUri?: string;
  projectId?: string;
  pkce?: {
    codeVerifier: string;
    codeChallenge: string;
  };
  callback?: OAuthCallbackPayload;
  device?: {
    deviceCode: string;
    userCode?: string;
    verificationUri?: string;
    verificationUriComplete?: string;
    expiresIn?: number;
    interval?: number;
    codeVerifier?: string;
    deviceId?: string;
  };
};

type OAuthSessionRecord = {
  state: string;
  userId: string;
  provider: UpstreamOAuthProvider;
  status: string;
  payload: OAuthSessionPayload;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type OAuthStartResponse = {
  status: 'ok';
  url: string;
  state: string;
};

type OAuthStatusResponse = {
  status: 'ok' | 'wait' | 'error';
  error?: string;
};

type OAuthCallbackInput = {
  provider: string;
  redirectUrl?: string;
  code?: string;
  state?: string;
  error?: string;
};

type IFlowCookieResponse = {
  status: 'ok' | 'error';
  error?: string;
  saved_path?: string;
  email?: string;
  expired?: string;
  type?: string;
};

type CodexJwtClaims = {
  email?: string;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
    chatgpt_plan_type?: string;
    chatgpt_subscription_active_start?: unknown;
    chatgpt_subscription_active_until?: unknown;
  };
};

type GeminiTokenShape = {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

const base64UrlEncode = (value: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < value.length; index += chunkSize) {
    binary += String.fromCharCode(...value.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const randomToken = (bytes = 24) => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
};

const buildState = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomToken(10)}`;

const normalizePlanTypeForFilename = (planType: string) =>
  planType
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join('-');

const buildCodexFileName = (email: string, planType: string, hashedAccountId: string) => {
  const safeEmail = email || `unknown-${Date.now()}`;
  const normalizedPlan = normalizePlanTypeForFilename(planType);
  if (!normalizedPlan) {
    return `codex-${safeEmail}.json`;
  }
  if (normalizedPlan === 'team' && hashedAccountId) {
    return `codex-${hashedAccountId}-${safeEmail}-${normalizedPlan}.json`;
  }
  return `codex-${safeEmail}-${normalizedPlan}.json`;
};

const buildGeminiFileName = (email: string, projectId: string) => {
  const safeEmail = email || `unknown-${Date.now()}`;
  const normalizedProject = projectId.trim();
  if (!normalizedProject || normalizedProject.includes(',') || normalizedProject.toLowerCase() === 'all') {
    return `gemini-${safeEmail}-all.json`;
  }
  return `gemini-${safeEmail}-${normalizedProject}.json`;
};

const buildAntigravityFileName = (email: string) =>
  email.trim() ? `antigravity-${email.trim()}.json` : 'antigravity.json';

const normalizeProvider = (value: string): UpstreamOAuthProvider => {
  switch (value.trim().toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return 'anthropic';
    case 'codex':
    case 'openai':
      return 'codex';
    case 'gemini':
    case 'google':
    case 'gemini-cli':
      return 'gemini';
    case 'antigravity':
    case 'anti-gravity':
      return 'antigravity';
    case 'qwen':
      return 'qwen';
    case 'kimi':
      return 'kimi';
    case 'iflow':
    case 'i-flow':
      return 'iflow';
    default:
      throw new Error('unsupported provider');
  }
};

export const validateOAuthState = (state: string) => {
  const trimmed = state.trim();
  if (!trimmed) {
    throw new Error('invalid state');
  }
  if (trimmed.length > 128) {
    throw new Error('invalid state');
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('invalid state');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error('invalid state');
  }
  return trimmed;
};

const getDataSecret = (env: AppEnv) => {
  const secret = normalizeString(env.DATA_ENCRYPTION_SECRET || env.SESSION_SECRET);
  if (!secret) {
    throw new Error('Thiếu DATA_ENCRYPTION_SECRET để bảo vệ phiên OAuth upstream.');
  }
  return secret;
};

let cachedSecretValue = '';
let cachedSecretKeyPromise: Promise<CryptoKey> | null = null;

const getSecretKey = (env: AppEnv) => {
  const secret = getDataSecret(env);
  if (secret === cachedSecretValue && cachedSecretKeyPromise) {
    return cachedSecretKeyPromise;
  }

  cachedSecretValue = secret;
  cachedSecretKeyPromise = (async () => {
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
    return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']);
  })();

  return cachedSecretKeyPromise;
};

const encryptText = async (env: AppEnv, text: string, aad: string) => {
  const key = await getSecretKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(aad),
    },
    key,
    encoder.encode(text)
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`;
};

const decryptText = async (env: AppEnv, payload: string, aad: string) => {
  const [ivRaw, encryptedRaw] = String(payload || '').split('.');
  if (!ivRaw || !encryptedRaw) {
    throw new Error('invalid encrypted payload');
  }
  const key = await getSecretKey(env);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlDecode(ivRaw),
      additionalData: encoder.encode(aad),
    },
    key,
    base64UrlDecode(encryptedRaw)
  );
  return decoder.decode(decrypted);
};

const encryptPayload = (env: AppEnv, payload: OAuthSessionPayload, aad: string) =>
  encryptText(env, JSON.stringify(payload), aad);

const decryptPayload = async (env: AppEnv, payloadCiphertext: string, aad: string) => {
  const raw = await decryptText(env, payloadCiphertext, aad);
  const parsed = JSON.parse(raw) as unknown;
  return isRecord(parsed) ? (parsed as OAuthSessionPayload) : {};
};

const getSessionAad = (userId: string, state: string) => `portal:oauth:${userId}:${state}`;

const purgeExpiredSessions = async (env: AppEnv) => {
  await env.DB.prepare('DELETE FROM portal_oauth_sessions WHERE expires_at <= ?').bind(nowIso()).run();
};

const mapSessionRow = async (env: AppEnv, row: OAuthSessionRow): Promise<OAuthSessionRecord> => ({
  state: row.state,
  userId: row.user_id,
  provider: normalizeProvider(row.provider),
  status: normalizeString(row.status),
  payload: await decryptPayload(env, row.payload_ciphertext, getSessionAad(row.user_id, row.state)),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
});

const getOAuthSession = async (
  env: AppEnv,
  userId: string,
  state: string
): Promise<OAuthSessionRecord | null> => {
  await purgeExpiredSessions(env);
  const row = await env.DB.prepare(
    `
      SELECT state, user_id, provider, status, payload_ciphertext, created_at, updated_at, expires_at
      FROM portal_oauth_sessions
      WHERE state = ? AND user_id = ?
      LIMIT 1
    `
  )
    .bind(state, userId)
    .first<OAuthSessionRow>();

  if (!row) {
    return null;
  }

  return mapSessionRow(env, row);
};

const saveOAuthSession = async (
  env: AppEnv,
  record: Pick<OAuthSessionRecord, 'state' | 'userId' | 'provider' | 'status' | 'payload'> &
    Partial<Pick<OAuthSessionRecord, 'createdAt' | 'updatedAt' | 'expiresAt'>>
) => {
  const createdAt = record.createdAt || nowIso();
  const updatedAt = record.updatedAt || nowIso();
  const expiresAt =
    record.expiresAt || new Date(Date.now() + OAUTH_SESSION_TTL_MS).toISOString();

  await env.DB.prepare(
    `
      INSERT INTO portal_oauth_sessions (
        state,
        user_id,
        provider,
        status,
        payload_ciphertext,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(state) DO UPDATE SET
        user_id = excluded.user_id,
        provider = excluded.provider,
        status = excluded.status,
        payload_ciphertext = excluded.payload_ciphertext,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `
  )
    .bind(
      record.state,
      record.userId,
      record.provider,
      record.status || null,
      await encryptPayload(env, record.payload, getSessionAad(record.userId, record.state)),
      createdAt,
      updatedAt,
      expiresAt
    )
    .run();
};

const setOAuthSessionStatus = async (
  env: AppEnv,
  session: OAuthSessionRecord,
  status: string,
  payload = session.payload
) =>
  saveOAuthSession(env, {
    state: session.state,
    userId: session.userId,
    provider: session.provider,
    status,
    payload,
    createdAt: session.createdAt,
    updatedAt: nowIso(),
    expiresAt: new Date(Date.now() + OAUTH_SESSION_TTL_MS).toISOString(),
  });

const completeOAuthSessionsByProvider = async (
  env: AppEnv,
  userId: string,
  provider: UpstreamOAuthProvider
) => {
  await env.DB.prepare('DELETE FROM portal_oauth_sessions WHERE user_id = ? AND provider = ?')
    .bind(userId, provider)
    .run();
};

const startSession = async (
  env: AppEnv,
  userId: string,
  provider: UpstreamOAuthProvider,
  payload: OAuthSessionPayload
) => {
  const statePrefix =
    provider === 'gemini'
      ? 'gem'
      : provider === 'qwen'
        ? 'qwn'
        : provider === 'kimi'
          ? 'kmi'
          : provider === 'antigravity'
            ? 'ant'
            : provider === 'anthropic'
              ? 'cla'
              : provider === 'iflow'
                ? 'ifl'
                : 'cod';
  const state = validateOAuthState(buildState(statePrefix));
  await saveOAuthSession(env, {
    state,
    userId,
    provider,
    status: '',
    payload,
  });
  return state;
};

const parseJsonSafe = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const readResponseError = async (response: Response) => {
  const text = await response.text();
  return text.trim() || `HTTP ${response.status}`;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
};

const generatePkceCodes = async () => {
  const verifierBytes = new Uint8Array(96);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncode(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
};

const parseJwtClaims = (token: string): CodexJwtClaims | null => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = decoder.decode(base64UrlDecode(parts[1]));
    const parsed = JSON.parse(payload) as unknown;
    return isRecord(parsed) ? (parsed as CodexJwtClaims) : null;
  } catch {
    return null;
  }
};

const extractCallbackFields = (input: OAuthCallbackInput) => {
  let state = normalizeString(input.state);
  let code = normalizeString(input.code);
  let error = normalizeString(input.error);
  const redirectUrl = normalizeString(input.redirectUrl);

  if (redirectUrl) {
    let url: URL;
    try {
      url = new URL(redirectUrl);
    } catch {
      throw new Error('invalid redirect_url');
    }
    const params = url.searchParams;
    if (!state) state = normalizeString(params.get('state'));
    if (!code) code = normalizeString(params.get('code'));
    if (!error) {
      error = normalizeString(params.get('error')) || normalizeString(params.get('error_description'));
    }
  }

  return { state, code, error, redirectUrl };
};

const buildAuthUrl = (base: string, params: URLSearchParams) => `${base}?${params.toString()}`;

const startCodexAuth = async (env: AppEnv, userId: string): Promise<OAuthStartResponse> => {
  const pkce = await generatePkceCodes();
  const state = await startSession(env, userId, 'codex', {
    redirectUri: CODEX_REDIRECT_URI,
    pkce,
  });
  const params = new URLSearchParams({
    client_id: CODEX_CLIENT_ID,
    response_type: 'code',
    redirect_uri: CODEX_REDIRECT_URI,
    scope: 'openid email profile offline_access',
    state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'login',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
  });
  return { status: 'ok', url: buildAuthUrl(CODEX_AUTH_URL, params), state };
};

const startAnthropicAuth = async (env: AppEnv, userId: string): Promise<OAuthStartResponse> => {
  const pkce = await generatePkceCodes();
  const state = await startSession(env, userId, 'anthropic', {
    redirectUri: CLAUDE_REDIRECT_URI,
    pkce,
  });
  const params = new URLSearchParams({
    code: 'true',
    client_id: CLAUDE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: CLAUDE_REDIRECT_URI,
    scope: 'org:create_api_key user:profile user:inference',
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return { status: 'ok', url: buildAuthUrl(CLAUDE_AUTH_URL, params), state };
};

const startAntigravityAuth = async (env: AppEnv, userId: string): Promise<OAuthStartResponse> => {
  const state = await startSession(env, userId, 'antigravity', {
    redirectUri: ANTIGRAVITY_REDIRECT_URI,
  });
  const params = new URLSearchParams({
    access_type: 'offline',
    client_id: ANTIGRAVITY_CLIENT_ID,
    prompt: 'consent',
    redirect_uri: ANTIGRAVITY_REDIRECT_URI,
    response_type: 'code',
    scope: ANTIGRAVITY_SCOPES.join(' '),
    state,
  });
  return { status: 'ok', url: buildAuthUrl(ANTIGRAVITY_AUTH_URL, params), state };
};

const startGeminiAuth = async (
  env: AppEnv,
  userId: string,
  projectId?: string
): Promise<OAuthStartResponse> => {
  const normalizedProjectId = normalizeString(projectId);
  const state = await startSession(env, userId, 'gemini', {
    redirectUri: GEMINI_REDIRECT_URI,
    ...(normalizedProjectId ? { projectId: normalizedProjectId } : {}),
  });
  const params = new URLSearchParams({
    client_id: GEMINI_CLIENT_ID,
    redirect_uri: GEMINI_REDIRECT_URI,
    response_type: 'code',
    scope: GEMINI_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return { status: 'ok', url: buildAuthUrl(GEMINI_AUTH_URL, params), state };
};

const startQwenAuth = async (env: AppEnv, userId: string): Promise<OAuthStartResponse> => {
  const pkce = await generatePkceCodes();
  const response = await fetch(QWEN_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: QWEN_CLIENT_ID,
      scope: QWEN_SCOPE,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`failed to generate authorization url: ${await readResponseError(response)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const url =
    normalizeString(payload.verification_uri_complete) || normalizeString(payload.verification_uri);
  if (!url) {
    throw new Error('device authorization failed: missing verification URL');
  }

  const state = await startSession(env, userId, 'qwen', {
    device: {
      deviceCode: normalizeString(payload.device_code),
      userCode: normalizeString(payload.user_code) || undefined,
      verificationUri: normalizeString(payload.verification_uri) || undefined,
      verificationUriComplete: normalizeString(payload.verification_uri_complete) || undefined,
      expiresIn: Number(payload.expires_in || 0) || undefined,
      interval: Number(payload.interval || 0) || undefined,
      codeVerifier: pkce.codeVerifier,
    },
  });

  return { status: 'ok', url, state };
};

const kimiHeaders = (deviceId: string) => ({
  'content-type': 'application/x-www-form-urlencoded',
  accept: 'application/json',
  'x-msh-platform': 'cli-proxy-api',
  'x-msh-version': '1.0.0',
  'x-msh-device-name': 'Cloudflare Pages',
  'x-msh-device-model': 'Cloudflare Workers',
  'x-msh-device-id': deviceId,
});

const startKimiAuth = async (env: AppEnv, userId: string): Promise<OAuthStartResponse> => {
  const deviceId = crypto.randomUUID();
  const response = await fetch(KIMI_DEVICE_CODE_URL, {
    method: 'POST',
    headers: kimiHeaders(deviceId),
    body: new URLSearchParams({
      client_id: KIMI_CLIENT_ID,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`failed to generate authorization url: ${await readResponseError(response)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const url =
    normalizeString(payload.verification_uri_complete) || normalizeString(payload.verification_uri);
  if (!url) {
    throw new Error('device authorization failed: missing verification URL');
  }

  const state = await startSession(env, userId, 'kimi', {
    device: {
      deviceCode: normalizeString(payload.device_code),
      userCode: normalizeString(payload.user_code) || undefined,
      verificationUri: normalizeString(payload.verification_uri) || undefined,
      verificationUriComplete: normalizeString(payload.verification_uri_complete) || undefined,
      expiresIn: Number(payload.expires_in || 0) || undefined,
      interval: Number(payload.interval || 0) || undefined,
      deviceId,
    },
  });

  return { status: 'ok', url, state };
};

const markProcessing = async (env: AppEnv, session: OAuthSessionRecord) => {
  const result = (await env.DB.prepare(
    `
      UPDATE portal_oauth_sessions
      SET status = ?, updated_at = ?, expires_at = ?
      WHERE state = ? AND user_id = ? AND (status IS NULL OR status = '')
    `
  )
    .bind(
      PROCESSING_STATUS,
      nowIso(),
      new Date(Date.now() + OAUTH_SESSION_TTL_MS).toISOString(),
      session.state,
      session.userId
    )
    .run()) as { meta?: { changes?: number } };

  return Number(result.meta?.changes || 0) > 0;
};

const saveCallbackToSession = async (
  env: AppEnv,
  session: OAuthSessionRecord,
  callback: OAuthCallbackPayload
) => {
  const payload: OAuthSessionPayload = {
    ...session.payload,
    callback,
  };
  await setOAuthSessionStatus(env, session, '', payload);
};

const parseAnthropicCallbackCode = (rawCode: string) => {
  const [code, extraState] = rawCode.split('#', 2);
  return {
    code: code.trim(),
    appendedState: normalizeString(extraState) || undefined,
  };
};

const saveJsonAuthFile = async (
  env: AppEnv,
  userId: string,
  fileName: string,
  content: Record<string, unknown>,
  provider: string
) =>
  upsertPortalAuthFile(env, userId, {
    name: fileName,
    content: JSON.stringify(content, null, 2),
    provider,
  });

const processCodexSession = async (env: AppEnv, session: OAuthSessionRecord): Promise<OAuthStatusResponse> => {
  const callback = session.payload.callback;
  const pkce = session.payload.pkce;
  if (!callback || !pkce || !session.payload.redirectUri) {
    return { status: 'wait' };
  }
  if (callback.error) {
    await setOAuthSessionStatus(env, session, 'Bad Request');
    return { status: 'error', error: 'Bad Request' };
  }
  if (callback.state && callback.state !== session.state) {
    await setOAuthSessionStatus(env, session, 'State code error');
    return { status: 'error', error: 'State code error' };
  }
  if (!callback.code) {
    return { status: 'wait' };
  }

  const response = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CODEX_CLIENT_ID,
      code: callback.code,
      redirect_uri: session.payload.redirectUri,
      code_verifier: pkce.codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const message = 'Failed to exchange authorization code for tokens';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const tokenData = (await response.json()) as Record<string, unknown>;
  const idToken = normalizeString(tokenData.id_token);
  const accessToken = normalizeString(tokenData.access_token);
  const refreshToken = normalizeString(tokenData.refresh_token);
  const expiresIn = Number(tokenData.expires_in || 0) || 0;
  const claims = parseJwtClaims(idToken);
  const email = normalizeString(claims?.email);
  const accountId = normalizeString(claims?.['https://api.openai.com/auth']?.chatgpt_account_id);
  const planType = normalizeString(claims?.['https://api.openai.com/auth']?.chatgpt_plan_type);
  const hashedAccountId = accountId ? (await sha256Hex(accountId)).slice(0, 8) : '';
  const fileName = buildCodexFileName(email, planType, hashedAccountId);
  const expired = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : '';

  const content: Record<string, unknown> = {
    id_token: idToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    account_id: accountId,
    last_refresh: nowIso(),
    email,
    type: 'codex',
    expired,
  };
  if (planType) {
    content.plan_type = planType;
  }
  if (claims?.['https://api.openai.com/auth']?.chatgpt_subscription_active_start !== undefined) {
    content.chatgpt_subscription_active_start =
      claims['https://api.openai.com/auth']?.chatgpt_subscription_active_start;
  }
  if (claims?.['https://api.openai.com/auth']?.chatgpt_subscription_active_until !== undefined) {
    content.chatgpt_subscription_active_until =
      claims['https://api.openai.com/auth']?.chatgpt_subscription_active_until;
  }

  await saveJsonAuthFile(env, session.userId, fileName, content, 'codex');
  await completeOAuthSessionsByProvider(env, session.userId, 'codex');
  return { status: 'ok' };
};

const processAnthropicSession = async (
  env: AppEnv,
  session: OAuthSessionRecord
): Promise<OAuthStatusResponse> => {
  const callback = session.payload.callback;
  const pkce = session.payload.pkce;
  if (!callback || !pkce || !session.payload.redirectUri) {
    return { status: 'wait' };
  }
  if (callback.error) {
    const message = 'Bad request';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  if (callback.state && callback.state !== session.state) {
    const message = 'State code error';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  if (!callback.code) {
    return { status: 'wait' };
  }

  const { code, appendedState } = parseAnthropicCallbackCode(callback.code);
  const requestBody: Record<string, unknown> = {
    code,
    state: session.state,
    grant_type: 'authorization_code',
    client_id: CLAUDE_CLIENT_ID,
    redirect_uri: session.payload.redirectUri,
    code_verifier: pkce.codeVerifier,
  };
  if (appendedState) {
    requestBody.state = appendedState;
  }

  const response = await fetch(CLAUDE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const message = 'Failed to exchange authorization code for tokens';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const tokenData = (await response.json()) as Record<string, unknown>;
  const accessToken = normalizeString(tokenData.access_token);
  const refreshToken = normalizeString(tokenData.refresh_token);
  const expiresIn = Number(tokenData.expires_in || 0) || 0;
  const account = isRecord(tokenData.account) ? tokenData.account : {};
  const email = normalizeString(account.email_address);
  const expired = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : '';
  const fileName = `claude-${email || `unknown-${Date.now()}`}.json`;

  await saveJsonAuthFile(
    env,
    session.userId,
    fileName,
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      last_refresh: nowIso(),
      email,
      type: 'claude',
      expired,
    },
    'claude'
  );
  await completeOAuthSessionsByProvider(env, session.userId, 'anthropic');
  return { status: 'ok' };
};

const fetchAntigravityProjectId = async (accessToken: string) => {
  const response = await fetch(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...ANTIGRAVITY_HEADERS,
    },
    body: JSON.stringify({
      metadata: {
        ideType: 'ANTIGRAVITY',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const loadResp = (await response.json()) as Record<string, unknown>;
  const projectValue = loadResp.cloudaicompanionProject;
  if (typeof projectValue === 'string' && projectValue.trim()) {
    return projectValue.trim();
  }
  if (isRecord(projectValue) && normalizeString(projectValue.id)) {
    return normalizeString(projectValue.id);
  }

  let tierId = 'legacy-tier';
  if (Array.isArray(loadResp.allowedTiers)) {
    for (const item of loadResp.allowedTiers) {
      if (!isRecord(item)) continue;
      if (item.isDefault === true && normalizeString(item.id)) {
        tierId = normalizeString(item.id);
        break;
      }
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const onboardResponse = await fetch(ANTIGRAVITY_ONBOARD_USER_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        ...ANTIGRAVITY_HEADERS,
      },
      body: JSON.stringify({
        tierId,
        metadata: {
          ideType: 'ANTIGRAVITY',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
        },
      }),
    });

    if (!onboardResponse.ok) {
      throw new Error(await readResponseError(onboardResponse));
    }

    const onboardPayload = (await onboardResponse.json()) as Record<string, unknown>;
    if (onboardPayload.done === true) {
      const result = isRecord(onboardPayload.response)
        ? onboardPayload.response.cloudaicompanionProject
        : null;
      if (typeof result === 'string' && result.trim()) {
        return result.trim();
      }
      if (isRecord(result) && normalizeString(result.id)) {
        return normalizeString(result.id);
      }
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return '';
};

const processAntigravitySession = async (
  env: AppEnv,
  session: OAuthSessionRecord
): Promise<OAuthStatusResponse> => {
  const callback = session.payload.callback;
  if (!callback || !session.payload.redirectUri) {
    return { status: 'wait' };
  }
  if (callback.error) {
    const message = 'Authentication failed';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  if (callback.state && callback.state !== session.state) {
    const message = 'Authentication failed: state mismatch';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  if (!callback.code) {
    return { status: 'wait' };
  }

  const tokenResponse = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: callback.code,
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      redirect_uri: session.payload.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const message = 'Failed to exchange token';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
  const accessToken = normalizeString(tokenData.access_token);
  const refreshToken = normalizeString(tokenData.refresh_token);
  const expiresIn = Number(tokenData.expires_in || 0) || 0;
  if (!accessToken) {
    const message = 'Failed to exchange token';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const profileResponse = await fetch(ANTIGRAVITY_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!profileResponse.ok) {
    const message = 'Failed to fetch user info';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  const profile = (await profileResponse.json()) as { email?: string };
  const email = normalizeString(profile.email);
  if (!email) {
    const message = 'Failed to fetch user info';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  let projectId = '';
  try {
    projectId = await fetchAntigravityProjectId(accessToken);
  } catch {
    projectId = '';
  }

  const fileName = buildAntigravityFileName(email);
  const content: Record<string, unknown> = {
    type: 'antigravity',
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    timestamp: Date.now(),
    expired: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : '',
    email,
  };
  if (projectId) {
    content.project_id = projectId;
  }

  await saveJsonAuthFile(env, session.userId, fileName, content, 'antigravity');
  await completeOAuthSessionsByProvider(env, session.userId, 'antigravity');
  return { status: 'ok' };
};

const fetchGoogleUserInfo = async (accessToken: string) => {
  const response = await fetch(GEMINI_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Get user info request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as { email?: string };
  const email = normalizeString(payload.email);
  if (!email) {
    throw new Error('Failed to get user email from token');
  }
  return email;
};

const callGeminiCli = async (
  accessToken: string,
  endpoint: string,
  body: Record<string, unknown>
) => {
  const url =
    endpoint.startsWith('operations/')
      ? `https://cloudcode-pa.googleapis.com/${endpoint}`
      : `https://cloudcode-pa.googleapis.com/v1internal:${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'user-agent': GEMINI_USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`api request failed with status ${response.status}: ${await readResponseError(response)}`);
  }
  return (await response.json()) as Record<string, unknown>;
};

const fetchGcpProjects = async (accessToken: string) => {
  const response = await fetch(GEMINI_PROJECTS_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'user-agent': GEMINI_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`project list request failed with status ${response.status}: ${await readResponseError(response)}`);
  }
  const payload = (await response.json()) as { projects?: Array<{ projectId?: string }> };
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  return Array.from(
    new Set(
      projects
        .map((project) => normalizeString(project.projectId))
        .filter(Boolean)
    )
  );
};

const extractProjectId = (value: unknown) => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (isRecord(value) && normalizeString(value.id)) {
    return normalizeString(value.id);
  }
  return '';
};

const performGeminiSetup = async (
  accessToken: string,
  requestedProject: string
): Promise<{ projectId: string; auto: boolean }> => {
  const metadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  };
  let resolvedRequest = requestedProject.trim();
  let auto = false;

  if (!resolvedRequest) {
    const projects = await fetchGcpProjects(accessToken);
    if (!projects.length) {
      throw new Error('no Google Cloud projects available for this account');
    }
    resolvedRequest = projects[0];
    auto = true;
  }

  const loadBody: Record<string, unknown> = { metadata };
  if (resolvedRequest) {
    loadBody.cloudaicompanionProject = resolvedRequest;
  }
  const loadResp = await callGeminiCli(accessToken, 'loadCodeAssist', loadBody);

  let tierId = 'legacy-tier';
  if (Array.isArray(loadResp.allowedTiers)) {
    for (const tier of loadResp.allowedTiers) {
      if (!isRecord(tier)) continue;
      if (tier.isDefault === true && normalizeString(tier.id)) {
        tierId = normalizeString(tier.id);
        break;
      }
    }
  }

  let projectId = resolvedRequest;
  if (!projectId) {
    projectId = extractProjectId(loadResp.cloudaicompanionProject);
  }

  if (!projectId) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const onboardResp = await callGeminiCli(accessToken, 'onboardUser', {
        tierId,
        metadata,
      });
      if (onboardResp.done === true) {
        if (isRecord(onboardResp.response)) {
          projectId = extractProjectId(onboardResp.response.cloudaicompanionProject);
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!projectId) {
      throw new Error('gemini cli: project selection required');
    }
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const onboardResp = await callGeminiCli(accessToken, 'onboardUser', {
      tierId,
      metadata,
      cloudaicompanionProject: projectId,
    });

    if (onboardResp.done === true) {
      if (isRecord(onboardResp.response)) {
        const responseProjectId = extractProjectId(onboardResp.response.cloudaicompanionProject);
        if (responseProjectId) {
          const isFreeUser =
            projectId.startsWith('gen-lang-client-') ||
            tierId.toLowerCase() === 'free' ||
            tierId.toLowerCase() === 'legacy';
          if (!requestedProject.trim() || !isFreeUser || responseProjectId.toLowerCase() === projectId.toLowerCase()) {
            projectId = responseProjectId;
          } else if (isFreeUser) {
            projectId = responseProjectId;
          }
        }
      }
      if (!projectId) {
        throw new Error('onboard user completed without project id');
      }
      return { projectId, auto };
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error('Failed to complete Gemini CLI onboarding');
};

const ensureGeminiProjectsEnabled = async (accessToken: string, projectIds: string[]) => {
  for (const projectId of projectIds) {
    for (const service of GEMINI_REQUIRED_SERVICES) {
      const checkResponse = await fetch(
        `${GEMINI_SERVICE_USAGE_URL}/v1/projects/${projectId}/services/${service}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
            'user-agent': GEMINI_USER_AGENT,
          },
        }
      );

      if (checkResponse.ok) {
        const payload = (await parseJsonSafe<{ state?: string }>(checkResponse)) || null;
        if (normalizeString(payload?.state) === 'ENABLED') {
          continue;
        }
      }

      const enableResponse = await fetch(
        `${GEMINI_SERVICE_USAGE_URL}/v1/projects/${projectId}/services/${service}:enable`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
            'user-agent': GEMINI_USER_AGENT,
          },
          body: '{}',
        }
      );

      if (enableResponse.ok || enableResponse.status === 201) {
        continue;
      }

      const raw = (await parseJsonSafe<{ error?: { message?: string } }>(enableResponse)) || null;
      const errorMessage = normalizeString(raw?.error?.message) || (await readResponseError(enableResponse));
      if (enableResponse.status === 400 && errorMessage.toLowerCase().includes('already enabled')) {
        continue;
      }
      throw new Error(`project activation required: ${errorMessage}`);
    }
  }
};

const processGeminiSession = async (env: AppEnv, session: OAuthSessionRecord): Promise<OAuthStatusResponse> => {
  const callback = session.payload.callback;
  if (!callback || !session.payload.redirectUri) {
    return { status: 'wait' };
  }
  if (callback.error) {
    const message = 'Authentication failed';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  if (callback.state && callback.state !== session.state) {
    const message = 'Authentication failed: state mismatch';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }
  if (!callback.code) {
    return { status: 'wait' };
  }

  const tokenResponse = await fetch(GEMINI_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: callback.code,
      client_id: GEMINI_CLIENT_ID,
      client_secret: GEMINI_CLIENT_SECRET,
      redirect_uri: session.payload.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const message = 'Failed to exchange token';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const token = ((await tokenResponse.json()) as GeminiTokenShape) || {};
  const accessToken = normalizeString(token.access_token);
  if (!accessToken) {
    const message = 'Failed to exchange token';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  let email = '';
  try {
    email = await fetchGoogleUserInfo(accessToken);
  } catch {
    const message = 'Could not get user info';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const tokenMap: Record<string, unknown> = {
    ...token,
    token_uri: GEMINI_TOKEN_URL,
    client_id: GEMINI_CLIENT_ID,
    client_secret: GEMINI_CLIENT_SECRET,
    scopes: GEMINI_SCOPES,
    universe_domain: 'googleapis.com',
  };

  const requestedProjectId = normalizeString(session.payload.projectId);
  let projectIds: string[] = [];
  let auto = false;
  let checked = false;

  try {
    if (requestedProjectId.toUpperCase() === 'ALL') {
      const projects = await fetchGcpProjects(accessToken);
      if (!projects.length) {
        throw new Error('no Google Cloud projects available for this account');
      }
      const activated: string[] = [];
      for (const projectId of projects) {
        const result = await performGeminiSetup(accessToken, projectId);
        activated.push(result.projectId);
      }
      projectIds = Array.from(new Set(activated.filter(Boolean)));
      await ensureGeminiProjectsEnabled(accessToken, projectIds);
      checked = true;
    } else if (requestedProjectId.toUpperCase() === 'GOOGLE_ONE') {
      const result = await performGeminiSetup(accessToken, '');
      if (!result.projectId) {
        throw new Error('Google One auto-discovery returned empty project ID');
      }
      projectIds = [result.projectId];
      auto = false;
      await ensureGeminiProjectsEnabled(accessToken, projectIds);
      checked = true;
    } else {
      const result = await performGeminiSetup(accessToken, requestedProjectId);
      if (!result.projectId) {
        throw new Error('Failed to resolve project ID');
      }
      projectIds = [result.projectId];
      auto = result.auto;
      await ensureGeminiProjectsEnabled(accessToken, projectIds);
      checked = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete Gemini CLI onboarding';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const projectId = projectIds.join(',');
  const fileName = buildGeminiFileName(email, projectId);
  await saveJsonAuthFile(
    env,
    session.userId,
    fileName,
    {
      token: tokenMap,
      project_id: projectId,
      email,
      auto,
      checked,
      type: 'gemini',
    },
    'gemini'
  );
  await completeOAuthSessionsByProvider(env, session.userId, 'gemini');
  return { status: 'ok' };
};

const processQwenSession = async (env: AppEnv, session: OAuthSessionRecord): Promise<OAuthStatusResponse> => {
  const device = session.payload.device;
  if (!device?.deviceCode || !device.codeVerifier) {
    return { status: 'wait' };
  }

  const response = await fetch(QWEN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: QWEN_GRANT_TYPE,
      client_id: QWEN_CLIENT_ID,
      device_code: device.deviceCode,
      code_verifier: device.codeVerifier,
    }).toString(),
  });

  const payload = ((await parseJsonSafe<Record<string, unknown>>(response)) || {}) as Record<string, unknown>;
  if (!response.ok) {
    const errorType = normalizeString(payload.error);
    switch (errorType) {
      case 'authorization_pending':
      case 'slow_down':
        return { status: 'wait' };
      case 'expired_token': {
        const message = 'device code expired. Please restart the authentication process';
        await setOAuthSessionStatus(env, session, message);
        return { status: 'error', error: message };
      }
      case 'access_denied': {
        const message = 'authorization denied by user. Please restart the authentication process';
        await setOAuthSessionStatus(env, session, message);
        return { status: 'error', error: message };
      }
      default: {
        const message =
          normalizeString(payload.error_description) ||
          normalizeString(payload.error) ||
          `device token poll failed: ${await readResponseError(response)}`;
        await setOAuthSessionStatus(env, session, message);
        return { status: 'error', error: message };
      }
    }
  }

  const expiresIn = Number(payload.expires_in || 0) || 0;
  const identifier = `${Date.now()}`;
  await saveJsonAuthFile(
    env,
    session.userId,
    `qwen-${identifier}.json`,
    {
      access_token: normalizeString(payload.access_token),
      refresh_token: normalizeString(payload.refresh_token),
      last_refresh: nowIso(),
      resource_url: normalizeString(payload.resource_url),
      email: identifier,
      type: 'qwen',
      expired: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : '',
    },
    'qwen'
  );
  await completeOAuthSessionsByProvider(env, session.userId, 'qwen');
  return { status: 'ok' };
};

const processKimiSession = async (env: AppEnv, session: OAuthSessionRecord): Promise<OAuthStatusResponse> => {
  const device = session.payload.device;
  if (!device?.deviceCode || !device.deviceId) {
    return { status: 'wait' };
  }

  const response = await fetch(KIMI_TOKEN_URL, {
    method: 'POST',
    headers: kimiHeaders(device.deviceId),
    body: new URLSearchParams({
      client_id: KIMI_CLIENT_ID,
      device_code: device.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }).toString(),
  });

  const payload = ((await parseJsonSafe<Record<string, unknown>>(response)) || {}) as Record<string, unknown>;
  const errorType = normalizeString(payload.error);
  if (errorType) {
    switch (errorType) {
      case 'authorization_pending':
      case 'slow_down':
        return { status: 'wait' };
      case 'expired_token': {
        const message = 'kimi: device code expired';
        await setOAuthSessionStatus(env, session, message);
        return { status: 'error', error: message };
      }
      case 'access_denied': {
        const message = 'kimi: access denied by user';
        await setOAuthSessionStatus(env, session, message);
        return { status: 'error', error: message };
      }
      default: {
        const message =
          `kimi: OAuth error: ${errorType}` +
          (normalizeString(payload.error_description) ? ` - ${normalizeString(payload.error_description)}` : '');
        await setOAuthSessionStatus(env, session, message);
        return { status: 'error', error: message };
      }
    }
  }

  const accessToken = normalizeString(payload.access_token);
  if (!accessToken) {
    const message = 'Authentication failed';
    await setOAuthSessionStatus(env, session, message);
    return { status: 'error', error: message };
  }

  const expiresIn = Number(payload.expires_in || 0) || 0;
  const expired = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : '';
  await saveJsonAuthFile(
    env,
    session.userId,
    `kimi-${Date.now()}.json`,
    {
      access_token: accessToken,
      refresh_token: normalizeString(payload.refresh_token),
      token_type: normalizeString(payload.token_type),
      scope: normalizeString(payload.scope),
      device_id: device.deviceId,
      expired,
      type: 'kimi',
      timestamp: Date.now(),
    },
    'kimi'
  );
  await completeOAuthSessionsByProvider(env, session.userId, 'kimi');
  return { status: 'ok' };
};

const normalizeCookie = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('cookie cannot be empty');
  }
  const combined = `${trimmed.split(/\s+/).join(' ')}`.replace(/;*$/, ';');
  if (!combined.includes('BXAuth=')) {
    throw new Error('cookie missing BXAuth field');
  }
  return combined;
};

const sanitizeIFlowFileName = (raw: string) =>
  raw
    .replace(/\*/g, 'x')
    .split('')
    .filter((char) => /[a-zA-Z0-9_@.-]/.test(char))
    .join('')
    .trim();

const extractBXAuth = (cookie: string) => {
  for (const part of cookie.split(';')) {
    const normalized = part.trim();
    if (normalized.startsWith('BXAuth=')) {
      return normalized.slice('BXAuth='.length);
    }
  }
  return '';
};

const findDuplicateIFlowCookie = async (env: AppEnv, userId: string, bxAuth: string) => {
  if (!bxAuth) {
    return '';
  }
  const files = await listPortalAuthFiles(env, userId);
  for (const file of files) {
    const provider = normalizeString(file.provider || file.type);
    if (provider !== 'iflow') continue;
    const stored = await getPortalAuthFile(env, userId, file.name);
    if (!stored) continue;
    try {
      const parsed = JSON.parse(stored.content) as unknown;
      if (!isRecord(parsed)) continue;
      const existing = extractBXAuth(normalizeString(parsed.cookie));
      if (existing && existing === bxAuth) {
        return file.name;
      }
    } catch {
      // Ignore invalid files here.
    }
  }
  return '';
};

export const authenticateIFlowCookie = async (
  env: AppEnv,
  userId: string,
  rawCookie: string
): Promise<IFlowCookieResponse> => {
  const cookie = normalizeCookie(rawCookie);
  const bxAuth = extractBXAuth(cookie);
  const duplicate = await findDuplicateIFlowCookie(env, userId, bxAuth);
  if (duplicate) {
    const error = new Error('duplicate BXAuth found') as Error & { status?: number };
    error.status = 409;
    throw error;
  }

  const initialResponse = await fetch(IFLOW_API_KEY_URL, {
    headers: {
      cookie,
      accept: 'application/json, text/plain, */*',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'accept-encoding': 'gzip, deflate, br',
      connection: 'keep-alive',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    },
  });

  const initialPayload = ((await parseJsonSafe<Record<string, unknown>>(initialResponse)) || {}) as Record<
    string,
    unknown
  >;
  if (!initialResponse.ok || initialPayload.success !== true || !isRecord(initialPayload.data)) {
    throw new Error(
      `iflow cookie: GET request failed with status ${initialResponse.status}: ${await readResponseError(initialResponse)}`
    );
  }

  const keyInfo = initialPayload.data as Record<string, unknown>;
  const name = normalizeString(keyInfo.name);
  if (!name) {
    throw new Error('iflow cookie refresh: name is empty');
  }

  const refreshResponse = await fetch(IFLOW_API_KEY_URL, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'accept-encoding': 'gzip, deflate, br',
      connection: 'keep-alive',
      origin: 'https://platform.iflow.cn',
      referer: 'https://platform.iflow.cn/',
    },
    body: JSON.stringify({ name }),
  });

  const refreshPayload = ((await parseJsonSafe<Record<string, unknown>>(refreshResponse)) || {}) as Record<
    string,
    unknown
  >;
  if (!refreshResponse.ok || refreshPayload.success !== true || !isRecord(refreshPayload.data)) {
    throw new Error(
      `iflow cookie refresh: POST request failed with status ${refreshResponse.status}: ${await readResponseError(refreshResponse)}`
    );
  }

  const refreshed = refreshPayload.data as Record<string, unknown>;
  const email = name.trim();
  const safePrefix = sanitizeIFlowFileName(email);
  const filePrefix = safePrefix ? `iflow-${safePrefix}` : `iflow-${Date.now()}`;
  const fileName = `${filePrefix}-${Math.floor(Date.now() / 1000)}.json`;
  const cookieToSave = bxAuth ? `BXAuth=${bxAuth};` : '';
  await saveJsonAuthFile(
    env,
    userId,
    fileName,
    {
      api_key: normalizeString(refreshed.apiKey),
      email,
      expired: normalizeString(refreshed.expireTime),
      cookie: cookieToSave,
      type: 'iflow',
      last_refresh: nowIso(),
    },
    'iflow'
  );

  return {
    status: 'ok',
    saved_path: fileName,
    email,
    expired: normalizeString(refreshed.expireTime),
    type: 'iflow',
  };
};

export const startUpstreamOAuth = async (
  env: AppEnv,
  userId: string,
  provider: string,
  options?: { projectId?: string }
) => {
  const normalized = normalizeProvider(provider);
  switch (normalized) {
    case 'codex':
      return startCodexAuth(env, userId);
    case 'anthropic':
      return startAnthropicAuth(env, userId);
    case 'antigravity':
      return startAntigravityAuth(env, userId);
    case 'gemini':
      return startGeminiAuth(env, userId, options?.projectId);
    case 'qwen':
      return startQwenAuth(env, userId);
    case 'kimi':
      return startKimiAuth(env, userId);
    default:
      throw new Error('unsupported provider');
  }
};

export const submitUpstreamOAuthCallback = async (
  env: AppEnv,
  userId: string,
  input: OAuthCallbackInput
) => {
  const provider = normalizeProvider(input.provider);
  const { state, code, error, redirectUrl } = extractCallbackFields(input);
  if (!state) {
    throw new Error('state is required');
  }
  validateOAuthState(state);
  if (!code && !error) {
    throw new Error('code or error is required');
  }

  const session = await getOAuthSession(env, userId, state);
  if (!session) {
    const notFoundError = new Error('unknown or expired state') as Error & { status?: number };
    notFoundError.status = 404;
    throw notFoundError;
  }
  if (session.status && session.status !== PROCESSING_STATUS) {
    const conflictError = new Error('oauth flow is not pending') as Error & { status?: number };
    conflictError.status = 409;
    throw conflictError;
  }
  if (session.provider !== provider) {
    throw new Error('provider does not match state');
  }

  await saveCallbackToSession(env, session, {
    redirectUrl,
    code,
    state,
    error,
    receivedAt: nowIso(),
  });

  return { status: 'ok' as const };
};

const processSession = async (env: AppEnv, session: OAuthSessionRecord): Promise<OAuthStatusResponse> => {
  switch (session.provider) {
    case 'codex':
      return processCodexSession(env, session);
    case 'anthropic':
      return processAnthropicSession(env, session);
    case 'antigravity':
      return processAntigravitySession(env, session);
    case 'gemini':
      return processGeminiSession(env, session);
    case 'qwen':
      return processQwenSession(env, session);
    case 'kimi':
      return processKimiSession(env, session);
    default:
      return { status: 'error', error: 'unsupported provider' };
  }
};

export const getUpstreamOAuthStatus = async (
  env: AppEnv,
  userId: string,
  rawState: string
): Promise<OAuthStatusResponse> => {
  const state = normalizeString(rawState);
  if (!state) {
    return { status: 'ok' };
  }
  try {
    validateOAuthState(state);
  } catch {
    return { status: 'error', error: 'invalid state' };
  }

  const session = await getOAuthSession(env, userId, state);
  if (!session) {
    return { status: 'ok' };
  }
  if (session.status && session.status !== PROCESSING_STATUS) {
    return { status: 'error', error: session.status };
  }
  if (session.status === PROCESSING_STATUS) {
    return { status: 'wait' };
  }

  const locked = await markProcessing(env, session);
  if (!locked) {
    return { status: 'wait' };
  }

  const latest = await getOAuthSession(env, userId, state);
  if (!latest) {
    return { status: 'ok' };
  }

  try {
    const result = await processSession(env, {
      ...latest,
      status: PROCESSING_STATUS,
    });
    if (result.status === 'wait') {
      const stillThere = await getOAuthSession(env, userId, state);
      if (stillThere) {
        await setOAuthSessionStatus(env, stillThere, '');
      }
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    const stillThere = await getOAuthSession(env, userId, state);
    if (stillThere) {
      await setOAuthSessionStatus(env, stillThere, message);
    }
    return { status: 'error', error: message };
  }
};
