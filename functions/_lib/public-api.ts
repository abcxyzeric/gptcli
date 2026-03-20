import { getSession } from './auth';
import { AppEnv, errorResponse, json } from './http';
import {
  findUserIdByApiKey,
  getModelDefinitionsForChannel,
  getPortalAuthFile,
  listPortalAuthFiles,
  loadPortalState,
  type ModelDefinition,
  upsertPortalAuthFile,
  upsertUsageEvent,
} from './portal';

const PUBLIC_API_ALLOW_HEADERS = 'Authorization, Content-Type, Accept, X-Requested-With';
const PUBLIC_API_ALLOW_METHODS = 'GET, POST, OPTIONS';
const PUBLIC_API_MAX_AGE = '86400';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GEMINI_CLI_GENERATE_URL = 'https://cloudcode-pa.googleapis.com/v1internal:generateContent';
const GEMINI_USER_AGENT =
  'GeminiCLI/1.0.0 (Cloudflare Pages Functions; +https://gptcli.pages.dev)';
const GEMINI_API_CLIENT = 'google-genai-sdk/1.41.0 gl-node/v22.19.0';
const DEFAULT_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

type PublicAuthContext = {
  userId: string;
  via: 'session' | 'api-key';
};

type OpenAiChatMessage = {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
};

type OpenAiChatRequest = {
  model?: string;
  messages?: OpenAiChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  stop?: string | string[];
  n?: number;
  reasoning_effort?: string;
  tools?: Array<{
    type?: string;
    function?: {
      name?: string;
      description?: string;
      parameters?: unknown;
    };
  }>;
};

type GoogleCredential = {
  raw: Record<string, unknown>;
  tokenRoot: Record<string, unknown>;
  nestedToken: boolean;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenUri: string;
  expiry: string;
  projectId: string;
  email: string;
};

type GoogleAuthSelection = {
  name: string;
  provider: string;
  authIndex: string | number | null;
  credential: GoogleCredential;
};

type OpenAiCompletion = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value: unknown) => String(value ?? '').trim();

