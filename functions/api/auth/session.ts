import { getSession } from '../../_lib/auth';
import { AppEnv, json } from '../../_lib/http';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const session = await getSession(context.env, context.request);

  return json({
    ok: true,
    authenticated: Boolean(session),
    user: session?.user || null,
  });
};
