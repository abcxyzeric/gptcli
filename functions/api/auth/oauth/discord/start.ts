import { buildMissingProviderRedirect, startDiscordOAuth } from '../../../../_lib/oauth';
import { AppEnv } from '../../../../_lib/http';

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    return await startDiscordOAuth(context.env, context.request);
  } catch {
    return buildMissingProviderRedirect(context.env, context.request, 'discord');
  }
};
