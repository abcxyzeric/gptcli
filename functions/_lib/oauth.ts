import { AppEnv, buildHashRedirect, ensureEnv, redirect } from './http';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createOAuthState,
  createSession,
  makeSessionCookie,
  upsertOAuthUser,
  validateOAuthState,
} from './auth';

const authHeaders = {
  'content-type': 'application/x-www-form-urlencoded',
};

type OAuthProvider = 'google' | 'discord';

const buildProviderErrorRedirect = (
  env: AppEnv,
  request: Request,
  provider: OAuthProvider,
  reason: string
) => {
  const params = new URLSearchParams({
    authError: `${provider}:${reason}`,
  });
  return buildHashRedirect(env, request, '/login', params);
};

export const startGoogleOAuth = async (env: AppEnv, request: Request) => {
  const clientId = ensureEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
  const redirectUri = `${buildHashRedirect(env, request, '').replace(/\/#$/, '')}/api/auth/oauth/google/callback`;
  const { payload, cookie } = createOAuthState('google', request);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: payload.state,
    prompt: 'select_account',
    access_type: 'offline',
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, {
    'set-cookie': cookie,
  });
};

export const handleGoogleCallback = async (env: AppEnv, request: Request) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code') || '';
  const state = requestUrl.searchParams.get('state') || '';
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return redirect(buildProviderErrorRedirect(env, request, 'google', error), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  if (!code || !state || !validateOAuthState(request, 'google', state)) {
    return redirect(buildProviderErrorRedirect(env, request, 'google', 'state_invalid'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const clientId = ensureEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
  const clientSecret = ensureEnv(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET');
  const redirectUri = `${buildHashRedirect(env, request, '').replace(/\/#$/, '')}/api/auth/oauth/google/callback`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: authHeaders,
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    return redirect(buildProviderErrorRedirect(env, request, 'google', 'token_exchange_failed'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  const accessToken = tokenData.access_token || '';
  if (!accessToken) {
    return redirect(buildProviderErrorRedirect(env, request, 'google', 'token_missing'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    return redirect(buildProviderErrorRedirect(env, request, 'google', 'profile_failed'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  const email = String(profile.email || '').trim().toLowerCase();
  if (!profile.sub || !email) {
    return redirect(buildProviderErrorRedirect(env, request, 'google', 'profile_invalid'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const user = await upsertOAuthUser(env, {
    provider: 'google',
    providerUserId: String(profile.sub),
    email,
    displayName: String(profile.name || email.split('@')[0] || 'Google User'),
    avatarUrl: profile.picture || null,
  });

  const sessionToken = await createSession(env, user.id);
  const headers = new Headers();
  headers.append('set-cookie', clearOAuthStateCookie(request));
  headers.append('set-cookie', makeSessionCookie(sessionToken, request));
  return redirect(buildHashRedirect(env, request, '/'), headers);
};

const buildDiscordAvatarUrl = (id: string, avatar: string | null | undefined) => {
  if (!avatar) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256`;
};

export const startDiscordOAuth = async (env: AppEnv, request: Request) => {
  const clientId = ensureEnv(env.DISCORD_CLIENT_ID, 'DISCORD_CLIENT_ID');
  const redirectUri = `${buildHashRedirect(env, request, '').replace(/\/#$/, '')}/api/auth/oauth/discord/callback`;
  const { payload, cookie } = createOAuthState('discord', request);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify email',
    prompt: 'consent',
    state: payload.state,
  });

  return redirect(`https://discord.com/oauth2/authorize?${params.toString()}`, {
    'set-cookie': cookie,
  });
};

export const handleDiscordCallback = async (env: AppEnv, request: Request) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code') || '';
  const state = requestUrl.searchParams.get('state') || '';
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return redirect(buildProviderErrorRedirect(env, request, 'discord', error), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  if (!code || !state || !validateOAuthState(request, 'discord', state)) {
    return redirect(buildProviderErrorRedirect(env, request, 'discord', 'state_invalid'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const clientId = ensureEnv(env.DISCORD_CLIENT_ID, 'DISCORD_CLIENT_ID');
  const clientSecret = ensureEnv(env.DISCORD_CLIENT_SECRET, 'DISCORD_CLIENT_SECRET');
  const redirectUri = `${buildHashRedirect(env, request, '').replace(/\/#$/, '')}/api/auth/oauth/discord/callback`;

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: authHeaders,
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    return redirect(buildProviderErrorRedirect(env, request, 'discord', 'token_exchange_failed'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  const accessToken = tokenData.access_token || '';
  if (!accessToken) {
    return redirect(buildProviderErrorRedirect(env, request, 'discord', 'token_missing'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const profileResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!profileResponse.ok) {
    return redirect(buildProviderErrorRedirect(env, request, 'discord', 'profile_failed'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const profile = (await profileResponse.json()) as {
    id?: string;
    email?: string;
    username?: string;
    global_name?: string;
    avatar?: string | null;
  };

  const providerUserId = String(profile.id || '').trim();
  if (!providerUserId) {
    return redirect(buildProviderErrorRedirect(env, request, 'discord', 'profile_invalid'), {
      'set-cookie': clearOAuthStateCookie(request),
    });
  }

  const email =
    String(profile.email || '').trim().toLowerCase() || `discord-${providerUserId}@users.local`;
  const user = await upsertOAuthUser(env, {
    provider: 'discord',
    providerUserId,
    email,
    displayName: String(profile.global_name || profile.username || 'Discord User'),
    avatarUrl: buildDiscordAvatarUrl(providerUserId, profile.avatar),
  });

  const sessionToken = await createSession(env, user.id);
  const headers = new Headers();
  headers.append('set-cookie', clearOAuthStateCookie(request));
  headers.append('set-cookie', makeSessionCookie(sessionToken, request));
  return redirect(buildHashRedirect(env, request, '/'), headers);
};

export const buildMissingProviderRedirect = (
  env: AppEnv,
  request: Request,
  provider: OAuthProvider
) =>
  redirect(buildProviderErrorRedirect(env, request, provider, 'not_configured'), {
    'set-cookie': clearSessionCookie(request),
  });
