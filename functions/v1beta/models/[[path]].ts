import { AppEnv, readJsonBody } from '../../_lib/http';
import {
  authenticatePublicRequest,
  handlePublicOptions,
  publicError,
  publicJson,
  runGeminiGoogleAiStudioRequest,
  withPublicApiHeaders,
} from '../../_lib/public-api';

const MODELS_PREFIX = '/v1beta/models/';

const parseGoogleRoute = (request: Request) => {
  const url = new URL(request.url);
  const rawPath = decodeURIComponent(
    url.pathname.replace(new RegExp(`^${MODELS_PREFIX}`), '').replace(/^\/+|\/+$/g, '')
  );
  const separatorIndex = rawPath.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }

  const model = rawPath.slice(0, separatorIndex).trim();
  const action = rawPath.slice(separatorIndex + 1).trim();
  if (!model || !action) {
    return null;
  }

  return {
    model,
    action,
  };
};

export const onRequestOptions: PagesFunction<AppEnv> = async () => handlePublicOptions();

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const auth = await authenticatePublicRequest(context.env, context.request);
  if (!auth) {
    return publicError('Thieu hoac sai access key proxy.', 401);
  }

  const route = parseGoogleRoute(context.request);
  if (!route) {
    return publicError('Duong dan Google AI Studio proxy khong hop le.', 404);
  }

  const stream = route.action === 'streamGenerateContent';
  if (!stream && route.action !== 'generateContent') {
    return publicError(`Action ${route.action} hien chua duoc ho tro.`, 404);
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const result = await runGeminiGoogleAiStudioRequest(
      context.env,
      auth.userId,
      route.model,
      body,
      stream
    );

    if (stream) {
      return withPublicApiHeaders(
        new Response(result.streamText, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
          },
        })
      );
    }

    return publicJson(result.responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Khong the xu ly request Google AI Studio.';
    const status = /khong|thieu|sai|hop le|model/i.test(message) ? 400 : 502;
    return publicError(message, status);
  }
};
