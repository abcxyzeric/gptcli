import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconEye, IconEyeOff } from '@/components/ui/icons';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { useAuthStore, useLanguageStore, useNotificationStore } from '@/stores';
import { webAuthApi } from '@/services/webAuth';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import { isSupportedLanguage } from '@/utils/language';
import styles from './LoginPage.module.scss';

type RedirectState = { from?: { pathname?: string } };
type AuthMode = 'login' | 'register';

const getAuthErrorMessage = (rawError: string, t: (key: string, options?: Record<string, unknown>) => string) => {
  const normalized = rawError.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  if (normalized.includes('not_configured')) {
    return t('auth_portal.oauth_error_not_configured');
  }
  if (normalized.includes('state_invalid')) {
    return t('auth_portal.oauth_error_state');
  }
  if (normalized.includes('token_exchange_failed') || normalized.includes('token_missing')) {
    return t('auth_portal.oauth_error_token');
  }
  if (normalized.includes('profile_failed') || normalized.includes('profile_invalid')) {
    return t('auth_portal.oauth_error_profile');
  }
  if (normalized.includes('access_denied')) {
    return t('auth_portal.oauth_error_cancelled');
  }
  return t('auth_portal.oauth_error_unknown');
};

const SocialIcon = ({ provider }: { provider: 'google' | 'discord' }) => {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6.1-2.7-6.1-6.1S8.7 5.8 12 5.8c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2A9.8 9.8 0 0 0 2.2 12 9.8 9.8 0 0 0 12 21.8c5.6 0 9.4-3.9 9.4-9.5 0-.6-.1-1.2-.2-1.8H12Z"
        />
        <path
          fill="#34A853"
          d="M2.2 16.1 5.3 13.7A6.02 6.02 0 0 0 12 18c3.9 0 5.3-2.6 5.5-3.9H12V18c-3.2 0-5.8-1.9-7-4.7Z"
        />
        <path
          fill="#4A90E2"
          d="M5.3 13.7A6.2 6.2 0 0 1 5 12c0-.6.1-1.2.3-1.7L2.2 7.9A9.72 9.72 0 0 0 1 12c0 1.6.4 3.1 1.2 4.1l3.1-2.4Z"
        />
        <path
          fill="#FBBC05"
          d="M12 5.8c2.1 0 3.4.9 4.1 1.6l3-3C17.2 2.8 14.9 2.2 12 2.2c-4.1 0-7.7 2.3-9.8 5.7l3.1 2.4C6.2 7.7 8.8 5.8 12 5.8Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#5865F2"
        d="M20.3 4.9A16.4 16.4 0 0 0 16.2 3l-.2.4c-.1.2-.2.5-.3.7a15.3 15.3 0 0 0-4.6 0l-.3-.7-.2-.4A16.4 16.4 0 0 0 6.5 4.9 17.1 17.1 0 0 0 3 16.5a16.6 16.6 0 0 0 5 2.5l1.1-1.8a10.5 10.5 0 0 1-1.7-.8l.4-.3a11.8 11.8 0 0 0 10.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.8a16.6 16.6 0 0 0 5-2.5 17.1 17.1 0 0 0-3.5-11.6ZM9.5 14.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm5 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"
      />
    </svg>
  );
};

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  const [mode, setMode] = useState<AuthMode>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoLoginSuccess, setAutoLoginSuccess] = useState(false);
  const [error, setError] = useState('');

  const authError = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return getAuthErrorMessage(search.get('authError') || '', t);
  }, [location.search, t]);

  const languageOptions = useMemo(
    () =>
      LANGUAGE_ORDER.map((lang) => ({
        value: lang,
        label: t(LANGUAGE_LABEL_KEYS[lang]),
      })),
    [t]
  );

  const handleLanguageChange = useCallback(
    (selectedLanguage: string) => {
      if (!isSupportedLanguage(selectedLanguage)) {
        return;
      }
      setLanguage(selectedLanguage);
    },
    [setLanguage]
  );

  useEffect(() => {
    const init = async () => {
      let didAutoLogin = false;

      try {
        const autoLoggedIn = await restoreSession();
        if (autoLoggedIn) {
          didAutoLogin = true;
          setAutoLoginSuccess(true);
          window.setTimeout(() => {
            const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';
            navigate(redirect, { replace: true });
          }, 900);
        }
      } finally {
        if (!didAutoLogin) {
          setAutoLoading(false);
        }
      }
    };

    void init();
  }, [location.state, navigate, restoreSession]);

  const handleLogin = useCallback(async () => {
    if (!loginEmail.trim() || !loginPassword) {
      setError(t('auth_portal.required'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      showNotification(t('auth_portal.login_success'), 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth_portal.login_failed');
      setError(message);
      showNotification(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [login, loginEmail, loginPassword, navigate, showNotification, t]);

  const handleRegister = useCallback(async () => {
    if (!registerName.trim() || !registerEmail.trim() || !registerPassword || !registerConfirmPassword) {
      setError(t('auth_portal.required'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await register({
        displayName: registerName.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
        confirmPassword: registerConfirmPassword,
      });
      showNotification(t('auth_portal.register_success'), 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth_portal.register_failed');
      setError(message);
      showNotification(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    navigate,
    register,
    registerConfirmPassword,
    registerEmail,
    registerName,
    registerPassword,
    showNotification,
    t,
  ]);

  const handleFormSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (loading) {
        return;
      }

      if (mode === 'login') {
        await handleLogin();
        return;
      }

      await handleRegister();
    },
    [handleLogin, handleRegister, loading, mode]
  );

  const startOAuth = useCallback((provider: 'google' | 'discord') => {
    setError('');
    webAuthApi.startOAuth(provider);
  }, []);

  const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';
  if (isAuthenticated && !autoLoading && !autoLoginSuccess) {
    return <Navigate to={redirect} replace />;
  }

  const showSplash = autoLoading || autoLoginSuccess;

  return (
    <div className={styles.container}>
      <div className={styles.brandPanel}>
        <div className={styles.brandContent}>
          <span className={styles.brandWord}>CLIP</span>
          <span className={styles.brandWord}>PROXY</span>
          <span className={styles.brandWord}>WEB</span>
        </div>
      </div>

      <div className={styles.formPanel}>
        {showSplash ? (
          <div className={styles.splashContent}>
            <img src={INLINE_LOGO_JPEG} alt="ClipProxy" className={styles.splashLogo} />
            <h1 className={styles.splashTitle}>{t('splash.title', { defaultValue: 'ClipProxy' })}</h1>
            <p className={styles.splashSubtitle}>
              {t('splash.subtitle', { defaultValue: 'Web Console' })}
            </p>
            <div className={styles.splashLoader}>
              <div className={styles.splashLoaderBar} />
            </div>
          </div>
        ) : (
          <div className={styles.formContent}>
            <img src={INLINE_LOGO_JPEG} alt="ClipProxy Logo" className={styles.logo} />

            <div className={styles.loginCard}>
              <div className={styles.loginHeader}>
                <div className={styles.titleRow}>
                  <div className={styles.title}>{t('auth_portal.title')}</div>
                  <Select
                    className={styles.languageSelect}
                    value={language}
                    options={languageOptions}
                    onChange={handleLanguageChange}
                    fullWidth={false}
                    ariaLabel={t('language.switch')}
                  />
                </div>
                <div className={styles.subtitle}>{t('auth_portal.subtitle')}</div>
              </div>

              <div className={styles.trustBox}>
                <div className={styles.trustTitle}>{t('auth_portal.server_side_title')}</div>
                <div className={styles.trustText}>{t('auth_portal.server_side_desc')}</div>
              </div>

              <div className={styles.modeTabs} role="tablist" aria-label={t('auth_portal.mode_label')}>
                <button
                  type="button"
                  className={`${styles.modeTab} ${mode === 'login' ? styles.modeTabActive : ''}`}
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                >
                  {t('auth_portal.login_tab')}
                </button>
                <button
                  type="button"
                  className={`${styles.modeTab} ${mode === 'register' ? styles.modeTabActive : ''}`}
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                >
                  {t('auth_portal.register_tab')}
                </button>
              </div>

              {(authError || error) && <div className={styles.errorBox}>{authError || error}</div>}

              <form className={styles.authForm} onSubmit={handleFormSubmit}>
                {mode === 'login' ? (
                  <>
                    <Input
                      autoFocus
                      label={t('auth_portal.email')}
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      autoComplete="email"
                    />
                    <Input
                      label={t('auth_portal.password')}
                      placeholder={t('auth_portal.password_placeholder')}
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      autoComplete="current-password"
                      rightElement={
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                          aria-label={
                            showLoginPassword ? t('auth_portal.hide_password') : t('auth_portal.show_password')
                          }
                        >
                          {showLoginPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      }
                    />
                  </>
                ) : (
                  <>
                    <Input
                      autoFocus
                      label={t('auth_portal.display_name')}
                      placeholder={t('auth_portal.display_name_placeholder')}
                      value={registerName}
                      onChange={(event) => setRegisterName(event.target.value)}
                      autoComplete="name"
                    />
                    <Input
                      label={t('auth_portal.email')}
                      placeholder="you@example.com"
                      value={registerEmail}
                      onChange={(event) => setRegisterEmail(event.target.value)}
                      autoComplete="email"
                    />
                    <Input
                      label={t('auth_portal.password')}
                      placeholder={t('auth_portal.password_placeholder')}
                      type={showRegisterPassword ? 'text' : 'password'}
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      autoComplete="new-password"
                      hint={t('auth_portal.password_hint')}
                      rightElement={
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowRegisterPassword((prev) => !prev)}
                          aria-label={
                            showRegisterPassword
                              ? t('auth_portal.hide_password')
                              : t('auth_portal.show_password')
                          }
                        >
                          {showRegisterPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      }
                    />
                    <Input
                      label={t('auth_portal.confirm_password')}
                      placeholder={t('auth_portal.confirm_password_placeholder')}
                      type={showRegisterConfirm ? 'text' : 'password'}
                      value={registerConfirmPassword}
                      onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      rightElement={
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowRegisterConfirm((prev) => !prev)}
                          aria-label={
                            showRegisterConfirm
                              ? t('auth_portal.hide_password')
                              : t('auth_portal.show_password')
                          }
                        >
                          {showRegisterConfirm ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      }
                    />
                  </>
                )}

                <Button type="submit" fullWidth loading={loading}>
                  {mode === 'login' ? t('auth_portal.login_button') : t('auth_portal.register_button')}
                </Button>
              </form>

              <div className={styles.divider}>
                <span>{t('auth_portal.social_divider')}</span>
              </div>

              <div className={styles.socialGrid}>
                <Button
                  type="button"
                  variant="secondary"
                  className={styles.socialButton}
                  onClick={() => startOAuth('google')}
                >
                  <span className={styles.socialButtonInner}>
                    <SocialIcon provider="google" />
                    <span>{t('auth_portal.google_button')}</span>
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className={styles.socialButton}
                  onClick={() => startOAuth('discord')}
                >
                  <span className={styles.socialButtonInner}>
                    <SocialIcon provider="discord" />
                    <span>{t('auth_portal.discord_button')}</span>
                  </span>
                </Button>
              </div>

              <div className={styles.footerNote}>{t('auth_portal.footer_note')}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
