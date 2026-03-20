import { AppEnv } from '../_lib/http';
import {
  authenticatePublicRequest,
  buildOpenAiModelsPayload,
  getPublicModelsForUser,
  handlePublicOptions,
  publicError,
  publicJson,
} from '../_lib/public-api';

export const onRequestOptions: PagesFunction<AppEnv> = async () => handlePublicOptions();

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const auth = await authenticatePublicRequest(context.env, context.request);
  if (!auth) {
    return publicError('Thiếu hoặc sai Bearer access key.', 401);
  }

  try {
    const models = await getPublicModelsForUser(context.env, auth.userId);
    return publicJson(buildOpenAiModelsPayload(models));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể tải danh sách model.';
    return publicError(message, 500);
  }
};
