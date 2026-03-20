import { getSession } from '../_lib/auth';
import { AppEnv, errorResponse, json } from '../_lib/http';
import { getAllAvailableModels, withServerHeaders } from '../_lib/portal';

const ok = (data: unknown, init: ResponseInit = {}) => withServerHeaders(json(data, init));
const fail = (message: string, status = 400) => withServerHeaders(errorResponse(message, status));

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const session = await getSession(context.env, context.request);
  if (!session) {
    return fail('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  }

  try {
    const models = await getAllAvailableModels(context.env, session.user.id);
    return ok({ data: models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tải danh sách model.';
    return fail(message, 500);
  }
};
