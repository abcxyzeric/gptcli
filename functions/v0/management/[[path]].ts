import { getSession } from '../../_lib/auth';
import { AppEnv, errorResponse, json, readJsonBody } from '../../_lib/http';
import {
  buildApiCallHeaders,
  buildConfigSectionResponse,
  buildUsageExportPayload,
  clearConfigSectionValue,
  deleteAllPortalAuthFiles,
  deleteFromConfigArray,
  deletePortalAuthFile,
  getConfigArray,
  getConfigSectionValue,
  getModelDefinitionsForChannel,
  getModelsForAuthFile,
  getOAuthExcludedModels,
  getOAuthModelAlias,
  getPortalAuthFile,
  getPortalConfigYaml,
  importUsagePayload,
  isSafeRemoteUrl,
  listPortalAuthFiles,
  loadPortalState,
  normalizeExcludedModelsList,
  mutatePortalConfig,
  replaceOAuthExcludedModels,
  sanitizeRemoteHeaders,
  savePortalConfigYaml,
  setConfigArray,
  setConfigSectionValue,
  setOAuthExcludedModels,
  setOAuthModelAlias,
  setPortalAuthFileDisabled,
  upsertPortalAuthFile,
  upsertUsageEvent,
  withServerHeaders,
  SERVER_VERSION,
} from '../../_lib/portal';
import {
  authenticateIFlowCookie,
  getUpstreamOAuthStatus,
  startUpstreamOAuth,
  submitUpstreamOAuthCallback,
} from '../../_lib/upstream-oauth';

const MANAGEMENT_PREFIX = '/v0/management';
const PROVIDER_ARRAY_PATHS = new Set([
  'gemini-api-key',
  'codex-api-key',
  'claude-api-key',
  'vertex-api-key',
  'openai-compatibility',
]);
const BOOLEAN_SECTION_PATHS = new Set([
  'debug',
  'usage-statistics-enabled',
  'request-log',
  'logging-to-file',
  'ws-auth',
  'force-model-prefix',
  'quota-exceeded/switch-project',
  'quota-exceeded/switch-preview-model',
  'ampcode/force-model-mappings',
]);
const NUMBER_SECTION_PATHS = new Set(['request-retry', 'logs-max-total-size-mb']);
const STRING_SECTION_PATHS = new Set([
  'proxy-url',
  'routing/strategy',
  'ampcode/upstream-url',
  'ampcode/upstream-api-key',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizePath = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname.replace(new RegExp(`^${MANAGEMENT_PREFIX}/?`), '').replace(/^\/+|\/+$/g, '');
};

const ok = (data: unknown, init: ResponseInit = {}) => withServerHeaders(json(data, init));
const fail = (message: string, status = 400, details?: Record<string, unknown>) =>
  withServerHeaders(errorResponse(message, status, details));

const textResponse = (content: string, contentType: string) =>
  withServerHeaders(
    new Response(content, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
      },
    })
  );

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const parseNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readValueBody = async (request: Request) => {
  const body = await readJsonBody<unknown>(request);
  if (Array.isArray(body)) return body;
  if (isRecord(body) && 'value' in body) return body.value;
  return body;
};

const readArrayBody = async (request: Request) => {
  const body = await readValueBody(request);
  if (!Array.isArray(body)) {
    throw new Error('Body phải là mảng hợp lệ.');
  }
  return body;
};

const readPatchBody = async (request: Request) => {
  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!isRecord(body)) {
    throw new Error('Body phải là object hợp lệ.');
  }
  return body;
};

