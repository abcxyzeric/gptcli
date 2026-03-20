import { authenticateLocalUser, createSession, makeSessionCookie } from '../../_lib/auth';
import { AppEnv, errorResponse, json, readJsonBody } from '../../_lib/http';

type LoginBody = {
  email?: string;
  password?: string;
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    const body = await readJsonBody<LoginBody>(context.request);
    const email = String(body.email || '').trim();
    const password = String(body.password || '');

    if (!email || !password) {
      return errorResponse('Vui lòng nhập email và mật khẩu.');
    }

    const user = await authenticateLocalUser(context.env, { email, password });
    const sessionToken = await createSession(context.env, user.id);

    return json(
      {
        ok: true,
        user,
      },
      {
        headers: {
          'set-cookie': makeSessionCookie(sessionToken, context.request),
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Đăng nhập thất bại.';
    const status = message.includes('không đúng') ? 401 : 400;
    return errorResponse(message, status);
  }
};