const mergeModelLists = (...groups: Array<ModelDefinition[] | undefined>) => {
  const merged: ModelDefinition[] = [];
  const seen = new Set<string>();
  groups.forEach((group) => {
    (group || []).forEach((model) => {
      const id = normalizeString(model.id);
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

const unixNow = () => Math.floor(Date.now() / 1000);

const readBearerToken = (request: Request) => {
  const authorization = normalizeString(request.headers.get('authorization'));
  if (!authorization) return '';
  const parts = authorization.split(/\s+/, 2);
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1].trim();
  }
  return authorization;
};

const buildCorsHeaders = (headers?: HeadersInit) => {
  const next = new Headers(headers);
  next.set('access-control-allow-origin', '*');
  next.set('access-control-allow-methods', PUBLIC_API_ALLOW_METHODS);
  next.set('access-control-allow-headers', PUBLIC_API_ALLOW_HEADERS);
  next.set('access-control-max-age', PUBLIC_API_MAX_AGE);
  next.set('cache-control', 'no-store');
  next.set('vary', 'Origin');
  return next;
};

export const withPublicApiHeaders = (response: Response) => {
  const headers = buildCorsHeaders(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const publicJson = (data: unknown, init: ResponseInit = {}) =>
  withPublicApiHeaders(json(data, init));

export const publicError = (
  message: string,
  status = 400,
  details?: Record<string, unknown>
) => withPublicApiHeaders(errorResponse(message, status, details));

export const handlePublicOptions = () =>
  new Response(null, {
    status: 204,
    headers: buildCorsHeaders(),
  });

export const authenticatePublicRequest = async (
  env: AppEnv,
  request: Request
): Promise<PublicAuthContext | null> => {
  const session = await getSession(env, request);
  if (session) {
    return {
      userId: session.user.id,
      via: 'session',
    };
  }

  const apiKey = readBearerToken(request);
  if (!apiKey) {
    return null;
  }

  const userId = await findUserIdByApiKey(env, apiKey);
  if (!userId) {
    return null;
  }

  return {
    userId,
    via: 'api-key',
  };
};

export const getPublicModelsForUser = async (env: AppEnv, userId: string) => {
  const state = await loadPortalState(env, userId);
  const authFiles = await listPortalAuthFiles(env, userId);
  const providers = new Set<string>();

  authFiles.forEach((file) => {
    if (file.disabled) return;
    const provider = normalizeString(file.provider || file.type).toLowerCase();
    if (provider) {
      providers.add(provider);
    }
  });

  const config = state.config;
  if (Array.isArray(config['gemini-api-key']) && config['gemini-api-key'].length) providers.add('gemini');
  if (Array.isArray(config['codex-api-key']) && config['codex-api-key'].length) providers.add('codex');
  if (Array.isArray(config['claude-api-key']) && config['claude-api-key'].length) providers.add('claude');
  if (Array.isArray(config['vertex-api-key']) && config['vertex-api-key'].length) providers.add('vertex');
  if (Array.isArray(config['openai-compatibility']) && config['openai-compatibility'].length)
    providers.add('openai');

  const providerList = Array.from(providers);
  if (!providerList.length) {
    return [] as ModelDefinition[];
  }

  const groups = await Promise.all(
    providerList.map((provider) => getModelDefinitionsForChannel(env, userId, provider))
  );

  return mergeModelLists(...groups);
};

export const buildOpenAiModelsPayload = (models: ModelDefinition[]) => ({
  object: 'list' as const,
  data: models.map((model) => ({
    id: model.id,
    object: 'model' as const,
    created: 0,
    owned_by: model.owned_by || 'clipproxy',
    ...(model.display_name ? { display_name: model.display_name } : {}),
  })),
});

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
  const payload = await parseJsonSafe<Record<string, unknown>>(response.clone());
  const message =
    normalizeString(payload?.error_description) ||
    normalizeString((payload?.error as Record<string, unknown> | undefined)?.message) ||
    normalizeString(payload?.message) ||
    normalizeString(payload?.error);
  if (message) {
    return message;
  }
  const text = await response.text();
  return normalizeString(text) || `HTTP ${response.status}`;
};

const expiryFromTokenPayload = (payload: Record<string, unknown>, fallback = '') => {
  const expiresIn = Number(payload.expires_in || 0) || 0;
  if (expiresIn > 0) {
    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  const payloadExpiry =
    normalizeString(payload.expiry) ||
    normalizeString(payload.expiry_date) ||
    normalizeString(payload.expired);
  return payloadExpiry || fallback;
};

const parseGoogleCredential = (content: string): GoogleCredential | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const raw = parsed as Record<string, unknown>;
  const nestedToken = isRecord(raw.token);
  const tokenRoot = nestedToken ? (raw.token as Record<string, unknown>) : raw;
  const accessToken =
    normalizeString(tokenRoot.access_token) ||
    normalizeString(raw.access_token) ||
    (!nestedToken ? normalizeString(raw.token) : '');
  const refreshToken = normalizeString(tokenRoot.refresh_token) || normalizeString(raw.refresh_token);
  const clientId = normalizeString(tokenRoot.client_id) || normalizeString(raw.client_id);
  const clientSecret = normalizeString(tokenRoot.client_secret) || normalizeString(raw.client_secret);
  const tokenUri =
    normalizeString(tokenRoot.token_uri) || normalizeString(raw.token_uri) || GOOGLE_TOKEN_URL;
  const expiry =
    normalizeString(tokenRoot.expiry) ||
    normalizeString(tokenRoot.expiry_date) ||
    normalizeString(raw.expiry) ||
    normalizeString(raw.expiry_date) ||
    normalizeString(raw.expired);
  const projectId =
    normalizeString(raw.project_id) ||
    normalizeString(raw.projectId) ||
    normalizeString(raw.quota_project_id);
  const email = normalizeString(raw.email);

  if (!refreshToken && !accessToken) {
    return null;
  }

  return {
    raw,
    tokenRoot,
    nestedToken,
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    tokenUri,
    expiry,
    projectId,
    email,
  };
};

const isExpiredOrUnknown = (expiry: string) => {
  const timestamp = Date.parse(expiry);
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return timestamp <= Date.now() + 60_000;
};

const pickProjectId = (rawProjectId: string) => {
  const parts = rawProjectId
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parts[0] || '';
};

const normalizeToolResult = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseDataUrlPart = (url: string) => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(url);
  if (!match) {
    return null;
  }
  return {
    inlineData: {
      mime_type: match[1],
      data: match[2],
    },
  };
};

const buildGeminiPartsFromContent = (content: unknown) => {
  if (typeof content === 'string') {
    return content ? [{ text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const parts: Array<Record<string, unknown>> = [];
  content.forEach((item) => {
    if (!isRecord(item)) return;
    const type = normalizeString(item.type);
    if (type === 'text') {
      const text = normalizeString(item.text);
      if (text) {
        parts.push({ text });
      }
      return;
    }
    if (type === 'image_url') {
      const imageUrl = normalizeString((item.image_url as Record<string, unknown> | undefined)?.url);
      const parsed = parseDataUrlPart(imageUrl);
      if (parsed) {
        parts.push(parsed);
      }
    }
  });
  return parts;
};

const buildGeminiRequestFromOpenAi = (request: OpenAiChatRequest) => {
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const toolCallIdToName = new Map<string, string>();
  const systemParts: Array<Record<string, unknown>> = [];
  const contents: Array<Record<string, unknown>> = [];

  messages.forEach((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return;
    message.tool_calls.forEach((toolCall) => {
      const id = normalizeString(toolCall?.id);
      const name = normalizeString(toolCall?.function?.name);
      if (id && name) {
        toolCallIdToName.set(id, name);
      }
    });
  });

  messages.forEach((message) => {
    const role = normalizeString(message.role).toLowerCase();
    if (!role) return;

    if ((role === 'system' || role === 'developer') && messages.length > 1) {
      const parts = buildGeminiPartsFromContent(message.content);
      parts.forEach((part) => systemParts.push(part));
      return;
    }

    if (role === 'user' || ((role === 'system' || role === 'developer') && messages.length === 1)) {
      const parts = buildGeminiPartsFromContent(message.content);
      if (parts.length) {
        contents.push({ role: 'user', parts });
      }
      return;
    }

    if (role === 'assistant') {
      const parts = buildGeminiPartsFromContent(message.content);
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall) => {
          const name = normalizeString(toolCall?.function?.name);
          const rawArguments = normalizeString(toolCall?.function?.arguments) || '{}';
          let args: unknown = {};
          try {
            args = JSON.parse(rawArguments) as unknown;
          } catch {
            args = {};
          }
          if (name) {
            parts.push({
              functionCall: {
                name,
                args,
              },
            });
          }
        });
      }
      if (parts.length) {
        contents.push({ role: 'model', parts });
      }
      return;
    }

    if (role === 'tool') {
      const toolCallId = normalizeString(message.tool_call_id);
      const functionName = toolCallIdToName.get(toolCallId) || 'tool';
      const result = normalizeToolResult(message.content);
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: {
                result,
              },
            },
          },
        ],
      });
    }
  });

  const generationConfig: Record<string, unknown> = {};
  if (typeof request.temperature === 'number') generationConfig.temperature = request.temperature;
  if (typeof request.top_p === 'number') generationConfig.topP = request.top_p;
  if (typeof request.top_k === 'number') generationConfig.topK = request.top_k;
  if (typeof request.max_tokens === 'number') generationConfig.maxOutputTokens = request.max_tokens;
  if (typeof request.n === 'number' && request.n > 1) generationConfig.candidateCount = request.n;
  if (typeof request.stop === 'string' && request.stop.trim()) {
    generationConfig.stopSequences = [request.stop.trim()];
  } else if (Array.isArray(request.stop)) {
    generationConfig.stopSequences = request.stop.map((item) => normalizeString(item)).filter(Boolean);
  }
  const reasoningEffort = normalizeString(request.reasoning_effort).toLowerCase();
  if (reasoningEffort) {
    generationConfig.thinkingConfig =
      reasoningEffort === 'auto'
        ? { thinkingBudget: -1, includeThoughts: true }
        : { thinkingLevel: reasoningEffort, includeThoughts: reasoningEffort !== 'none' };
  }

  const geminiRequest: Record<string, unknown> = {
    request: {
      contents,
      safetySettings: DEFAULT_SAFETY_SETTINGS,
    },
  };
  if (systemParts.length) {
    (geminiRequest.request as Record<string, unknown>).systemInstruction = {
      role: 'user',
      parts: systemParts,
    };
  }
  if (Object.keys(generationConfig).length) {
    (geminiRequest.request as Record<string, unknown>).generationConfig = generationConfig;
  }

  if (Array.isArray(request.tools) && request.tools.length) {
    const functionDeclarations = request.tools
      .map((tool) => {
        if (!isRecord(tool) || normalizeString(tool.type) !== 'function' || !isRecord(tool.function)) {
          return null;
        }
        const fn = tool.function as Record<string, unknown>;
        const name = normalizeString(fn.name);
        if (!name) return null;
        return {
          name,
          description: normalizeString(fn.description),
          parametersJsonSchema: isRecord(fn.parameters) ? fn.parameters : { type: 'object', properties: {} },
        };
      })
      .filter(Boolean);

    if (functionDeclarations.length) {
      (geminiRequest.request as Record<string, unknown>).tools = [
        {
          functionDeclarations,
        },
      ];
    }
  }

  return geminiRequest;
};

