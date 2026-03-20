import { AppEnv } from '../_lib/http';
import {
  authenticatePublicRequest,
  buildGoogleAiStudioModelsPayload,
  getPublicModelsForUser,
  handlePublicOptions,
  publicError,
  publicJson,
} from '../_lib/public-api';

export const onRequestOptions: PagesFunction<AppEnv> = async () => handlePublicOptions();

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const auth = await authenticatePublicRequest(context.env, context.request);
  if (!auth) {
    return publicError('Thieu hoac sai access key proxy.', 401);
  }

  try {
    const models = await getPublicModelsForUser(context.env, auth.userId);
    return publicJson(buildGoogleAiStudioModelsPayload(models));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Khong the tai danh sach model.';
    return publicError(message, 502);
  }
};
