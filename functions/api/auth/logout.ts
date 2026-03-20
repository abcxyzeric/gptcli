import { clearSessionCookie, destroySession } from '../../_lib/auth';
import { AppEnv, SESSION_COOKIE_NAME, getCookie, json } from '../../_lib/http';

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const token = getCookie(context.request, SESSION_COOKIE_NAME);
  await destroySession(context.env, token);

  return json(
    {
      ok: true,
    },
    {
      headers: {
        'set-cookie': clearSessionCookie(context.request),
      },
    }
  );
};
