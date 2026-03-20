const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export const SESSION_COOKIE_NAME = 'cpw_session';
export const OAUTH_STATE_COOKIE_NAME = 'cpw_oauth_state';

export type AppEnv = {
  DB: D1Database;
  APP_URL?: string;
  SESSION_SECRET?: string;
  DATA_ENCRYPTION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
};

export const json = (data: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  Object.entries(JSON_HEADERS).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
};

export const errorResponse = (
  message: string,
  status = 400,
  details?: Record<string, unknown>
) =>
  json(
    {
      ok: false,
      message,
      ...(details ? { details } : {}),
    },
    { status }
  );

export const redirect = (location: string, headers?: HeadersInit, status = 302) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('location', location);
  responseHeaders.set('cache-control', 'no-store');
  return new Response(null, { status, headers: responseHeaders });
};

export const getCookie = (request: Request, name: string): string | null => {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
};

type CookieOptions = {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export const serializeCookie = (
  name: string,
  value: string,
  options: CookieOptions = {}
): string => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  if (options.secure !== false) {
    parts.push('Secure');
  }
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
};

export const clearCookie = (name: string): string =>
  serializeCookie(name, '', {
    maxAge: 0,
  });

export const ensureEnv = (value: string | undefined, name: string): string => {
  const trimmed = String(value || '').trim();
  if (!trimmed || /^replace[-_ ]with/i.test(trimmed) || /^replace_/i.test(trimmed)) {
    throw new Error(`Thiếu biến môi trường ${name}.`);
  }
  return trimmed;
};

export const normalizeOrigin = (raw: string): string => raw.replace(/\/+$/, '');

export const shouldUseSecureCookies = (request: Request) => {
  const url = new URL(request.url);
  if (url.protocol === 'https:') {
    return true;
  }
  return !(url.hostname === '127.0.0.1' || url.hostname === 'localhost');
};

export const getAppBaseUrl = (env: AppEnv, request: Request): string => {
  const requestUrl = new URL(request.url);
  const configured = String(env.APP_URL || '').trim();
  return configured ? normalizeOrigin(configured) : requestUrl.origin;
};

export const buildHashRedirect = (
  env: AppEnv,
  request: Request,
  hashPath: string,
  searchParams?: URLSearchParams
) => {
  const base = getAppBaseUrl(env, request);
  const suffix = searchParams && Array.from(searchParams.keys()).length > 0 ? `?${searchParams}` : '';
  return `${base}/#${hashPath}${suffix}`;
};

export const readJsonBody = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Dữ liệu gửi lên không phải JSON hợp lệ.');
  }
};
