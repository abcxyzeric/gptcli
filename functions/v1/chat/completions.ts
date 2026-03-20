import { AppEnv, readJsonBody } from '../../_lib/http';
import {
  authenticatePublicRequest,
  handlePublicOptions,
  publicError,
  publicJson,
  runGeminiOpenAiChatCompletion,
  withPublicApiHeaders,
} from '../../_lib/public-api';

export const onRequestOptions: PagesFunction<AppEnv> = async () => handlePublicOptions();

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const auth = await authenticatePublicRequest(context.env, context.request);
  if (!auth) {
    return publicError('Thiếu hoặc sai Bearer access key.', 401);
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const { completion, streamText } = await runGeminiOpenAiChatCompletion(
      context.env,
      auth.userId,
      body
    );

    if (body.stream === true) {
      return withPublicApiHeaders(
        new Response(streamText, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
          },
        })
      );
    }

    return publicJson(completion);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể xử lý chat completion.';
    const status =
      /thiếu|không tìm thấy|unsupported|hỗ trợ/i.test(message) && !/upstream lỗi/i.test(message)
        ? 400
        : 502;
    return publicError(message, status);
  }
};
