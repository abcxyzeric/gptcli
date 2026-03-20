import { buildMissingProviderRedirect, startGoogleOAuth } from '../../../../_lib/oauth';
import { AppEnv } from '../../../../_lib/http';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    return await startGoogleOAuth(context.env, context.request);
  } catch {
    return buildMissingProviderRedirect(context.env, context.request, 'google');
  }
};
