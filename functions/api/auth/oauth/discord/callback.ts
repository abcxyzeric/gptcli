import { handleDiscordCallback } from '../../../../_lib/oauth';
import { AppEnv } from '../../../../_lib/http';

export const onRequestGet: PagesFunction<AppEnv> = async (context) =>
  handleDiscordCallback(context.env, context.request);