const handleProviderArray = async (env: AppEnv, userId: string, path: string, request: Request) => {
  const method = request.method.toUpperCase();
  const query = new URL(request.url).searchParams;

  if (method === 'GET') {
    const state = await loadPortalState(env, userId);
    return ok({ [path]: getConfigArray(state.config, path) });
  }

  if (method === 'PUT') {
    const value = await readArrayBody(request);
    const config = await mutatePortalConfig(env, userId, (draft) => setConfigArray(draft, path, value));
    return ok({ [path]: getConfigArray(config, path) });
  }

  if (method === 'PATCH') {
    const body = await readPatchBody(request);
    const index = parseNumber(body.index, -1);
    if (index < 0) {
      return fail('Thiếu index hợp lệ để cập nhật.', 400);
    }
    const config = await mutatePortalConfig(env, userId, (draft) => {
      const items = getConfigArray(draft, path);
      items[index] = body.value as never;
      setConfigArray(draft, path, items);
    });
    return ok({ [path]: getConfigArray(config, path) });
  }

  if (method === 'DELETE') {
    const matcher =
      path === 'openai-compatibility'
        ? (item: unknown) => String((item as Record<string, unknown>)?.name ?? '').trim() === query.get('name')
        : (item: unknown) =>
            String((item as Record<string, unknown>)?.['api-key'] ?? '').trim() === query.get('api-key');

    const config = await mutatePortalConfig(env, userId, (draft) => {
      deleteFromConfigArray(draft, path, (item) => matcher(item));
    });
    return ok({ [path]: getConfigArray(config, path) });
  }

  return fail('Phương thức không được hỗ trợ.', 405);
};

const handleConfigSection = async (env: AppEnv, userId: string, path: string, request: Request) => {
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    const state = await loadPortalState(env, userId);
    return ok(buildConfigSectionResponse(path, getConfigSectionValue(state.config, path)));
  }

  if (method === 'DELETE') {
    const config = await mutatePortalConfig(env, userId, (draft) => clearConfigSectionValue(draft, path));
    return ok(buildConfigSectionResponse(path, getConfigSectionValue(config, path)));
  }

  if (method === 'PUT') {
    const rawValue = await readValueBody(request);
    let nextValue = rawValue;
    if (BOOLEAN_SECTION_PATHS.has(path)) nextValue = parseBoolean(rawValue);
    if (NUMBER_SECTION_PATHS.has(path)) nextValue = parseNumber(rawValue);
    if (STRING_SECTION_PATHS.has(path)) nextValue = String(rawValue ?? '').trim();

    const config = await mutatePortalConfig(env, userId, (draft) => {
      setConfigSectionValue(draft, path, nextValue);
    });
    return ok(buildConfigSectionResponse(path, getConfigSectionValue(config, path)));
  }

  return fail('Phương thức không được hỗ trợ.', 405);
};

const handleApiCall = async (env: AppEnv, userId: string, request: Request) => {
  const body = await readJsonBody<Record<string, unknown>>(request);
  const method = String(body.method ?? 'GET').trim().toUpperCase();
  const url = String(body.url ?? '').trim();
  const data = body.data;
  const headersInput = isRecord(body.header)
    ? Object.fromEntries(Object.entries(body.header).map(([key, value]) => [key, String(value ?? '')]))
    : undefined;

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    return fail('api-call chỉ hỗ trợ các HTTP method phổ biến.', 400);
  }
  if (!isSafeRemoteUrl(url)) {
    return fail('URL đích không an toàn hoặc không được hỗ trợ.', 400);
  }

  const upstream = new URL(url);
  const upstreamResponse = await fetch(upstream.toString(), {
    method,
    headers: sanitizeRemoteHeaders(headersInput),
    body:
      method === 'GET' || method === 'HEAD'
        ? undefined
        : typeof data === 'string'
          ? data
          : data === undefined || data === null
            ? undefined
            : JSON.stringify(data),
  });

  const bodyText = await upstreamResponse.text();
  let parsedBody: unknown = bodyText;
  try {
    parsedBody = bodyText ? (JSON.parse(bodyText) as unknown) : null;
  } catch {
    parsedBody = bodyText;
  }

  await upsertUsageEvent(env, userId, {
    endpoint: `${method} ${upstream.pathname}`,
    source: upstream.hostname,
    failed: upstreamResponse.status >= 400,
  });

  return ok({
    status_code: upstreamResponse.status,
    header: buildApiCallHeaders(upstreamResponse.headers),
    body: parsedBody,
  });
};

