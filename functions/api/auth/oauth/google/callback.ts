import { handleGoogleCallback } from '../../../../_lib/oauth';
import { AppEnv } from '../../../../_lib/http';

export const onRequestGet: PagesFunction<AppEnv> = async (context) =>
  handleGoogleCallback(context.env, context.request);
