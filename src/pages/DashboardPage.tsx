import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconBot,
  IconChartLine,
  IconFileText,
  IconKey,
  IconSatellite,
  IconSettings,
  IconShield,
} from '@/components/ui/icons';
import { useAuthStore, useConfigStore, useModelsStore } from '@/stores';
import { apiKeysApi, authFilesApi, providersApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import styles from './DashboardPage.module.scss';

interface QuickStat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  path: string;
  loading?: boolean;
  sublabel?: string;
}

interface ProviderStats {
  gemini: number | null;
  codex: number | null;
  claude: number | null;
  openai: number | null;
}

const QUOTA_PROVIDER_TYPES = new Set(['claude', 'codex', 'gemini-cli', 'antigravity', 'kimi']);

const normalizeProviderLabel = (value: string | undefined) => {
  const normalized = String(value ?? 'unknown').trim().toLowerCase();

  switch (normalized) {
    case 'gemini-cli':
      return 'Gemini CLI';
    case 'aistudio':
      return 'AI Studio';
    case 'codex':
      return 'Codex';
    case 'claude':
      return 'Claude';
    case 'qwen':
      return 'Qwen';
    case 'iflow':
      return 'iFlow';
    case 'antigravity':
      return 'Antigravity';
    case 'kimi':
      return 'Kimi';
    case 'vertex':
      return 'Vertex';
    case 'gemini':
      return 'Gemini';
    default:
      return normalized ? normalized.replace(/-/g, ' ') : 'Unknown';
  }
};