const handleAuthFiles = async (env: AppEnv, userId: string, path: string, request: Request) => {
  const method = request.method.toUpperCase();
  const query = new URL(request.url).searchParams;

  if (path === 'auth-files' && method === 'GET') {
    const files = await listPortalAuthFiles(env, userId);
    return ok({ files, total: files.length });
  }

  if (path === 'auth-files' && method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return fail('Thiếu file cần upload.', 400);
    }
    const uploaded = await upsertPortalAuthFile(env, userId, {
      name: file.name,
      content: await file.text(),
    });
    return ok({ ok: true, file: uploaded });
  }

  if (path === 'auth-files' && method === 'DELETE') {
    if (query.get('all') === 'true') {
      await deleteAllPortalAuthFiles(env, userId);
      return ok({ ok: true });
    }
    const name = String(query.get('name') ?? '').trim();
    if (!name) {
      return fail('Thiếu tên file để xóa.', 400);
    }
    await deletePortalAuthFile(env, userId, name);
    return ok({ ok: true });
  }

  if (path === 'auth-files/status' && method === 'PATCH') {
    const body = await readPatchBody(request);
    const name = String(body.name ?? '').trim();
    if (!name) {
      return fail('Thiếu tên file để cập nhật trạng thái.', 400);
    }
    const file = await setPortalAuthFileDisabled(env, userId, name, parseBoolean(body.disabled));
    if (!file) {
      return fail('Không tìm thấy auth file cần cập nhật.', 404);
    }
    return ok({ status: 'ok', disabled: Boolean(file.disabled) });
  }

  if (path === 'auth-files/download' && method === 'GET') {
    const name = String(query.get('name') ?? '').trim();
    if (!name) {
      return fail('Thiếu tên file để tải về.', 400);
    }
    const file = await getPortalAuthFile(env, userId, name);
    if (!file) {
      return fail('Không tìm thấy auth file cần tải về.', 404);
    }
    return textResponse(file.content, 'application/json; charset=utf-8');
  }

  if (path === 'auth-files/models' && method === 'GET') {
    const name = String(query.get('name') ?? '').trim();
    if (!name) {
      return fail('Thiếu tên file để lấy model definitions.', 400);
    }
    return ok({ models: await getModelsForAuthFile(env, userId, name) });
  }

  return null;
};

