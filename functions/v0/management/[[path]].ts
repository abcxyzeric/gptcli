import { getSession } from '../../_lib/auth';
import { AppEnv, errorResponse } from '../../_lib/http';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const normalizeProxyBase = (raw: string) =>
  raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v0\/management$/i, '');

const buildUpstreamUrl = (request: Request, upstreamBase: string) => {
  const requestUrl = new URL(request.url);
  return `${normalizeProxyBase(upstreamBase)}${requestUrl.pathname}${requestUrl.search}`;
};

const copyProxyResponse = (response: Response) => {
  const headers = new Headers(response.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));
  headers.set('cache-control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  const session = await getSession(context.env, context.request);
  if (!session) {
    return errorResponse('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  }

  const upstreamBase = String(context.env.CLI_PROXY_API_BASE || '').trim();
  const upstreamKey = String(context.env.CLI_PROXY_MANAGEMENT_KEY || '').trim();
  if (!upstreamBase || !upstreamKey) {
    return errorResponse(
      'Web chưa được cấu hình kết nối tới CLIProxyAPI thật. Hãy thêm CLI_PROXY_API_BASE và CLI_PROXY_MANAGEMENT_KEY.',
      503
    );
  }

  try {
    const headers = new Headers(context.request.headers);
    headers.delete('host');
    headers.delete('cookie');
    headers.delete('authorization');
    headers.set('authorization', `Bearer ${upstreamKey}`);
    headers.set('x-web-user-id', session.user.id);
    headers.set('x-web-user-email', session.user.email);
    headers.set('x-web-user-name', session.user.displayName);

    const method = context.request.method.toUpperCase();
    const body =
      method === 'GET' || method === 'HEAD' ? undefined : await context.request.arrayBuffer();

    const upstreamResponse = await fetch(buildUpstreamUrl(context.request, upstreamBase), {
      method,
      headers,
      body,
      redirect: 'manual',
    });

    if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
      return errorResponse(
        'CLIProxyAPI backend từ chối proxy quản trị. Hãy kiểm tra lại CLI_PROXY_MANAGEMENT_KEY ở phía server.',
        502
      );
    }

    return copyProxyResponse(upstreamResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy tới CLIProxyAPI thất bại.';
    return errorResponse(message, 502);
  }
};
