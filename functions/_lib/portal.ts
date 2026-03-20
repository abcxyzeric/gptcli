import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AppEnv, ensureEnv } from './http';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRecord = { [key: string]: JsonValue };

export type ModelDefinition = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};

export type OAuthModelAliasEntry = {
  name: string;
  alias: string;
  fork?: boolean;
};

export type StoredAuthFile = {
  name: string;
  type?: string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
};

export type StoredAuthFileWithContent = StoredAuthFile & {
  content: string;
};

export type PortalState = {
  config: JsonRecord;
  usage: JsonRecord;
};

type PortalStateRow = {
  user_id: string;
  config_ciphertext: string;
  usage_ciphertext: string;
  created_at: string;
  updated_at: string;
};

type PortalAuthFileRow = {
  id: string;
  user_id: string;
  name: string;
  provider: string | null;
  type: string | null;
  size: number | null;
  disabled: number | null;
  runtime_only: number | null;
  status: string | null;
  status_message: string | null;
  auth_index: string | null;
  modified: number | null;
  content_ciphertext: string;
  created_at: string;
  updated_at: string;
};

export const SERVER_VERSION = '2026.3.20.1001';
export const SERVER_BUILD_DATE = '2026-03-20T20:30:00.000Z';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DISABLE_ALL_MODELS_RULE = '*';

const DEFAULT_USAGE: JsonRecord = {
  version: 1,
  exported_at: '',
  usage: {
    apis: {},
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
  },
};

const DEFAULT_CONFIG: JsonRecord = {
  debug: false,
  'proxy-url': '',
  'request-retry': 0,
  'quota-exceeded': {
    'switch-project': false,
    'switch-preview-model': false,
  },
  'usage-statistics-enabled': true,
  'request-log': false,
  'logging-to-file': false,
  'logs-max-total-size-mb': 50,
  'ws-auth': false,
  'force-model-prefix': false,
  routing: {
    strategy: 'round-robin',
  },
  'api-keys': [],
  ampcode: {
    'force-model-mappings': false,
  },
  'gemini-api-key': [],
  'codex-api-key': [],
  'claude-api-key': [],
  'vertex-api-key': [],
  'openai-compatibility': [],
  'oauth-excluded-models': {},
  'oauth-model-alias': {},
};