const handleAmpcodeCollectionDelete = async (
  env: AppEnv,
  userId: string,
  path: 'ampcode/upstream-api-keys' | 'ampcode/model-mappings',
  request: Request
) => {
  const body = await readJsonBody<Record<string, unknown>>(request).catch(() => ({}));
  const rawValue = isRecord(body) ? body.value : undefined;
  const values = Array.isArray(rawValue) ? rawValue : [];
  const current = await loadPortalState(env, userId);
  const config = await mutatePortalConfig(env, userId, (draft) => {
    if (!values.length) {
      setConfigSectionValue(draft, path, []);
      return;
    }
    const existing = Array.isArray(getConfigSectionValue(current.config, path))
      ? (getConfigSectionValue(current.config, path) as unknown[])
      : [];
    const filtered =
      path === 'ampcode/upstream-api-keys'
        ? existing.filter(
            (item) =>
              !values.includes(String((item as Record<string, unknown>)?.['upstream-api-key'] ?? ''))
          )
        : existing.filter(
            (item) => !values.includes(String((item as Record<string, unknown>)?.from ?? ''))
          );
    setConfigSectionValue(draft, path, filtered);
  });
  return ok(buildConfigSectionResponse(path, getConfigSectionValue(config, path)));
};

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  const session = await getSession(context.env, context.request);
  if (!session) {
    return fail('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  }

  const userId = session.user.id;
  const path = normalizePath(context.request);
  const method = context.request.method.toUpperCase();

  try {
    if (!path || path === 'config') {
      if (method === 'GET') {
        const state = await loadPortalState(context.env, userId);
        return ok(state.config);
      }
      return fail('Phương thức không được hỗ trợ.', 405);
    }

    if (path === 'config.yaml') {
      if (method === 'GET') {
        return textResponse(await getPortalConfigYaml(context.env, userId), 'application/yaml; charset=utf-8');
      }
      if (method === 'PUT') {
        const content = await context.request.text();
        const config = await savePortalConfigYaml(context.env, userId, content);
        return ok({ ok: true, config });
      }
      return fail('Phương thức không được hỗ trợ.', 405);
    }

    if (path === 'api-keys') {
      if (method === 'GET') {
        const state = await loadPortalState(context.env, userId);
        return ok({ 'api-keys': getConfigArray(state.config, 'api-keys') });
      }
      if (method === 'PUT') {
        const value = await readArrayBody(context.request);
        const config = await mutatePortalConfig(context.env, userId, (draft) => {
          setConfigArray(draft, 'api-keys', value.map((item) => String(item ?? '').trim()).filter(Boolean));
        });
        return ok({ 'api-keys': getConfigArray(config, 'api-keys') });
      }
      if (method === 'PATCH') {
        const body = await readPatchBody(context.request);
        const index = parseNumber(body.index, -1);
        const value = String(body.value ?? '').trim();
        if (index < 0 || !value) {
          return fail('Thiếu index hoặc value hợp lệ để cập nhật API key.', 400);
        }
        const config = await mutatePortalConfig(context.env, userId, (draft) => {
          const items = getConfigArray(draft, 'api-keys').map((item) => String(item ?? ''));
          items[index] = value;
          setConfigArray(draft, 'api-keys', items);
        });
        return ok({ 'api-keys': getConfigArray(config, 'api-keys') });
      }
      if (method === 'DELETE') {
        const index = parseNumber(new URL(context.request.url).searchParams.get('index'), -1);
        const config = await mutatePortalConfig(context.env, userId, (draft) => {
          deleteFromConfigArray(draft, 'api-keys', (_item, itemIndex) => itemIndex === index);
        });
        return ok({ 'api-keys': getConfigArray(config, 'api-keys') });
      }
      return fail('Phương thức không được hỗ trợ.', 405);
    }

    if (path === 'latest-version' && method === 'GET') {
      return ok({ 'latest-version': SERVER_VERSION });
    }

    if (path === 'usage' && method === 'GET') {
      const state = await loadPortalState(context.env, userId);
      return ok(state.usage);
    }

    if (path === 'usage/export' && method === 'GET') {
      const state = await loadPortalState(context.env, userId);
      return ok(buildUsageExportPayload(state.usage));
    }

    if (path === 'usage/import' && method === 'POST') {
      return ok(await importUsagePayload(context.env, userId, await readJsonBody(context.request)));
    }

    if (path === 'logs') {
      if (method === 'GET') {
        return ok({ lines: [], 'line-count': 0, 'latest-timestamp': 0 });
      }
      if (method === 'DELETE') {
        return ok({ ok: true });
      }
      return fail('Phương thức không được hỗ trợ.', 405);
    }

    if (path === 'request-error-logs' && method === 'GET') {
      return ok({ files: [] });
    }

    if (path.startsWith('request-error-logs/') || path.startsWith('request-log-by-id/')) {
      return fail('Tính năng log file chưa được bật trong backend Cloudflare.', 404);
    }

    const authFilesResponse = await handleAuthFiles(context.env, userId, path, context.request);
    if (authFilesResponse) {
      return authFilesResponse;
    }

    if (path.startsWith('model-definitions/') && method === 'GET') {
      const channel = decodeURIComponent(path.slice('model-definitions/'.length));
      return ok({ models: await getModelDefinitionsForChannel(context.env, userId, channel) });
    }

    if (path === 'oauth-excluded-models') {
      if (method === 'GET') {
        const state = await loadPortalState(context.env, userId);
        return ok({ 'oauth-excluded-models': getOAuthExcludedModels(state.config) });
      }
      if (method === 'PUT') {
        const body = await readJsonBody<Record<string, string[]>>(context.request);
        const config = await mutatePortalConfig(context.env, userId, (draft) =>
          replaceOAuthExcludedModels(draft, body || {})
        );
        return ok({ 'oauth-excluded-models': getOAuthExcludedModels(config) });
      }
      if (method === 'PATCH') {
        const body = await readPatchBody(context.request);
        const provider = String(body.provider ?? '').trim();
        const models = normalizeExcludedModelsList(body.models);
        const config = await mutatePortalConfig(context.env, userId, (draft) =>
          setOAuthExcludedModels(draft, provider, models)
        );
        return ok({ 'oauth-excluded-models': getOAuthExcludedModels(config) });
      }
      if (method === 'DELETE') {
        const provider = String(new URL(context.request.url).searchParams.get('provider') ?? '').trim();
        const config = await mutatePortalConfig(context.env, userId, (draft) =>
          setOAuthExcludedModels(draft, provider, [])
        );
        return ok({ 'oauth-excluded-models': getOAuthExcludedModels(config) });
      }
      return fail('Phương thức không được hỗ trợ.', 405);
    }

    if (path === 'oauth-model-alias') {
      if (method === 'GET') {
        const state = await loadPortalState(context.env, userId);
        return ok({ 'oauth-model-alias': getOAuthModelAlias(state.config) });
      }
      if (method === 'PATCH') {
        const body = await readPatchBody(context.request);
        const channel = String(body.channel ?? '').trim();
        const aliases = Array.isArray(body.aliases) ? body.aliases : [];
        const config = await mutatePortalConfig(context.env, userId, (draft) =>
          setOAuthModelAlias(draft, channel, aliases as never[])
        );
        return ok({ 'oauth-model-alias': getOAuthModelAlias(config) });
      }
      if (method === 'DELETE') {
        const channel = String(new URL(context.request.url).searchParams.get('channel') ?? '').trim();
        const config = await mutatePortalConfig(context.env, userId, (draft) =>
          setOAuthModelAlias(draft, channel, [])
        );
        return ok({ 'oauth-model-alias': getOAuthModelAlias(config) });
      }
      return fail('Phương thức không được hỗ trợ.', 405);
    }

    if (PROVIDER_ARRAY_PATHS.has(path)) {
      return handleProviderArray(context.env, userId, path, context.request);
    }

    if (path === 'ampcode' && method === 'GET') {
      const state = await loadPortalState(context.env, userId);
      return ok(isRecord(state.config.ampcode) ? state.config.ampcode : {});
    }

    if (path === 'ampcode/upstream-api-keys') {
      if (method === 'DELETE') {
        return handleAmpcodeCollectionDelete(context.env, userId, 'ampcode/upstream-api-keys', context.request);
      }
      return handleConfigSection(context.env, userId, path, context.request);
    }

    if (path === 'ampcode/model-mappings') {
      if (method === 'DELETE') {
        return handleAmpcodeCollectionDelete(context.env, userId, 'ampcode/model-mappings', context.request);
      }
      return handleConfigSection(context.env, userId, path, context.request);
    }

    if (
      BOOLEAN_SECTION_PATHS.has(path) ||
      NUMBER_SECTION_PATHS.has(path) ||
      STRING_SECTION_PATHS.has(path)
    ) {
      return handleConfigSection(context.env, userId, path, context.request);
    }

    if (path === 'api-call' && method === 'POST') {
      return handleApiCall(context.env, userId, context.request);
    }

    if (path === 'vertex/import' && method === 'POST') {
      const formData = await context.request.formData();
      const file = formData.get('file');
      const location = String(formData.get('location') ?? '').trim();
      if (!(file instanceof File)) {
        return fail('Thiếu file credential Vertex.', 400);
      }
      const content = await file.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        const candidate = JSON.parse(content) as unknown;
        parsed = isRecord(candidate) ? candidate : null;
      } catch {
        parsed = null;
      }
      const projectId = String(parsed?.project_id ?? parsed?.quota_project_id ?? parsed?.projectId ?? '').trim();
      const email = String(parsed?.client_email ?? parsed?.email ?? '').trim();
      const authFileName = `${projectId || 'vertex'}-${Date.now()}.json`;
      await upsertPortalAuthFile(context.env, userId, {
        name: authFileName,
        content,
        provider: 'vertex',
      });
      return ok({
        status: 'ok',
        project_id: projectId || undefined,
        email: email || undefined,
        location: location || undefined,
        'auth-file': authFileName,
      });
    }

    if (path === 'iflow-auth-url' && method === 'POST') {
      const body = await readPatchBody(context.request);
      const cookie = String(body.cookie ?? '').trim();
      if (!cookie) {
        return fail('Thiếu cookie iFlow để lưu.', 400);
      }
      return ok(await authenticateIFlowCookie(context.env, userId, cookie));
    }

    if (path === 'codex-auth-url' && method === 'GET') {
      return ok(await startUpstreamOAuth(context.env, userId, 'codex'));
    }

    if (path === 'anthropic-auth-url' && method === 'GET') {
      return ok(await startUpstreamOAuth(context.env, userId, 'anthropic'));
    }

    if (path === 'antigravity-auth-url' && method === 'GET') {
      return ok(await startUpstreamOAuth(context.env, userId, 'antigravity'));
    }

    if (path === 'gemini-cli-auth-url' && method === 'GET') {
      const projectId = String(new URL(context.request.url).searchParams.get('project_id') ?? '').trim();
      return ok(await startUpstreamOAuth(context.env, userId, 'gemini', { projectId }));
    }

    if (path === 'qwen-auth-url' && method === 'GET') {
      return ok(await startUpstreamOAuth(context.env, userId, 'qwen'));
    }

    if (path === 'kimi-auth-url' && method === 'GET') {
      return ok(await startUpstreamOAuth(context.env, userId, 'kimi'));
    }

    if (path === 'get-auth-status' && method === 'GET') {
      const state = String(new URL(context.request.url).searchParams.get('state') ?? '').trim();
      return ok(await getUpstreamOAuthStatus(context.env, userId, state));
    }

    if (path === 'oauth-callback' && method === 'POST') {
      const body = await readPatchBody(context.request);
      return ok(
        await submitUpstreamOAuthCallback(context.env, userId, {
          provider: String(body.provider ?? '').trim(),
          redirectUrl: String(body.redirect_url ?? '').trim(),
          code: String(body.code ?? '').trim(),
          state: String(body.state ?? '').trim(),
          error: String(body.error ?? '').trim(),
        })
      );
    }

    if (
      [
        'codex-auth-url',
        'anthropic-auth-url',
        'antigravity-auth-url',
        'gemini-cli-auth-url',
        'kimi-auth-url',
        'qwen-auth-url',
        'get-auth-status',
        'oauth-callback',
      ].includes(path)
    ) {
      return fail(
        'Luồng OAuth tài khoản upstream chưa được bóc tách hoàn chỉnh sang Cloudflare-only. Hiện tại hãy dùng upload auth file hoặc iFlow cookie/Vertex import.',
        501
      );
    }

    return fail(`Không tìm thấy endpoint management cho "${path}".`, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Management backend Cloudflare gặp lỗi.';
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? Number((error as { status?: number }).status)
        : 500;
    return fail(message, status);
  }
};