const getAccountState = (
  file: AuthFileItem,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  if (file.disabled) {
    return t('portal.dashboard.account_state_paused', { defaultValue: 'Paused' });
  }

  if (file.statusMessage) {
    return t('portal.dashboard.account_state_attention', {
      defaultValue: 'Needs attention',
    });
  }

  if (file.runtimeOnly) {
    return t('portal.dashboard.account_state_runtime_only', {
      defaultValue: 'Runtime only',
    });
  }

  return t('portal.dashboard.account_state_ready', { defaultValue: 'Ready' });
};

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [stats, setStats] = useState<{
    apiKeys: number | null;
    authFiles: number | null;
  }>({
    apiKeys: null,
    authFiles: null,
  });
  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStats>({
    gemini: null,
    codex: null,
    claude: null,
    openai: null,
  });
  const [loading, setLoading] = useState(true);

  const apiKeysCache = useRef<string[]>([]);

  useEffect(() => {
    apiKeysCache.current = [];
  }, [apiBase, config?.apiKeys]);

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];

    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch {
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = useCallback(async () => {
    if (connectionStatus !== 'connected' || !apiBase) {
      return;
    }

    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      await fetchModelsFromStore(apiBase, primaryKey);
    } catch {
      // Keep the dashboard resilient when models fail to load.
    }
  }, [apiBase, connectionStatus, fetchModelsFromStore, resolveApiKeysForModels]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [keysRes, filesRes, geminiRes, codexRes, claudeRes, openaiRes] =
          await Promise.allSettled([
            apiKeysApi.list(),
            authFilesApi.list(),
            providersApi.getGeminiKeys(),
            providersApi.getCodexConfigs(),
            providersApi.getClaudeConfigs(),
            providersApi.getOpenAIProviders(),
          ]);

        const nextFiles = filesRes.status === 'fulfilled' ? filesRes.value.files ?? [] : [];

        setStats({
          apiKeys: keysRes.status === 'fulfilled' ? keysRes.value.length : null,
          authFiles: nextFiles.length,
        });
        setAuthFiles(nextFiles);

        setProviderStats({
          gemini: geminiRes.status === 'fulfilled' ? geminiRes.value.length : null,
          codex: codexRes.status === 'fulfilled' ? codexRes.value.length : null,
          claude: claudeRes.status === 'fulfilled' ? claudeRes.value.length : null,
          openai: openaiRes.status === 'fulfilled' ? openaiRes.value.length : null,
        });
      } finally {
        setLoading(false);
      }
    };

    if (connectionStatus === 'connected') {
      void fetchStats();
      void fetchModels();
    } else {
      setLoading(false);
      setAuthFiles([]);
    }
  }, [connectionStatus, fetchModels]);

  const providerStatsReady =
    providerStats.gemini !== null &&
    providerStats.codex !== null &&
    providerStats.claude !== null &&
    providerStats.openai !== null;

  const totalProviderKeys = providerStatsReady
    ? (providerStats.gemini ?? 0) +
      (providerStats.codex ?? 0) +
      (providerStats.claude ?? 0) +
      (providerStats.openai ?? 0)
    : 0;

  const accountBreakdown = useMemo(() => {
    const counts = new Map<string, number>();

    authFiles.forEach((file) => {
      const label = normalizeProviderLabel(file.provider ?? file.type);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [authFiles]);

  const featuredAccounts = useMemo(() => {
    return [...authFiles]
      .sort((left, right) => {
        const leftModified = Number(left.modified ?? left.lastRefresh ?? 0);
        const rightModified = Number(right.modified ?? right.lastRefresh ?? 0);
        return rightModified - leftModified;
      })
      .slice(0, 6);
  }, [authFiles]);

  const quotaTrackedAccounts = useMemo(() => {
    return authFiles.filter((file) => {
      const provider = String(file.provider ?? file.type ?? '').trim().toLowerCase();
      return QUOTA_PROVIDER_TYPES.has(provider) && !file.disabled;
    }).length;
  }, [authFiles]);

  const quickStats: QuickStat[] = [
    {
      label: t('portal.dashboard.client_access_keys', {
        defaultValue: 'Client access keys',
      }),
      value: stats.apiKeys ?? '-',
      icon: <IconKey size={24} />,
      path: '/access-keys',
      loading: loading && stats.apiKeys === null,
      sublabel: t('portal.dashboard.client_access_keys_desc', {
        defaultValue: 'Keys for users and third-party CLI tools',
      }),
    },
    {
      label: t('portal.dashboard.stored_accounts', { defaultValue: 'Stored accounts' }),
      value: stats.authFiles ?? '-',
      icon: <IconFileText size={24} />,
      path: '/auth-files',
      loading: loading && stats.authFiles === null,
      sublabel: t('portal.dashboard.stored_accounts_desc', {
        defaultValue: '{{count}} accounts ready for quota tracking',
        count: quotaTrackedAccounts,
      }),
    },
    {
      label: t('portal.dashboard.provider_routes', { defaultValue: 'Provider routes' }),
      value: loading ? '-' : providerStatsReady ? totalProviderKeys : '-',
      icon: <IconBot size={24} />,
      path: '/ai-providers',
      loading,
      sublabel: providerStatsReady
        ? t('portal.dashboard.provider_routes_breakdown', {
            defaultValue:
              'Gemini {{gemini}} • Codex {{codex}} • Claude {{claude}} • OpenAI {{openai}}',
            gemini: providerStats.gemini,
            codex: providerStats.codex,
            claude: providerStats.claude,
            openai: providerStats.openai,
          })
        : t('portal.dashboard.provider_routes_desc', {
            defaultValue: 'Custom upstream and model routing',
          }),
    },
    {
      label: t('dashboard.available_models', { defaultValue: 'Available models' }),
      value: modelsLoading ? '-' : models.length,
      icon: <IconSatellite size={24} />,
      path: '/system',
      loading: modelsLoading,
      sublabel: t('portal.dashboard.available_models_desc', {
        defaultValue: 'Detected through the proxy endpoint',
      }),
    },
  ];

  const routingStrategyRaw = config?.routingStrategy?.trim() || '';
  const routingStrategyDisplay = !routingStrategyRaw
    ? '-'
    : routingStrategyRaw === 'round-robin'
      ? t('basic_settings.routing_strategy_round_robin')
      : routingStrategyRaw === 'fill-first'
        ? t('basic_settings.routing_strategy_fill_first')
        : routingStrategyRaw;

  return (
    <div className={styles.dashboard}>
      <section className={styles.heroCard}>
        <div className={styles.heroMain}>
          <div className={styles.heroEyebrow}>
            {t('portal.dashboard.eyebrow', { defaultValue: 'Web Proxy Control Center' })}
          </div>
          <h1 className={styles.title}>
            {t('portal.dashboard.hero_title', {
              defaultValue: 'Run your existing CLI proxy through a clean web panel',
            })}
          </h1>
          <p className={styles.subtitle}>
            {t('portal.dashboard.hero_subtitle', {
              defaultValue:
                'Keep the original CLIProxyAPI logic untouched, then manage access keys, OAuth accounts, quota and usage from one browser dashboard.',
            })}
          </p>

          <div className={styles.heroActions}>
            <Link to="/quota" className={styles.primaryAction}>
              {t('portal.dashboard.open_quota_center', {
                defaultValue: 'Open quota center',
              })}
            </Link>
            <Link to="/access-keys" className={styles.secondaryAction}>
              {t('portal.dashboard.manage_user_keys', {
                defaultValue: 'Manage user keys',
              })}
            </Link>
            <Link to="/auth-files" className={styles.secondaryAction}>
              {t('portal.dashboard.view_accounts', { defaultValue: 'View accounts' })}
            </Link>
          </div>
        </div>

        <div className={styles.heroSide}>
          <div className={styles.connectionCard}>
            <div className={styles.connectionStatus}>
              <span
                className={`${styles.statusDot} ${
                  connectionStatus === 'connected'
                    ? styles.connected
                    : connectionStatus === 'connecting'
                      ? styles.connecting
                      : styles.disconnected
                }`}
              />
              <span className={styles.statusText}>
                {connectionStatus === 'connected'
                  ? t('portal.dashboard.connected', { defaultValue: 'Connected' })
                  : connectionStatus === 'connecting'
                    ? t('portal.dashboard.connecting', { defaultValue: 'Connecting' })
                    : t('portal.dashboard.disconnected', { defaultValue: 'Disconnected' })}
              </span>
            </div>

            <div className={styles.connectionInfo}>
              <span className={styles.serverUrl}>{apiBase || '-'}</span>
              {serverVersion && (
                <span className={styles.serverVersion}>
                  v{serverVersion.trim().replace(/^[vV]+/, '')}
                </span>
              )}
              {serverBuildDate && (
                <span className={styles.buildDate}>
                  {t('portal.dashboard.built_on', {
                    defaultValue: 'Built on {{date}}',
                    date: new Date(serverBuildDate).toLocaleDateString(i18n.language),
                  })}
                </span>
              )}
            </div>
          </div>

          <div className={styles.heroAsideGrid}>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>
                {t('portal.dashboard.routing', { defaultValue: 'Routing' })}
              </span>
              <strong>{routingStrategyDisplay}</strong>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>
                {t('portal.dashboard.usage_stats', { defaultValue: 'Usage stats' })}
              </span>
              <strong>
                {config?.usageStatisticsEnabled
                  ? t('portal.dashboard.enabled', { defaultValue: 'Enabled' })
                  : t('portal.dashboard.disabled', { defaultValue: 'Disabled' })}
              </strong>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>
                {t('portal.dashboard.websocket_auth', {
                  defaultValue: 'WebSocket auth',
                })}
              </span>
              <strong>
                {config?.wsAuth
                  ? t('portal.dashboard.enabled', { defaultValue: 'Enabled' })
                  : t('portal.dashboard.disabled', { defaultValue: 'Disabled' })}
              </strong>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>
                {t('portal.dashboard.retries', { defaultValue: 'Retries' })}
              </span>
              <strong>{config?.requestRetry ?? 0}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.statsGrid}>
        {quickStats.map((stat) => (
          <Link key={stat.path} to={stat.path} className={styles.statCard}>
            <div className={styles.statIcon}>{stat.icon}</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{stat.loading ? '...' : stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
              {stat.sublabel && !stat.loading && (
                <span className={styles.statSublabel}>{stat.sublabel}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className={styles.sectionGrid}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                {t('portal.dashboard.accounts_title', { defaultValue: 'Your accounts' })}
              </h2>
              <p className={styles.sectionCopy}>
                {t('portal.dashboard.accounts_subtitle', {
                  defaultValue:
                    'Upload credentials, see provider mix and jump into account-level troubleshooting.',
                })}
              </p>
            </div>
            <Link to="/auth-files" className={styles.inlineLink}>
              {t('portal.dashboard.open_accounts', { defaultValue: 'Open accounts' })}
            </Link>
          </div>

          <div className={styles.providerPills}>
            {accountBreakdown.length === 0 ? (
              <span className={styles.emptyText}>
                {t('portal.dashboard.no_accounts_loaded', {
                  defaultValue: 'No accounts loaded yet.',
                })}
              </span>
            ) : (
              accountBreakdown.map((item) => (
                <span key={item.label} className={styles.providerPill}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </span>
              ))
            )}
          </div>

          <div className={styles.accountList}>
            {featuredAccounts.length === 0 ? (
              <div className={styles.emptyState}>
                {t('portal.dashboard.recent_accounts_empty', {
                  defaultValue:
                    'Add or upload auth files, then this panel will list your latest accounts here.',
                })}
              </div>
            ) : (
              featuredAccounts.map((file) => (
                <Link key={file.name} to="/auth-files" className={styles.accountRow}>
                  <div>
                    <div className={styles.accountName}>{file.name}</div>
                    <div className={styles.accountMeta}>
                      {normalizeProviderLabel(file.provider ?? file.type)}
                    </div>
                  </div>
                  <span className={styles.accountStatus}>{getAccountState(file, t)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                {t('portal.dashboard.workflow_title', { defaultValue: 'Daily workflow' })}
              </h2>
              <p className={styles.sectionCopy}>
                {t('portal.dashboard.workflow_subtitle', {
                  defaultValue:
                    'These are the pages you will probably touch most when turning the CLI into a web proxy service.',
                })}
              </p>
            </div>
          </div>

          <div className={styles.workflowGrid}>
            <Link to="/access-keys" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconShield size={20} />
              </div>
              <div className={styles.workflowTitle}>
                {t('portal.dashboard.issue_keys_title', {
                  defaultValue: 'Issue keys to users',
                })}
              </div>
              <p className={styles.workflowText}>
                {t('portal.dashboard.issue_keys_desc', {
                  defaultValue:
                    'Create, rotate and distribute proxy keys without opening the raw YAML config.',
                })}
              </p>
            </Link>

            <Link to="/quota" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconChartLine size={20} />
              </div>
              <div className={styles.workflowTitle}>
                {t('portal.dashboard.quota_title', {
                  defaultValue: 'Check remaining quota',
                })}
              </div>
              <p className={styles.workflowText}>
                {t('portal.dashboard.quota_desc', {
                  defaultValue:
                    'See remaining turns and reset windows for Claude, Codex, Gemini CLI, Kimi and more.',
                })}
              </p>
            </Link>

            <Link to="/usage" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconSatellite size={20} />
              </div>
              <div className={styles.workflowTitle}>
                {t('portal.dashboard.usage_title', {
                  defaultValue: 'Track request usage',
                })}
              </div>
              <p className={styles.workflowText}>
                {t('portal.dashboard.usage_desc', {
                  defaultValue:
                    'Review tokens, requests, cost estimates and model breakdown across your traffic.',
                })}
              </p>
            </Link>

            <Link to="/config" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconSettings size={20} />
              </div>
              <div className={styles.workflowTitle}>
                {t('portal.dashboard.config_title', {
                  defaultValue: 'Tune proxy behavior',
                })}
              </div>
              <p className={styles.workflowText}>
                {t('portal.dashboard.config_desc', {
                  defaultValue:
                    'Adjust retries, routing strategy, logging and deployment-facing settings from one place.',
                })}
              </p>
            </Link>
          </div>
        </section>
      </div>

      {config && (
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                {t('portal.dashboard.routing_snapshot_title', {
                  defaultValue: 'Routing snapshot',
                })}
              </h2>
              <p className={styles.sectionCopy}>
                {t('portal.dashboard.routing_snapshot_subtitle', {
                  defaultValue:
                    'Quick sanity check for the settings that affect user-facing reliability the most.',
                })}
              </p>
            </div>
            <Link to="/config" className={styles.inlineLink}>
              {t('portal.dashboard.edit_config', { defaultValue: 'Edit config' })}
            </Link>
          </div>

          <div className={styles.configGrid}>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>
                {t('portal.dashboard.debug_mode', { defaultValue: 'Debug mode' })}
              </span>
              <span className={styles.configValue}>
                {config.debug
                  ? t('portal.dashboard.enabled', { defaultValue: 'Enabled' })
                  : t('portal.dashboard.disabled', { defaultValue: 'Disabled' })}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>
                {t('portal.dashboard.usage_statistics_label', {
                  defaultValue: 'Usage statistics',
                })}
              </span>
              <span className={styles.configValue}>
                {config.usageStatisticsEnabled
                  ? t('portal.dashboard.enabled', { defaultValue: 'Enabled' })
                  : t('portal.dashboard.disabled', { defaultValue: 'Disabled' })}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>
                {t('portal.dashboard.logging_to_file', { defaultValue: 'Logging to file' })}
              </span>
              <span className={styles.configValue}>
                {config.loggingToFile
                  ? t('portal.dashboard.enabled', { defaultValue: 'Enabled' })
                  : t('portal.dashboard.disabled', { defaultValue: 'Disabled' })}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>
                {t('portal.dashboard.request_retry', { defaultValue: 'Request retry' })}
              </span>
              <span className={styles.configValue}>{config.requestRetry ?? 0}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>
                {t('portal.dashboard.routing_strategy_label', {
                  defaultValue: 'Routing strategy',
                })}
              </span>
              <span className={styles.configValue}>{routingStrategyDisplay}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>
                {t('portal.dashboard.force_model_prefix', {
                  defaultValue: 'Force model prefix',
                })}
              </span>
              <span className={styles.configValue}>
                {config.forceModelPrefix
                  ? t('portal.dashboard.enabled', { defaultValue: 'Enabled' })
                  : t('portal.dashboard.disabled', { defaultValue: 'Disabled' })}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