const mapGeminiFinishReason = (value: string | null) => {
  const normalized = normalizeString(value).toUpperCase();
  switch (normalized) {
    case 'MAX_TOKENS':
      return 'length';
    case 'STOP':
      return 'stop';
    case 'SAFETY':
      return 'content_filter';
    default:
      return normalized ? 'stop' : null;
  }
};

const buildOpenAiCompletionFromGemini = (
  payload: Record<string, unknown>,
  requestedModel: string
): OpenAiCompletion => {
  const root = isRecord(payload.response) ? (payload.response as Record<string, unknown>) : payload;
  const candidate = Array.isArray(root.candidates) && isRecord(root.candidates[0]) ? (root.candidates[0] as Record<string, unknown>) : {};
  const contentRoot = isRecord(candidate.content) ? (candidate.content as Record<string, unknown>) : {};
  const parts = Array.isArray(contentRoot.parts) ? contentRoot.parts : [];

  let content = '';
  let reasoning = '';
  const toolCalls: OpenAiCompletion['choices'][0]['message']['tool_calls'] = [];

  parts.forEach((part) => {
    if (!isRecord(part)) return;
    const text = normalizeString(part.text);
    if (text) {
      if (part.thought === true) {
        reasoning += text;
      } else {
        content += text;
      }
      return;
    }

    if (isRecord(part.functionCall)) {
      const functionCall = part.functionCall as Record<string, unknown>;
      const name = normalizeString(functionCall.name);
      const args = isRecord(functionCall.args) || Array.isArray(functionCall.args)
        ? JSON.stringify(functionCall.args)
        : normalizeString(functionCall.args) || '{}';
      if (name) {
        toolCalls.push({
          id: `call_${crypto.randomUUID().replace(/-/g, '')}`,
          type: 'function',
          function: {
            name,
            arguments: args,
          },
        });
      }
    }
  });

  const usageRoot = isRecord(root.usageMetadata) ? (root.usageMetadata as Record<string, unknown>) : null;
  const promptTokens = Number(usageRoot?.promptTokenCount || 0) || 0;
  const completionTokens = Number(usageRoot?.candidatesTokenCount || 0) || 0;
  const totalTokens = Number(usageRoot?.totalTokenCount || 0) || promptTokens + completionTokens;
  const reasoningTokens = Number(usageRoot?.thoughtsTokenCount || 0) || 0;
  const cachedTokens = Number(usageRoot?.cachedContentTokenCount || 0) || 0;

  const message: OpenAiCompletion['choices'][0]['message'] = {
    role: 'assistant',
    content: content || (toolCalls.length ? null : ''),
  };
  if (toolCalls.length) {
    message.tool_calls = toolCalls;
  }
  if (reasoning) {
    message.reasoning_content = reasoning;
  }

  return {
    id: normalizeString(root.responseId) || `chatcmpl_${crypto.randomUUID().replace(/-/g, '')}`,
    object: 'chat.completion',
    created: unixNow(),
    model: normalizeString(root.modelVersion) || requestedModel,
    choices: [
      {
        index: 0,
        message,
        finish_reason:
          toolCalls.length > 0
            ? 'tool_calls'
            : mapGeminiFinishReason(normalizeString(candidate.finishReason) || normalizeString(root.stop_reason)),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      ...(cachedTokens > 0
        ? {
            prompt_tokens_details: {
              cached_tokens: cachedTokens,
            },
          }
        : {}),
      ...(reasoningTokens > 0
        ? {
            completion_tokens_details: {
              reasoning_tokens: reasoningTokens,
            },
          }
        : {}),
    },
  };
};

const buildSyntheticOpenAiStream = (completion: OpenAiCompletion) => {
  const choice = completion.choices[0];
  const chunks: string[] = [];

  const baseChunk = {
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: completion.model,
  };

  const message = choice.message;
  if (message.content) {
    chunks.push(
      `data: ${JSON.stringify({
        ...baseChunk,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: message.content,
              ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );
  } else if (message.tool_calls?.length) {
    chunks.push(
      `data: ${JSON.stringify({
        ...baseChunk,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: message.tool_calls,
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );
  } else {
    chunks.push(
      `data: ${JSON.stringify({
        ...baseChunk,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: '',
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );
  }

  chunks.push(
    `data: ${JSON.stringify({
      ...baseChunk,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: choice.finish_reason,
        },
      ],
      ...(completion.usage ? { usage: completion.usage } : {}),
    })}\n\n`
  );
  chunks.push('data: [DONE]\n\n');
  return chunks.join('');
};

const listGoogleAuthForModel = async (
  env: AppEnv,
  userId: string,
  model: string
): Promise<GoogleAuthSelection[]> => {
  const normalizedModel = normalizeString(model).toLowerCase();
  if (!normalizedModel.startsWith('gemini')) {
    throw new Error(`Model "${model}" hiện chưa được backend Cloudflare hỗ trợ. Hãy dùng model Gemini trước.`);
  }

  const files = await listPortalAuthFiles(env, userId);
  const candidates = files.filter((file) => {
    if (file.disabled) return false;
    const provider = normalizeString(file.provider || file.type).toLowerCase();
    return provider === 'gemini' || provider === 'gemini-cli';
  });

  const result: GoogleAuthSelection[] = [];
  for (const file of candidates) {
    const stored = await getPortalAuthFile(env, userId, file.name);
    if (!stored) continue;
    const credential = parseGoogleCredential(stored.content);
    if (!credential) continue;
    const projectId = pickProjectId(credential.projectId);
    if (!projectId) continue;
    result.push({
      name: file.name,
      provider: normalizeString(file.provider || file.type) || 'gemini',
      authIndex: file.authIndex ?? null,
      credential: {
        ...credential,
        projectId,
      },
    });
  }

  if (!result.length) {
    throw new Error(
      'Không tìm thấy credential Google/Gemini hợp lệ. Hãy upload file kiểu named-operator...json hoặc gemini-...json trước.'
    );
  }

  return result;
};

const refreshGoogleCredentialIfNeeded = async (
  env: AppEnv,
  userId: string,
  selection: GoogleAuthSelection
) => {
  const current = selection.credential;
  if (current.accessToken && current.expiry && !isExpiredOrUnknown(current.expiry)) {
    return selection;
  }

  if (!current.refreshToken || !current.clientId || !current.clientSecret) {
    if (current.accessToken && !current.expiry) {
      return selection;
    }
    throw new Error('Credential Google hiện tại thiếu refresh_token hoặc client credential để làm mới access token.');
  }

  const response = await fetch(current.tokenUri || GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: current.clientId,
      client_secret: current.clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Không thể làm mới token Google: ${await readResponseError(response)}`);
  }

  const tokenPayload = ((await response.json()) as Record<string, unknown>) || {};
  const accessToken = normalizeString(tokenPayload.access_token);
  if (!accessToken) {
    throw new Error('Google token endpoint không trả về access_token hợp lệ.');
  }

  const nextExpiry = expiryFromTokenPayload(tokenPayload, current.expiry);
  let nextRaw: Record<string, unknown>;
  if (current.nestedToken) {
    nextRaw = {
      ...current.raw,
      token: {
        ...current.tokenRoot,
        ...tokenPayload,
        access_token: accessToken,
        refresh_token: current.refreshToken,
        client_id: current.clientId,
        client_secret: current.clientSecret,
        token_uri: current.tokenUri || GOOGLE_TOKEN_URL,
        expiry: nextExpiry,
      },
    };
  } else {
    nextRaw = {
      ...current.raw,
      ...tokenPayload,
      token: accessToken,
      access_token: accessToken,
      refresh_token: current.refreshToken,
      client_id: current.clientId,
      client_secret: current.clientSecret,
      token_uri: current.tokenUri || GOOGLE_TOKEN_URL,
      expiry: nextExpiry,
    };
  }

  await upsertPortalAuthFile(env, userId, {
    name: selection.name,
    content: JSON.stringify(nextRaw, null, 2),
    provider: selection.provider,
  });

  const reparsed = parseGoogleCredential(JSON.stringify(nextRaw));
  if (!reparsed) {
    throw new Error('Không thể đọc lại credential Google sau khi refresh token.');
  }

  return {
    ...selection,
    credential: {
      ...reparsed,
      projectId: pickProjectId(reparsed.projectId),
    },
  };
};

export const runGeminiOpenAiChatCompletion = async (
  env: AppEnv,
  userId: string,
  requestBody: OpenAiChatRequest
) => {
  const model = normalizeString(requestBody.model) || 'gemini-2.5-pro';
  const upstreamBodyBase = buildGeminiRequestFromOpenAi(requestBody) as Record<string, unknown>;
  const candidates = await listGoogleAuthForModel(env, userId, model);
  let lastError = 'Không có credential Gemini nào chạy thành công.';

  for (const candidate of candidates) {
    try {
      const selection = await refreshGoogleCredentialIfNeeded(env, userId, candidate);
      const accessToken = selection.credential.accessToken;
      if (!accessToken) {
        throw new Error('Credential Google chưa có access token hợp lệ.');
      }

      const upstreamBody = {
        ...upstreamBodyBase,
        project: selection.credential.projectId,
        model,
      };

      const upstreamResponse = await fetch(GEMINI_CLI_GENERATE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': GEMINI_USER_AGENT,
          'x-goog-api-client': GEMINI_API_CLIENT,
        },
        body: JSON.stringify(upstreamBody),
      });

      if (!upstreamResponse.ok) {
        throw new Error(`Gemini CLI upstream lỗi ${upstreamResponse.status}: ${await readResponseError(upstreamResponse)}`);
      }

      const upstreamPayload = ((await upstreamResponse.json()) as Record<string, unknown>) || {};
      const completion = buildOpenAiCompletionFromGemini(upstreamPayload, model);
      await upsertUsageEvent(env, userId, {
        endpoint: 'POST /v1/chat/completions',
        model,
        source: 'cloudcode-pa.googleapis.com',
        authIndex: selection.authIndex,
        failed: false,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        cachedTokens: completion.usage?.prompt_tokens_details?.cached_tokens,
        reasoningTokens: completion.usage?.completion_tokens_details?.reasoning_tokens,
      });

      return {
        completion,
        streamText: requestBody.stream ? buildSyntheticOpenAiStream(completion) : '',
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Credential Gemini hiện tại không dùng được.';
    }
  }

  await upsertUsageEvent(env, userId, {
    endpoint: 'POST /v1/chat/completions',
    model,
    source: 'cloudcode-pa.googleapis.com',
    failed: true,
  });
  throw new Error(lastError);
};
