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

const getAccountState = (file: AuthFileItem) => {
  if (file.disabled) {
    return 'Paused';
  }

  if (file.statusMessage) {
    return 'Needs attention';
  }

  if (file.runtimeOnly) {
    return 'Runtime only';
  }

  return 'Ready';
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
      label: 'Client access keys',
      value: stats.apiKeys ?? '-',
      icon: <IconKey size={24} />,
      path: '/access-keys',
      loading: loading && stats.apiKeys === null,
      sublabel: 'Keys for users and third-party CLI tools',
    },
    {
      label: 'Stored accounts',
      value: stats.authFiles ?? '-',
      icon: <IconFileText size={24} />,
      path: '/auth-files',
      loading: loading && stats.authFiles === null,
      sublabel: `${quotaTrackedAccounts} accounts ready for quota tracking`,
    },
    {
      label: 'Provider routes',
      value: loading ? '-' : providerStatsReady ? totalProviderKeys : '-',
      icon: <IconBot size={24} />,
      path: '/ai-providers',
      loading,
      sublabel: providerStatsReady
        ? `Gemini ${providerStats.gemini} • Codex ${providerStats.codex} • Claude ${providerStats.claude} • OpenAI ${providerStats.openai}`
        : 'Custom upstream and model routing',
    },
    {
      label: 'Available models',
      value: modelsLoading ? '-' : models.length,
      icon: <IconSatellite size={24} />,
      path: '/system',
      loading: modelsLoading,
      sublabel: 'Detected through the proxy endpoint',
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
          <div className={styles.heroEyebrow}>Web Proxy Control Center</div>
          <h1 className={styles.title}>Run your existing CLI proxy through a clean web panel</h1>
          <p className={styles.subtitle}>
            Keep the original CLIProxyAPI logic untouched, then manage access keys, OAuth accounts,
            quota and usage from one browser dashboard.
          </p>

          <div className={styles.heroActions}>
            <Link to="/quota" className={styles.primaryAction}>
              Open quota center
            </Link>
            <Link to="/access-keys" className={styles.secondaryAction}>
              Manage user keys
            </Link>
            <Link to="/auth-files" className={styles.secondaryAction}>
              View accounts
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
                  ? 'Connected'
                  : connectionStatus === 'connecting'
                    ? 'Connecting'
                    : 'Disconnected'}
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
                  Built {new Date(serverBuildDate).toLocaleDateString(i18n.language)}
                </span>
              )}
            </div>
          </div>

          <div className={styles.heroAsideGrid}>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>Routing</span>
              <strong>{routingStrategyDisplay}</strong>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>Usage stats</span>
              <strong>{config?.usageStatisticsEnabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>WebSocket auth</span>
              <strong>{config?.wsAuth ? 'On' : 'Off'}</strong>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricLabel}>Retries</span>
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
              <h2 className={styles.sectionTitle}>Your accounts</h2>
              <p className={styles.sectionCopy}>
                Upload credentials, see provider mix and jump into account-level troubleshooting.
              </p>
            </div>
            <Link to="/auth-files" className={styles.inlineLink}>
              Open accounts
            </Link>
          </div>

          <div className={styles.providerPills}>
            {accountBreakdown.length === 0 ? (
              <span className={styles.emptyText}>No accounts loaded yet.</span>
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
                Add or upload auth files, then this panel will list your latest accounts here.
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
                  <span className={styles.accountStatus}>{getAccountState(file)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Daily workflow</h2>
              <p className={styles.sectionCopy}>
                These are the pages you will probably touch most when turning the CLI into a web
                proxy service.
              </p>
            </div>
          </div>

          <div className={styles.workflowGrid}>
            <Link to="/access-keys" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconShield size={20} />
              </div>
              <div className={styles.workflowTitle}>Issue keys to users</div>
              <p className={styles.workflowText}>
                Create, rotate and distribute proxy keys without opening the raw YAML config.
              </p>
            </Link>

            <Link to="/quota" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconChartLine size={20} />
              </div>
              <div className={styles.workflowTitle}>Check remaining quota</div>
              <p className={styles.workflowText}>
                See remaining turns and reset windows for Claude, Codex, Gemini CLI, Kimi and more.
              </p>
            </Link>

            <Link to="/usage" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconSatellite size={20} />
              </div>
              <div className={styles.workflowTitle}>Track request usage</div>
              <p className={styles.workflowText}>
                Review tokens, requests, cost estimates and model breakdown across your traffic.
              </p>
            </Link>

            <Link to="/config" className={styles.workflowCard}>
              <div className={styles.workflowIcon}>
                <IconSettings size={20} />
              </div>
              <div className={styles.workflowTitle}>Tune proxy behavior</div>
              <p className={styles.workflowText}>
                Adjust retries, routing strategy, logging and deployment-facing settings from one place.
              </p>
            </Link>
          </div>
        </section>
      </div>

      {config && (
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Routing snapshot</h2>
              <p className={styles.sectionCopy}>
                Quick sanity check for the settings that affect user-facing reliability the most.
              </p>
            </div>
            <Link to="/config" className={styles.inlineLink}>
              Edit config
            </Link>
          </div>

          <div className={styles.configGrid}>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Debug mode</span>
              <span className={styles.configValue}>{config.debug ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Usage statistics</span>
              <span className={styles.configValue}>
                {config.usageStatisticsEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Logging to file</span>
              <span className={styles.configValue}>{config.loggingToFile ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Request retry</span>
              <span className={styles.configValue}>{config.requestRetry ?? 0}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Routing strategy</span>
              <span className={styles.configValue}>{routingStrategyDisplay}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Force model prefix</span>
              <span className={styles.configValue}>
                {config.forceModelPrefix ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
