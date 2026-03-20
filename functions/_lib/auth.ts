import {
  AppEnv,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  getCookie,
  serializeCookie,
  shouldUseSecureCookies,
} from './http';

const PASSWORD_ITERATIONS = 310_000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

const textEncoder = new TextEncoder();

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  session_id: string;
  expires_at: string;
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type IdentityRow = {
  provider: string;
};

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  providers: string[];
  createdAt: string;
  updatedAt: string;
};

export type SessionContext = {
  token: string;
  user: SessionUser;
};

export type OAuthUserProfile = {
  provider: 'google' | 'discord';
  providerUserId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

const nowIso = () => new Date().toISOString();

const base64Url = (input: Uint8Array) =>
  btoa(String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const randomToken = (bytes = 32) => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizeDisplayName = (displayName: string, email: string) => {
  const trimmed = displayName.trim();
  if (trimmed) {
    return trimmed.slice(0, 60);
  }
  const [localPart] = email.split('@');
  return (localPart || 'Người dùng').slice(0, 60);
};

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const derivePasswordHash = async (password: string, salt: string, iterations: number) => {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: textEncoder.encode(salt),
    },
    passwordKey,
    256
  );
  return base64Url(new Uint8Array(bits));
};

export const hashPassword = async (password: string) => {
  const salt = randomToken(16);
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
};

export const verifyPassword = async (password: string, storedHash: string) => {
  const [algorithm, iterationsRaw, salt, expectedHash] = storedHash.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const actualHash = await derivePasswordHash(password, salt, iterations);
  return constantTimeEqual(actualHash, expectedHash);
};

const mapUser = async (env: AppEnv, row: UserRow): Promise<SessionUser> => {
  const providerResult = await env.DB.prepare(
    'SELECT provider FROM user_identities WHERE user_id = ? ORDER BY provider ASC'
  )
    .bind(row.id)
    .all<IdentityRow>();

  const providers = Array.from(
    new Set(
      (providerResult.results || [])
        .map((entry) => String(entry.provider || '').trim())
        .filter(Boolean)
    )
  );

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    providers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const findUserByEmail = async (env: AppEnv, email: string) =>
  env.DB.prepare(
    `
      SELECT id, email, display_name, avatar_url, password_hash, created_at, updated_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `
  )
    .bind(normalizeEmail(email))
    .first<UserRow>();

const findLocalUserByEmail = async (env: AppEnv, email: string) =>
  env.DB.prepare(
    `
      SELECT id, email, display_name, avatar_url, password_hash, created_at, updated_at
      FROM users
      WHERE email = ? AND password_hash IS NOT NULL
      LIMIT 1
    `
  )
    .bind(normalizeEmail(email))
    .first<UserRow>();

const findIdentity = async (env: AppEnv, provider: string, providerUserId: string) =>
  env.DB.prepare(
    `
      SELECT u.id, u.email, u.display_name, u.avatar_url, u.password_hash, u.created_at, u.updated_at
      FROM user_identities i
      INNER JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.provider_user_id = ?
      LIMIT 1
    `
  )
    .bind(provider, providerUserId)
    .first<UserRow>();

export const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

export const validatePassword = (password: string) => password.trim().length >= 8;

export const createLocalUser = async (
  env: AppEnv,
  input: { email: string; password: string; displayName: string }
) => {
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName, email);
  const existing = await findUserByEmail(env, email);
  if (existing) {
    throw new Error('Email này đã được sử dụng.');
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  const timestamp = nowIso();

  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO users (id, email, display_name, avatar_url, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?)
      `
    ).bind(userId, email, displayName, passwordHash, timestamp, timestamp),
    env.DB.prepare(
      `
        INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at)
        VALUES (?, ?, 'local', ?, ?, ?, ?)
      `
    ).bind(crypto.randomUUID(), userId, email, email, timestamp, timestamp),
  ]);

  const createdUser = await findUserByEmail(env, email);
  if (!createdUser) {
    throw new Error('Không thể tạo tài khoản mới.');
  }
  return mapUser(env, createdUser);
};

export const authenticateLocalUser = async (
  env: AppEnv,
  input: { email: string; password: string }
) => {
  const email = normalizeEmail(input.email);
  const user = await findLocalUserByEmail(env, email);
  if (!user?.password_hash) {
    throw new Error('Email hoặc mật khẩu không đúng.');
  }

  const passwordMatches = await verifyPassword(input.password, user.password_hash);
  if (!passwordMatches) {
    throw new Error('Email hoặc mật khẩu không đúng.');
  }

  return mapUser(env, user);
};

export const upsertOAuthUser = async (env: AppEnv, profile: OAuthUserProfile) => {
  const provider = profile.provider;
  const providerUserId = String(profile.providerUserId);
  const email = normalizeEmail(profile.email);
  const displayName = normalizeDisplayName(profile.displayName, email);
  const avatarUrl = profile.avatarUrl || null;
  const timestamp = nowIso();

  const existingIdentityUser = await findIdentity(env, provider, providerUserId);
  if (existingIdentityUser) {
    await env.DB.batch([
      env.DB.prepare(
        `
          UPDATE users
          SET email = ?, display_name = ?, avatar_url = ?, updated_at = ?
          WHERE id = ?
        `
      ).bind(email, displayName, avatarUrl, timestamp, existingIdentityUser.id),
      env.DB.prepare(
        `
          UPDATE user_identities
          SET provider_email = ?, updated_at = ?
          WHERE provider = ? AND provider_user_id = ?
        `
      ).bind(email, timestamp, provider, providerUserId),
    ]);

    const updated = await findIdentity(env, provider, providerUserId);
    if (!updated) {
      throw new Error('Không thể cập nhật tài khoản đăng nhập.');
    }
    return mapUser(env, updated);
  }

  const existingUser = await findUserByEmail(env, email);
  const userId = existingUser?.id || crypto.randomUUID();

  if (existingUser) {
    await env.DB.prepare(
      `
        UPDATE users
        SET display_name = ?, avatar_url = ?, updated_at = ?
        WHERE id = ?
      `
    )
      .bind(displayName, avatarUrl, timestamp, existingUser.id)
      .run();
  } else {
    await env.DB.prepare(
      `
        INSERT INTO users (id, email, display_name, avatar_url, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `
    )
      .bind(userId, email, displayName, avatarUrl, timestamp, timestamp)
      .run();
  }

  await env.DB.prepare(
    `
      INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(crypto.randomUUID(), userId, provider, providerUserId, email, timestamp, timestamp)
    .run();

  const linked = await findIdentity(env, provider, providerUserId);
  if (!linked) {
    throw new Error('Không thể liên kết tài khoản OAuth.');
  }
  return mapUser(env, linked);
};

export const createSession = async (env: AppEnv, userId: string) => {
  const sessionToken = randomToken(48);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    `
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `
  )
    .bind(sessionToken, userId, expiresAt, createdAt)
    .run();

  return sessionToken;
};

