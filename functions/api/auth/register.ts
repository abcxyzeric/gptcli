import {
  createLocalUser,
  createSession,
  makeSessionCookie,
  validateEmail,
  validatePassword,
} from '../../_lib/auth';
import { AppEnv, errorResponse, json, readJsonBody } from '../../_lib/http';

type RegisterBody = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  displayName?: string;
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  try {
    const body = await readJsonBody<RegisterBody>(context.request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    const displayName = String(body.displayName || '').trim();

    if (!displayName || !email || !password || !confirmPassword) {
      return errorResponse('Vui lòng nhập đầy đủ thông tin đăng ký.');
    }
    if (!validateEmail(email)) {
      return errorResponse('Email không hợp lệ.');
    }
    if (!validatePassword(password)) {
      return errorResponse('Mật khẩu phải có ít nhất 8 ký tự.');
    }
    if (password !== confirmPassword) {
      return errorResponse('Mật khẩu xác nhận không khớp.');
    }

    const user = await createLocalUser(context.env, { email, password, displayName });
    const sessionToken = await createSession(context.env, user.id);

    return json(
      {
        ok: true,
        user,
      },
      {
        status: 201,
        headers: {
          'set-cookie': makeSessionCookie(sessionToken, context.request),
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Đăng ký thất bại.';
    const status = message.includes('đã được sử dụng') ? 409 : 400;
    return errorResponse(message, status);
  }
};
