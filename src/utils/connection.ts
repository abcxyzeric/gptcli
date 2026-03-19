import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

export const normalizeApiBase = (input: string): string => {
  let base = (input || '').trim();
  if (!base) return '';
  base = base.replace(/\/?v0\/management\/?$/i, '');
  base = base.replace(/\/+$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return base;
};

export const computeApiUrl = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

export const parseApiBaseUrl = (input: string): URL | null => {
  const normalized = normalizeApiBase(input);
  if (!normalized) return null;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
};

export const detectApiBaseFromLocation = (): string => {
  try {
    const { protocol, hostname, port } = window.location;
    const normalizedPort = port ? `:${port}` : '';
    return normalizeApiBase(`${protocol}//${hostname}${normalizedPort}`);
  } catch (error) {
    console.warn('Failed to detect api base from location, fallback to default', error);
    return normalizeApiBase(`http://localhost:${DEFAULT_API_PORT}`);
  }
};

export const isLocalhost = (hostname: string): boolean => {
  const value = (hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '[::1]';
};

export const isSecureManagementApiBase = (input: string): boolean => {
  const parsed = parseApiBaseUrl(input);
  if (!parsed) return false;

  if (parsed.protocol === 'https:') {
    return true;
  }

  return parsed.protocol === 'http:' && isLocalhost(parsed.hostname);
};

export const isCrossOriginApiBase = (input: string): boolean => {
  const parsed = parseApiBaseUrl(input);
  if (!parsed || typeof window === 'undefined') {
    return false;
  }

  return parsed.origin !== window.location.origin;
};

export const getApiBaseOriginLabel = (input: string): string => {
  const parsed = parseApiBaseUrl(input);
  return parsed?.origin || normalizeApiBase(input);
};

export const isSafeExternalUrl = (input: string): boolean => {
  if (!input) return false;

  try {
    const parsed = new URL(input);
    if (parsed.protocol === 'https:') {
      return true;
    }

    return parsed.protocol === 'http:' && isLocalhost(parsed.hostname);
  } catch {
    return false;
  }
};