const DEFAULT_MODEL_DEFINITIONS: Record<string, ModelDefinition[]> = {
  claude: [
    { id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5', owned_by: 'anthropic' },
    { id: 'claude-opus-4-1', display_name: 'Claude Opus 4.1', owned_by: 'anthropic' },
    { id: 'claude-3-7-sonnet-latest', display_name: 'Claude 3.7 Sonnet', owned_by: 'anthropic' },
  ],
  codex: [
    { id: 'gpt-5', display_name: 'GPT-5', owned_by: 'openai' },
    { id: 'gpt-5-mini', display_name: 'GPT-5 Mini', owned_by: 'openai' },
    { id: 'gpt-4.1', display_name: 'GPT-4.1', owned_by: 'openai' },
    { id: 'o4-mini', display_name: 'o4-mini', owned_by: 'openai' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', owned_by: 'google' },
    { id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', owned_by: 'google' },
    { id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', owned_by: 'google' },
  ],
  'gemini-cli': [
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', owned_by: 'google' },
    { id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', owned_by: 'google' },
    { id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', owned_by: 'google' },
  ],
  aistudio: [
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', owned_by: 'google' },
    { id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', owned_by: 'google' },
  ],
  antigravity: [
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', owned_by: 'google' },
    { id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', owned_by: 'google' },
  ],
  vertex: [
    { id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', owned_by: 'google-vertex' },
    { id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', owned_by: 'google-vertex' },
  ],
  kimi: [
    { id: 'kimi-k2', display_name: 'Kimi K2', owned_by: 'moonshot' },
    { id: 'moonshot-v1-8k', display_name: 'Moonshot 8K', owned_by: 'moonshot' },
    { id: 'moonshot-v1-32k', display_name: 'Moonshot 32K', owned_by: 'moonshot' },
    { id: 'moonshot-v1-128k', display_name: 'Moonshot 128K', owned_by: 'moonshot' },
  ],
  qwen: [
    { id: 'qwen-max', display_name: 'Qwen Max', owned_by: 'alibaba' },
    { id: 'qwen-plus', display_name: 'Qwen Plus', owned_by: 'alibaba' },
    { id: 'qwen-turbo', display_name: 'Qwen Turbo', owned_by: 'alibaba' },
    { id: 'qwen3-235b-a22b', display_name: 'Qwen3 235B A22B', owned_by: 'alibaba' },
  ],
  iflow: [{ id: 'iflow-chat', display_name: 'iFlow Chat', owned_by: 'iflow' }],
  openai: [
    { id: 'gpt-5', display_name: 'GPT-5', owned_by: 'openai' },
    { id: 'gpt-5-mini', display_name: 'GPT-5 Mini', owned_by: 'openai' },
    { id: 'gpt-4.1', display_name: 'GPT-4.1', owned_by: 'openai' },
    { id: 'o4-mini', display_name: 'o4-mini', owned_by: 'openai' },
  ],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

const base64UrlEncode = (value: Uint8Array): string => {
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

const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = String(value ?? '').trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });
  return result;
};

const looksLikePrivateHostname = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]') {
    return true;
  }
  if (normalized.endsWith('.local')) {
    return true;
  }
  if (/^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }
  const match172 = normalized.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number.parseInt(match172[1], 10);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }
  return false;
};

const normalizeStatusMessage = (message: string) => {
  const trimmed = message.trim();
  return trimmed || null;
};

const constantTimeEqualStrings = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const getDataSecret = (env: AppEnv) =>
  ensureEnv(env.DATA_ENCRYPTION_SECRET || env.SESSION_SECRET, 'DATA_ENCRYPTION_SECRET');

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
    throw new Error('Dữ liệu mã hóa không hợp lệ.');
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

const encryptJson = (env: AppEnv, value: unknown, aad: string) =>
  encryptText(env, JSON.stringify(value), aad);

const decryptJson = async <T>(env: AppEnv, value: string, aad: string): Promise<T> => {
  const text = await decryptText(env, value, aad);
  return JSON.parse(text) as T;
};

const ensureConfigShape = (input: unknown): JsonRecord => {
  const base = cloneJson(DEFAULT_CONFIG);
  if (!isRecord(input)) {
    return base;
  }

  Object.entries(input).forEach(([key, value]) => {
    base[key] = value as JsonValue;
  });

  if (!isRecord(base['quota-exceeded'])) {
    base['quota-exceeded'] = cloneJson(DEFAULT_CONFIG['quota-exceeded']);
  }
  if (!isRecord(base.routing)) {
    base.routing = cloneJson(DEFAULT_CONFIG.routing);
  }
  if (!isRecord(base.ampcode)) {
    base.ampcode = cloneJson(DEFAULT_CONFIG.ampcode);
  }
  if (!Array.isArray(base['api-keys'])) {
    base['api-keys'] = [];
  }
  ['gemini-api-key', 'codex-api-key', 'claude-api-key', 'vertex-api-key', 'openai-compatibility'].forEach((key) => {
    if (!Array.isArray(base[key])) {
      base[key] = [];
    }
  });
  if (!isRecord(base['oauth-excluded-models'])) {
    base['oauth-excluded-models'] = {};
  }
  if (!isRecord(base['oauth-model-alias'])) {
    base['oauth-model-alias'] = {};
  }

  return base;
};

const ensureUsageShape = (input: unknown): JsonRecord => {
  const base = cloneJson(DEFAULT_USAGE);
  if (!isRecord(input)) {
    return base;
  }

  Object.entries(input).forEach(([key, value]) => {
    base[key] = value as JsonValue;
  });
  if (!isRecord(base.usage)) {
    base.usage = cloneJson(DEFAULT_USAGE.usage);
  }
  if (!isRecord((base.usage as Record<string, unknown>).apis)) {
    (base.usage as Record<string, unknown>).apis = {};
  }
  return base;
};

const getStateAad = (userId: string, kind: 'config' | 'usage') => `portal:${userId}:${kind}`;
const getAuthFileAad = (userId: string, name: string) => `portal:${userId}:auth-file:${name}`;

export const withServerHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-server-version', SERVER_VERSION);
  headers.set('x-server-build-date', SERVER_BUILD_DATE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const createDefaultState = (): PortalState => ({
  config: cloneJson(DEFAULT_CONFIG),
  usage: {
    ...cloneJson(DEFAULT_USAGE),
    exported_at: nowIso(),
  },
});

const insertDefaultState = async (env: AppEnv, userId: string) => {
  const state = createDefaultState();
  const timestamp = nowIso();
  await env.DB.prepare(
    `
      INSERT OR REPLACE INTO portal_state (
        user_id,
        config_ciphertext,
        usage_ciphertext,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      userId,
      await encryptJson(env, state.config, getStateAad(userId, 'config')),
      await encryptJson(env, state.usage, getStateAad(userId, 'usage')),
      timestamp,
      timestamp
    )
    .run();
  return state;
};

export const loadPortalState = async (env: AppEnv, userId: string): Promise<PortalState> => {
  const row = await env.DB.prepare(
    `
      SELECT user_id, config_ciphertext, usage_ciphertext, created_at, updated_at
      FROM portal_state
      WHERE user_id = ?
      LIMIT 1
    `
  )
    .bind(userId)
    .first<PortalStateRow>();

  if (!row) {
    return insertDefaultState(env, userId);
  }

  const config = ensureConfigShape(
    await decryptJson<JsonRecord>(env, row.config_ciphertext, getStateAad(userId, 'config'))
  );
  const usage = ensureUsageShape(
    await decryptJson<JsonRecord>(env, row.usage_ciphertext, getStateAad(userId, 'usage'))
  );
  return { config, usage };
};

export const findUserIdByApiKey = async (env: AppEnv, rawApiKey: string): Promise<string | null> => {
  const apiKey = String(rawApiKey || '').trim();
  if (!apiKey) {
    return null;
  }

  const result = await env.DB.prepare(
    `
      SELECT user_id, config_ciphertext
      FROM portal_state
    `
  ).all<{ user_id: string; config_ciphertext: string }>();

  for (const row of result.results || []) {
    try {
      const config = ensureConfigShape(
        await decryptJson<JsonRecord>(env, row.config_ciphertext, getStateAad(row.user_id, 'config'))
      );
      const keys = Array.isArray(config['api-keys']) ? config['api-keys'] : [];
      const matched = keys.some((item) => constantTimeEqualStrings(String(item ?? '').trim(), apiKey));
      if (matched) {
        return row.user_id;
      }
    } catch {
      // Ignore broken rows so one bad record does not block public auth.
    }
  }

  return null;
};

export const savePortalState = async (env: AppEnv, userId: string, state: PortalState) => {
  const normalizedState: PortalState = {
    config: ensureConfigShape(state.config),
    usage: ensureUsageShape(state.usage),
  };
  const timestamp = nowIso();
  await env.DB.prepare(
    `
      INSERT INTO portal_state (
        user_id,
        config_ciphertext,
        usage_ciphertext,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        config_ciphertext = excluded.config_ciphertext,
        usage_ciphertext = excluded.usage_ciphertext,
        updated_at = excluded.updated_at
    `
  )
    .bind(
      userId,
      await encryptJson(env, normalizedState.config, getStateAad(userId, 'config')),
      await encryptJson(env, normalizedState.usage, getStateAad(userId, 'usage')),
      timestamp,
      timestamp
    )
    .run();
};

export const mutatePortalConfig = async (
  env: AppEnv,
  userId: string,
  mutator: (config: JsonRecord) => void
) => {
  const state = await loadPortalState(env, userId);
  const config = ensureConfigShape(state.config);
  mutator(config);
  state.config = config;
  await savePortalState(env, userId, state);
  return config;
};

export const replacePortalConfig = async (env: AppEnv, userId: string, config: JsonRecord) => {
  const state = await loadPortalState(env, userId);
  state.config = ensureConfigShape(config);
  await savePortalState(env, userId, state);
  return state.config;
};

export const getPortalConfigYaml = async (env: AppEnv, userId: string) => {
  const state = await loadPortalState(env, userId);
  return stringifyYaml(state.config, {
    indent: 2,
    lineWidth: 120,
  });
};

export const savePortalConfigYaml = async (env: AppEnv, userId: string, content: string) => {
  const parsed = parseYaml(content);
  if (!isRecord(parsed)) {
    throw new Error('Config YAML phải là một object hợp lệ.');
  }
  return replacePortalConfig(env, userId, parsed as JsonRecord);
};

const guessProviderFromName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('vertex')) return 'vertex';
  if (normalized.includes('antigravity')) return 'antigravity';
  if (normalized.includes('gemini-cli') || normalized.includes('gcli')) return 'gemini-cli';
  if (normalized.includes('aistudio') || normalized.includes('studio')) return 'aistudio';
  if (normalized.includes('gemini')) return 'gemini';
  if (normalized.includes('claude')) return 'claude';
  if (normalized.includes('codex') || normalized.includes('openai')) return 'codex';
  if (normalized.includes('qwen')) return 'qwen';
  if (normalized.includes('kimi') || normalized.includes('moonshot')) return 'kimi';
  if (normalized.includes('iflow')) return 'iflow';
  return 'unknown';
};

const guessProviderFromContent = (content: string, parsed: Record<string, unknown> | null) => {
  if (!parsed) return 'unknown';
  const provider = String(parsed.provider ?? parsed.type ?? parsed.channel ?? '').trim();
  if (provider) {
    return guessProviderFromName(provider);
  }
  if (typeof parsed.refresh_token === 'string' && typeof parsed.client_id === 'string') {
    return 'gemini-cli';
  }
  if (
    typeof parsed.client_email === 'string' ||
    typeof parsed.project_id === 'string' ||
    typeof parsed.quota_project_id === 'string'
  ) {
    return 'vertex';
  }
  if (typeof parsed.cookie === 'string') {
    return 'iflow';
  }
  if (/anthropic|claude/i.test(content)) return 'claude';
  if (/openai|codex|chatgpt/i.test(content)) return 'codex';
  if (/gemini|google/i.test(content)) return 'gemini-cli';
  if (/qwen/i.test(content)) return 'qwen';
  if (/kimi|moonshot/i.test(content)) return 'kimi';
  return 'unknown';
};

const detectAuthFileMetadata = (
  name: string,
  content: string,
  forcedProvider?: string
): StoredAuthFileWithContent => {
  let parsed: Record<string, unknown> | null = null;
  let statusMessage = '';
  try {
    const candidate = JSON.parse(content) as unknown;
    if (isRecord(candidate)) {
      parsed = candidate as Record<string, unknown>;
    } else {
      statusMessage = 'JSON không phải object nên có thể không dùng được.';
    }
  } catch {
    statusMessage = 'File không phải JSON hợp lệ.';
  }

  const provider = normalizeProviderKey(
    forcedProvider || guessProviderFromContent(content, parsed) || guessProviderFromName(name)
  );
  const type = provider || guessProviderFromName(name);
  const authIndex =
    parsed && (typeof parsed.auth_index === 'number' || typeof parsed.auth_index === 'string')
      ? (parsed.auth_index as string | number)
      : null;

  return {
    name,
    content,
    provider,
    type,
    size: encoder.encode(content).length,
    authIndex,
    runtimeOnly: false,
    disabled: false,
    unavailable: false,
    status: statusMessage ? 'warning' : 'ok',
    statusMessage: normalizeStatusMessage(statusMessage) || undefined,
    lastRefresh: nowIso(),
    modified: nowMs(),
  };
};

const mapAuthFileRow = (row: PortalAuthFileRow): StoredAuthFile => ({
  name: row.name,
  provider: row.provider || undefined,
  type: row.type || undefined,
  size: row.size ?? undefined,
  authIndex: row.auth_index ?? null,
  runtimeOnly: Boolean(row.runtime_only),
  disabled: Boolean(row.disabled),
  unavailable: false,
  status: row.status || undefined,
  statusMessage: row.status_message || undefined,
  lastRefresh: row.updated_at,
  modified: row.modified ?? undefined,
});

export const listPortalAuthFiles = async (env: AppEnv, userId: string) => {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        user_id,
        name,
        provider,
        type,
        size,
        disabled,
        runtime_only,
        status,
        status_message,
        auth_index,
        modified,
        content_ciphertext,
        created_at,
        updated_at
      FROM portal_auth_files
      WHERE user_id = ?
      ORDER BY modified DESC, name ASC
    `
  )
    .bind(userId)
    .all<PortalAuthFileRow>();

  return (result.results || []).map(mapAuthFileRow);
};

export const getPortalAuthFile = async (
  env: AppEnv,
  userId: string,
  name: string
): Promise<StoredAuthFileWithContent | null> => {
  const row = await env.DB.prepare(
    `
      SELECT
        id,
        user_id,
        name,
        provider,
        type,
        size,
        disabled,
        runtime_only,
        status,
        status_message,
        auth_index,
        modified,
        content_ciphertext,
        created_at,
        updated_at
      FROM portal_auth_files
      WHERE user_id = ? AND name = ?
      LIMIT 1
    `
  )
    .bind(userId, name)
    .first<PortalAuthFileRow>();

  if (!row) return null;

  const content = await decryptText(env, row.content_ciphertext, getAuthFileAad(userId, row.name));
  return {
    ...mapAuthFileRow(row),
    content,
  };
};

export const upsertPortalAuthFile = async (
  env: AppEnv,
  userId: string,
  input: { name: string; content: string; provider?: string }
) => {
  const detected = detectAuthFileMetadata(input.name, input.content, input.provider);
  const timestamp = nowIso();
  await env.DB.prepare(
    `
      INSERT INTO portal_auth_files (
        id,
        user_id,
        name,
        provider,
        type,
        size,
        disabled,
        runtime_only,
        status,
        status_message,
        auth_index,
        modified,
        content_ciphertext,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, name) DO UPDATE SET
        provider = excluded.provider,
        type = excluded.type,
        size = excluded.size,
        status = excluded.status,
        status_message = excluded.status_message,
        auth_index = excluded.auth_index,
        modified = excluded.modified,
        content_ciphertext = excluded.content_ciphertext,
        updated_at = excluded.updated_at
    `
  )
    .bind(
      crypto.randomUUID(),
      userId,
      detected.name,
      detected.provider || null,
      detected.type || null,
      detected.size ?? 0,
      detected.disabled ? 1 : 0,
      detected.runtimeOnly ? 1 : 0,
      detected.status || 'ok',
      detected.statusMessage || null,
      detected.authIndex === null || detected.authIndex === undefined ? null : String(detected.authIndex),
      detected.modified ?? nowMs(),
      await encryptText(env, detected.content, getAuthFileAad(userId, detected.name)),
      timestamp,
      timestamp
    )
    .run();

  return detected;
};

export const deletePortalAuthFile = async (env: AppEnv, userId: string, name: string) => {
  await env.DB.prepare('DELETE FROM portal_auth_files WHERE user_id = ? AND name = ?')
    .bind(userId, name)
    .run();
};

export const deleteAllPortalAuthFiles = async (env: AppEnv, userId: string) => {
  await env.DB.prepare('DELETE FROM portal_auth_files WHERE user_id = ?').bind(userId).run();
};

export const setPortalAuthFileDisabled = async (
  env: AppEnv,
  userId: string,
  name: string,
  disabled: boolean
) => {
  await env.DB.prepare(
    `
      UPDATE portal_auth_files
      SET disabled = ?, status = ?, updated_at = ?
      WHERE user_id = ? AND name = ?
    `
  )
    .bind(disabled ? 1 : 0, disabled ? 'paused' : 'ok', nowIso(), userId, name)
    .run();

  return getPortalAuthFile(env, userId, name);
};

const extractModelsFromJson = (parsed: Record<string, unknown> | null): ModelDefinition[] => {
  const candidates = [parsed?.models, parsed?.available_models, parsed?.supported_models];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const result = candidate
      .map((item) => {
        if (typeof item === 'string') {
          return { id: item };
        }
        if (!isRecord(item)) return null;
        const id = String(item.id ?? item.name ?? item.model ?? '').trim();
        if (!id) return null;
        const entry: ModelDefinition = { id };
        const displayName = String(item.display_name ?? item.displayName ?? item.alias ?? '').trim();
        if (displayName && displayName !== id) {
          entry.display_name = displayName;
        }
        const type = String(item.type ?? '').trim();
        if (type) {
          entry.type = type;
        }
        const ownedBy = String(item.owned_by ?? item.ownedBy ?? '').trim();
        if (ownedBy) {
          entry.owned_by = ownedBy;
        }
        return entry;
      })
      .filter(Boolean) as ModelDefinition[];
    if (result.length) return result;
  }

  return [];
};

const mergeModelLists = (...groups: Array<ModelDefinition[] | undefined>) => {
  const merged: ModelDefinition[] = [];
  const seen = new Set<string>();
  groups.forEach((group) => {
    (group || []).forEach((model) => {
      const id = String(model.id ?? '').trim();
      const key = id.toLowerCase();
      if (!id || seen.has(key)) return;
      seen.add(key);
      merged.push({
        id,
        ...(model.display_name ? { display_name: model.display_name } : {}),
        ...(model.type ? { type: model.type } : {}),
        ...(model.owned_by ? { owned_by: model.owned_by } : {}),
      });
    });
  });
  return merged;
};

const extractConfigModelEntries = (config: JsonRecord, key: string, owner: string): ModelDefinition[] => {
  const source = config[key];
  if (!Array.isArray(source)) return [];

  const collected: ModelDefinition[] = [];
  source.forEach((item) => {
    if (!isRecord(item)) return;
    const models = item.models;
    if (!Array.isArray(models)) return;
    models.forEach((model) => {
      if (typeof model === 'string') {
        const id = model.trim();
        if (id) {
          collected.push({ id, owned_by: owner });
        }
        return;
      }
      if (!isRecord(model)) return;
      const id = String(model.name ?? model.id ?? model.model ?? '').trim();
      if (!id) return;
      const displayName = String(model.alias ?? model.display_name ?? '').trim();
      collected.push({
        id,
        ...(displayName && displayName !== id ? { display_name: displayName } : {}),
        owned_by: owner,
      });
    });
  });
  return collected;
};

const extractOpenAiProviderModels = (config: JsonRecord): ModelDefinition[] => {
  const source = config['openai-compatibility'];
  if (!Array.isArray(source)) return [];

  const collected: ModelDefinition[] = [];
  source.forEach((provider) => {
    if (!isRecord(provider)) return;
    const models = provider.models;
    if (!Array.isArray(models)) return;
    models.forEach((model) => {
      if (typeof model === 'string') {
        const id = model.trim();
        if (id) {
          collected.push({ id, owned_by: String(provider.name ?? 'openai') });
        }
        return;
      }
      if (!isRecord(model)) return;
      const id = String(model.name ?? model.id ?? model.model ?? '').trim();
      if (!id) return;
      const displayName = String(model.alias ?? model.display_name ?? '').trim();
      collected.push({
        id,
        ...(displayName && displayName !== id ? { display_name: displayName } : {}),
        owned_by: String(provider.name ?? 'openai'),
      });
    });
  });
  return collected;
};

export const getModelDefinitionsForChannel = async (
  env: AppEnv,
  userId: string,
  channel: string
) => {
  const normalized = normalizeProviderKey(channel);
  const state = await loadPortalState(env, userId);
  const authFiles = await listPortalAuthFiles(env, userId);

  const staticModels =
    DEFAULT_MODEL_DEFINITIONS[normalized] ||
    DEFAULT_MODEL_DEFINITIONS[
      normalized === 'openai-compatibility'
        ? 'openai'
        : normalized === 'anthropic'
          ? 'claude'
          : normalized
    ] ||
    [];

  const configKey =
    normalized === 'anthropic'
      ? 'claude-api-key'
      : normalized === 'openai'
        ? 'openai-compatibility'
        : `${normalized}-api-key`;

  const fromConfig =
    configKey === 'openai-compatibility'
      ? extractOpenAiProviderModels(state.config)
      : extractConfigModelEntries(state.config, configKey, normalized);

  const matchingFiles = authFiles.filter(
    (file) => normalizeProviderKey(file.provider || file.type || '') === normalized
  );
  const fromFiles: ModelDefinition[] = [];
  for (const file of matchingFiles) {
    const stored = await getPortalAuthFile(env, userId, file.name);
    if (!stored) continue;
    try {
      const parsed = JSON.parse(stored.content) as unknown;
      if (isRecord(parsed)) {
        fromFiles.push(...extractModelsFromJson(parsed as Record<string, unknown>));
      }
    } catch {
      // Ignore invalid JSON here.
    }
  }

  return mergeModelLists(staticModels, fromConfig, fromFiles);
};

export const getModelsForAuthFile = async (env: AppEnv, userId: string, name: string) => {
  const file = await getPortalAuthFile(env, userId, name);
  if (!file) return [];

  try {
    const parsed = JSON.parse(file.content) as unknown;
    if (isRecord(parsed)) {
      const extracted = extractModelsFromJson(parsed as Record<string, unknown>);
      if (extracted.length) {
        return extracted;
      }
    }
  } catch {
    // Ignore invalid JSON and fall back to provider defaults.
  }

  return getModelDefinitionsForChannel(env, userId, file.provider || file.type || 'unknown');
};

export const getAllAvailableModels = async (env: AppEnv, userId: string) => {
  const state = await loadPortalState(env, userId);
  const authFiles = await listPortalAuthFiles(env, userId);

  const dynamicProviders = uniqueStrings(
    authFiles
      .map((file) => normalizeProviderKey(file.provider || file.type || ''))
      .concat(['claude', 'codex', 'gemini', 'gemini-cli', 'vertex', 'openai'])
  );

  const groups = await Promise.all(
    dynamicProviders.map((provider) => getModelDefinitionsForChannel(env, userId, provider))
  );
  const fromConfig = mergeModelLists(
    extractConfigModelEntries(state.config, 'gemini-api-key', 'google'),
    extractConfigModelEntries(state.config, 'codex-api-key', 'openai'),
    extractConfigModelEntries(state.config, 'claude-api-key', 'anthropic'),
    extractConfigModelEntries(state.config, 'vertex-api-key', 'google-vertex'),
    extractOpenAiProviderModels(state.config)
  );

  return mergeModelLists(...Object.values(DEFAULT_MODEL_DEFINITIONS), fromConfig, ...groups);
};

export const buildUsageExportPayload = (usage: JsonRecord) => {
  const payload = ensureUsageShape(usage);
  payload.exported_at = nowIso();
  return payload;
};

export const importUsagePayload = async (env: AppEnv, userId: string, input: unknown) => {
  const state = await loadPortalState(env, userId);
  const payload = ensureUsageShape(input);
  state.usage = buildUsageExportPayload(payload);
  await savePortalState(env, userId, state);
  return {
    added: 1,
    skipped: 0,
    total_requests: Number(
      (isRecord(state.usage.usage) ? state.usage.usage.total_requests : 0) || 0
    ),
    failed_requests: Number(
      (isRecord(state.usage.usage) ? state.usage.usage.failure_count : 0) || 0
    ),
  };
};

export const getOAuthExcludedModels = (config: JsonRecord) => {
  const source = config['oauth-excluded-models'];
  return isRecord(source) ? (source as JsonRecord) : {};
};

export const getOAuthModelAlias = (config: JsonRecord) => {
  const source = config['oauth-model-alias'];
  return isRecord(source) ? (source as JsonRecord) : {};
};

export const setOAuthExcludedModels = (config: JsonRecord, provider: string, models: string[]) => {
  const source = cloneJson(getOAuthExcludedModels(config));
  const normalizedProvider = normalizeProviderKey(provider);
  if (!normalizedProvider) return;
  const normalizedModels = uniqueStrings(models);
  if (normalizedModels.length) {
    source[normalizedProvider] = normalizedModels;
  } else {
    delete source[normalizedProvider];
  }
  config['oauth-excluded-models'] = source;
};

export const replaceOAuthExcludedModels = (config: JsonRecord, map: Record<string, string[]>) => {
  const next: JsonRecord = {};
  Object.entries(map || {}).forEach(([provider, models]) => {
    const normalizedProvider = normalizeProviderKey(provider);
    if (!normalizedProvider) return;
    next[normalizedProvider] = uniqueStrings(Array.isArray(models) ? models : []);
  });
  config['oauth-excluded-models'] = next;
};

export const setOAuthModelAlias = (
  config: JsonRecord,
  channel: string,
  aliases: OAuthModelAliasEntry[]
) => {
  const source = cloneJson(getOAuthModelAlias(config));
  const normalizedChannel = normalizeProviderKey(channel);
  if (!normalizedChannel) return;

  const normalizedAliases = aliases
    .map((alias) => {
      const name = String(alias.name ?? '').trim();
      const aliasName = String(alias.alias ?? '').trim();
      if (!name || !aliasName) return null;
      return alias.fork ? { name, alias: aliasName, fork: true } : { name, alias: aliasName };
    })
    .filter(Boolean) as OAuthModelAliasEntry[];

  if (normalizedAliases.length) {
    source[normalizedChannel] = normalizedAliases as unknown as JsonValue;
  } else {
    delete source[normalizedChannel];
  }
  config['oauth-model-alias'] = source;
};

export const buildConfigSectionResponse = (key: string, value: unknown): JsonRecord => {
  if (key === 'routing/strategy') {
    return { strategy: String(value ?? 'round-robin') };
  }
  if (key === 'force-model-prefix') {
    return { 'force-model-prefix': Boolean(value) };
  }
  if (key === 'logs-max-total-size-mb') {
    return { 'logs-max-total-size-mb': Number(value ?? 0) };
  }
  return { [key]: (value ?? null) as JsonValue };
};

export const getConfigSectionValue = (config: JsonRecord, key: string): unknown => {
  switch (key) {
    case 'routing/strategy':
      return isRecord(config.routing) ? config.routing.strategy ?? 'round-robin' : 'round-robin';
    case 'quota-exceeded/switch-project':
      return isRecord(config['quota-exceeded'])
        ? config['quota-exceeded']['switch-project'] ?? false
        : false;
    case 'quota-exceeded/switch-preview-model':
      return isRecord(config['quota-exceeded'])
        ? config['quota-exceeded']['switch-preview-model'] ?? false
        : false;
    case 'ampcode/upstream-url':
      return isRecord(config.ampcode) ? config.ampcode['upstream-url'] ?? '' : '';
    case 'ampcode/upstream-api-key':
      return isRecord(config.ampcode) ? config.ampcode['upstream-api-key'] ?? '' : '';
    case 'ampcode/upstream-api-keys':
      return isRecord(config.ampcode) ? config.ampcode['upstream-api-keys'] ?? [] : [];
    case 'ampcode/model-mappings':
      return isRecord(config.ampcode) ? config.ampcode['model-mappings'] ?? [] : [];
    case 'ampcode/force-model-mappings':
      return isRecord(config.ampcode) ? config.ampcode['force-model-mappings'] ?? false : false;
    default:
      return config[key];
  }
};

export const setConfigSectionValue = (config: JsonRecord, key: string, value: unknown) => {
  switch (key) {
    case 'routing/strategy': {
      const routing = isRecord(config.routing) ? cloneJson(config.routing as JsonRecord) : {};
      routing.strategy = String(value ?? 'round-robin');
      config.routing = routing;
      return;
    }
    case 'quota-exceeded/switch-project':
    case 'quota-exceeded/switch-preview-model': {
      const quota = isRecord(config['quota-exceeded'])
        ? cloneJson(config['quota-exceeded'] as JsonRecord)
        : {};
      quota[key.split('/')[1]] = Boolean(value);
      config['quota-exceeded'] = quota;
      return;
    }
    case 'ampcode/upstream-url':
    case 'ampcode/upstream-api-key':
    case 'ampcode/upstream-api-keys':
    case 'ampcode/model-mappings':
    case 'ampcode/force-model-mappings': {
      const ampcode = isRecord(config.ampcode) ? cloneJson(config.ampcode as JsonRecord) : {};
      ampcode[key.split('/')[1]] = value as JsonValue;
      config.ampcode = ampcode;
      return;
    }
    default:
      config[key] = value as JsonValue;
  }
};

export const clearConfigSectionValue = (config: JsonRecord, key: string) => {
  switch (key) {
    case 'proxy-url':
      config['proxy-url'] = '';
      return;
    case 'ampcode/upstream-url':
    case 'ampcode/upstream-api-key':
    case 'ampcode/upstream-api-keys':
    case 'ampcode/model-mappings': {
      const ampcode = isRecord(config.ampcode) ? cloneJson(config.ampcode as JsonRecord) : {};
      delete ampcode[key.split('/')[1]];
      config.ampcode = ampcode;
      return;
    }
    default:
      delete config[key];
  }
};

export const getConfigArray = (config: JsonRecord, key: string) =>
  Array.isArray(config[key]) ? cloneJson(config[key] as JsonValue[]) : [];

export const setConfigArray = (config: JsonRecord, key: string, value: unknown[]) => {
  config[key] = cloneJson(value) as JsonValue;
};

export const deleteFromConfigArray = (
  config: JsonRecord,
  key: string,
  predicate: (item: unknown, index: number) => boolean
) => {
  const source = getConfigArray(config, key);
  config[key] = source.filter((item, index) => !predicate(item, index)) as JsonValue;
};

export const upsertUsageEvent = async (
  env: AppEnv,
  userId: string,
  event: {
    endpoint: string;
    model?: string;
    source?: string;
    authIndex?: string | number | null;
    failed?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
  }
) => {
  const state = await loadPortalState(env, userId);
  const usageRoot = ensureUsageShape(state.usage);
  const usage = usageRoot.usage as Record<string, unknown>;
  const apis = isRecord(usage.apis) ? (usage.apis as Record<string, unknown>) : {};

  const endpoint = event.endpoint.trim() || 'POST /v1/chat/completions';
  const modelName = String(event.model || 'unknown').trim() || 'unknown';
  const timestamp = nowIso();
  const totalTokens =
    Number(event.inputTokens || 0) +
    Number(event.outputTokens || 0) +
    Number(event.cachedTokens || 0) +
    Number(event.reasoningTokens || 0);

  const detail = {
    timestamp,
    source: String(event.source || 'cloudflare-web'),
    auth_index:
      event.authIndex === null || event.authIndex === undefined ? 0 : Number(event.authIndex) || 0,
    tokens: {
      input_tokens: Number(event.inputTokens || 0),
      output_tokens: Number(event.outputTokens || 0),
      reasoning_tokens: Number(event.reasoningTokens || 0),
      cached_tokens: Number(event.cachedTokens || 0),
      total_tokens: totalTokens,
    },
    failed: Boolean(event.failed),
  };

  const endpointEntry = isRecord(apis[endpoint]) ? (apis[endpoint] as Record<string, unknown>) : {};
  const endpointModels = isRecord(endpointEntry.models)
    ? (endpointEntry.models as Record<string, unknown>)
    : {};
  const modelEntry = isRecord(endpointModels[modelName])
    ? (endpointModels[modelName] as Record<string, unknown>)
    : {};
  const details = Array.isArray(modelEntry.details) ? [...modelEntry.details] : [];
  details.push(detail);

  const nextModelEntry = {
    ...modelEntry,
    details,
    total_requests: Number(modelEntry.total_requests || 0) + 1,
    success_count: Number(modelEntry.success_count || 0) + (detail.failed ? 0 : 1),
    failure_count: Number(modelEntry.failure_count || 0) + (detail.failed ? 1 : 0),
    total_tokens: Number(modelEntry.total_tokens || 0) + totalTokens,
  };

  endpointModels[modelName] = nextModelEntry;
  const nextEndpointEntry = {
    ...endpointEntry,
    models: endpointModels,
    total_requests: Number(endpointEntry.total_requests || 0) + 1,
    success_count: Number(endpointEntry.success_count || 0) + (detail.failed ? 0 : 1),
    failure_count: Number(endpointEntry.failure_count || 0) + (detail.failed ? 1 : 0),
    total_tokens: Number(endpointEntry.total_tokens || 0) + totalTokens,
  };
  apis[endpoint] = nextEndpointEntry;

  usage.apis = apis;
  usage.total_requests = Number(usage.total_requests || 0) + 1;
  usage.success_count = Number(usage.success_count || 0) + (detail.failed ? 0 : 1);
  usage.failure_count = Number(usage.failure_count || 0) + (detail.failed ? 1 : 0);
  usage.total_tokens = Number(usage.total_tokens || 0) + totalTokens;

  usageRoot.usage = usage as JsonValue;
  usageRoot.exported_at = timestamp;
  state.usage = usageRoot;
  await savePortalState(env, userId, state);
};

export const buildApiCallHeaders = (headers: Headers) => {
  const result: Record<string, string[]> = {};
  headers.forEach((value, key) => {
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(value);
  });
  return result;
};

export const isSafeRemoteUrl = (input: string) => {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') return false;
    if (looksLikePrivateHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
};

export const sanitizeRemoteHeaders = (headers: Record<string, string> | undefined) => {
  const result: Record<string, string> = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    const normalizedKey = key.trim();
    const lower = normalizedKey.toLowerCase();
    if (!normalizedKey) return;
    if (
      lower === 'host' ||
      lower === 'cookie' ||
      lower === 'content-length' ||
      lower.startsWith('cf-') ||
      lower.startsWith('x-forwarded-')
    ) {
      return;
    }
    result[normalizedKey] = String(value ?? '');
  });
  return result;
};

export const normalizeExcludedModelsList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value.map((item) => String(item ?? '').trim()).filter((item) => item !== DISABLE_ALL_MODELS_RULE)
  );
};