export const destroySession = async (env: AppEnv, token: string | null) => {
  if (!token) {
    return;
  }

  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
};

export const getSession = async (env: AppEnv, request: Request): Promise<SessionContext | null> => {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso()).run();

  const row = await env.DB.prepare(
    `
      SELECT
        s.id AS session_id,
        s.expires_at,
        u.id AS user_id,
        u.email,
        u.display_name,
        u.avatar_url,
        u.created_at,
        u.updated_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1
    `
  )
    .bind(token)
    .first<SessionRow>();

  if (!row) {
    return null;
  }

  const user = await mapUser(env, {
    id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    password_hash: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  return { token, user };
};

export const makeSessionCookie = (token: string, request: Request) =>
  serializeCookie(SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: shouldUseSecureCookies(request),
  });

export const clearSessionCookie = (request: Request) =>
  serializeCookie(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    secure: shouldUseSecureCookies(request),
  });

type OAuthStatePayload = {
  provider: 'google' | 'discord';
  state: string;
};

export const createOAuthState = (provider: 'google' | 'discord', request: Request) => {
  const payload: OAuthStatePayload = {
    provider,
    state: randomToken(24),
  };
  return {
    payload,
    cookie: serializeCookie(OAUTH_STATE_COOKIE_NAME, JSON.stringify(payload), {
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
      secure: shouldUseSecureCookies(request),
    }),
  };
};

export const validateOAuthState = (
  request: Request,
  expectedProvider: 'google' | 'discord',
  actualState: string
) => {
  const raw = getCookie(request, OAUTH_STATE_COOKIE_NAME);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as OAuthStatePayload;
    return parsed.provider === expectedProvider && parsed.state === actualState;
  } catch {
    return false;
  }
};

export const clearOAuthStateCookie = (request: Request) =>
  serializeCookie(OAUTH_STATE_COOKIE_NAME, '', {
    maxAge: 0,
    secure: shouldUseSecureCookies(request),
  });
