import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiKeysApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './AccessKeysPage.module.scss';

const ACCESS_KEY_PREFIX = 'cpw_';
const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const ACCESS_KEY_LENGTH = 28;

const createRandomKey = () => {
  const values = new Uint8Array(ACCESS_KEY_LENGTH);

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 256);
    }
  }

  const body = Array.from(values, (value) => ACCESS_KEY_ALPHABET[value % ACCESS_KEY_ALPHABET.length]).join('');
  return `${ACCESS_KEY_PREFIX}${body}`;
};

const maskKey = (value: string, expanded: boolean) => {
  if (expanded || value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}••••••${value.slice(-6)}`;
};

export function AccessKeysPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();

  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(new Set());

  const disableControls = connectionStatus !== 'connected';
  const isEditing = editingIndex !== null;

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load access keys.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useHeaderRefresh(loadKeys);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const resetModal = useCallback(() => {
    setDraft('');
    setEditingIndex(null);
    setModalOpen(false);
  }, []);

  const openCreateModal = useCallback(() => {
    setDraft(createRandomKey());
    setEditingIndex(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((index: number) => {
    setDraft(keys[index] ?? '');
    setEditingIndex(index);
    setModalOpen(true);
  }, [keys]);

  const keyStats = useMemo(
    () => ({
      total: keys.length,
      longLived: keys.filter((key) => key.startsWith(ACCESS_KEY_PREFIX)).length,
    }),
    [keys]
  );

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();

    if (!trimmed) {
      showNotification('Please enter an access key.', 'error');
      return;
    }

    const duplicateIndex = keys.findIndex(
      (value, index) => value === trimmed && index !== editingIndex
    );
    if (duplicateIndex !== -1) {
      showNotification('This access key already exists.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingIndex === null) {
        await apiKeysApi.replace([...keys, trimmed]);
        showNotification('New access key added.', 'success');
      } else {
        await apiKeysApi.update(editingIndex, trimmed);
        showNotification('Access key updated.', 'success');
      }

      await loadKeys();
      resetModal();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to save the access key.';
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, editingIndex, keys, loadKeys, resetModal, showNotification]);

  const handleDelete = useCallback((index: number) => {
    showConfirmation({
      title: 'Delete access key',
      message: 'This client key will stop working immediately after removal.',
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiKeysApi.delete(index);
          showNotification('Access key deleted.', 'success');
          await loadKeys();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unable to delete the access key.';
          showNotification(message, 'error');
        }
      },
    });
  }, [loadKeys, showConfirmation, showNotification, t]);

  const handleRotate = useCallback((index: number) => {
    const nextValue = createRandomKey();
    showConfirmation({
      title: 'Rotate access key',
      message: 'The old key will stop working as soon as the new one is saved.',
      confirmText: 'Rotate',
      cancelText: t('common.cancel'),
      variant: 'primary',
      onConfirm: async () => {
        try {
          await apiKeysApi.update(index, nextValue);
          showNotification('Access key rotated.', 'success');
          await loadKeys();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unable to rotate the access key.';
          showNotification(message, 'error');
        }
      },
    });
  }, [loadKeys, showConfirmation, showNotification, t]);

  const handleCopy = useCallback(async (value: string) => {
    const copied = await copyToClipboard(value);
    showNotification(
      copied ? 'Access key copied to clipboard.' : 'Copy failed.',
      copied ? 'success' : 'error'
    );
  }, [showNotification]);

  const toggleExpanded = useCallback((index: number) => {
    setExpandedIndexes((previous) => {
      const next = new Set(previous);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Access Keys</h1>
          <p className={styles.description}>
            Manage the client keys that your web users or CLI tools will use to call the proxy.
          </p>
        </div>
        <div className={styles.pageActions}>
          <Button variant="secondary" size="sm" onClick={() => void loadKeys()} disabled={loading}>
            {t('common.refresh')}
          </Button>
          <Button size="sm" onClick={openCreateModal} disabled={disableControls}>
            Add key
          </Button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{keyStats.total}</span>
          <span className={styles.statLabel}>Total client keys</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{keyStats.longLived}</span>
          <span className={styles.statLabel}>Generated by this panel</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{disableControls ? 'Offline' : 'Ready'}</span>
          <span className={styles.statLabel}>Management connection</span>
        </Card>
      </div>

      <Card
        title="Key list"
        extra={
          <span className={styles.cardHint}>
            These keys map to the top-level <code>api-keys</code> list in CLIProxyAPI.
          </span>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>Loading access keys...</div>
        ) : keys.length === 0 ? (
          <div className={styles.emptyState}>
            No client keys yet. Create one here, then distribute it to your CLI users.
          </div>
        ) : (
          <div className={styles.keysGrid}>
            {keys.map((value, index) => {
              const expanded = expandedIndexes.has(index);

              return (
                <div key={`${value}-${index}`} className={styles.keyCard}>
                  <div className={styles.keyHeader}>
                    <div>
                      <div className={styles.keyTitle}>Client key #{index + 1}</div>
                      <div className={styles.keyMeta}>
                        {value.startsWith(ACCESS_KEY_PREFIX) ? 'Generated in panel' : 'Imported or custom'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.showButton}
                      onClick={() => toggleExpanded(index)}
                    >
                      {expanded ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <div className={styles.keyValue}>{maskKey(value, expanded)}</div>

                  <div className={styles.keyActions}>
                    <Button variant="secondary" size="sm" onClick={() => void handleCopy(value)}>
                      Copy
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(index)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRotate(index)}>
                      Rotate
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(index)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Recommended flow">
        <div className={styles.flowList}>
          <div className={styles.flowItem}>
            <span className={styles.flowStep}>1</span>
            <div>
              <div className={styles.flowTitle}>Create a client key</div>
              <p className={styles.flowText}>
                This key is what your users paste into their third-party CLI tools.
              </p>
            </div>
          </div>
          <div className={styles.flowItem}>
            <span className={styles.flowStep}>2</span>
            <div>
              <div className={styles.flowTitle}>Upload or login your accounts</div>
              <p className={styles.flowText}>
                Use the Accounts and OAuth pages to add Codex, Claude, Gemini, Kimi or other credentials.
              </p>
            </div>
          </div>
          <div className={styles.flowItem}>
            <span className={styles.flowStep}>3</span>
            <div>
              <div className={styles.flowTitle}>Watch quota and usage</div>
              <p className={styles.flowText}>
                Check the Quota page for remaining turns and the Usage page for request/token analytics.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        title={isEditing ? 'Edit access key' : 'Create access key'}
        onClose={resetModal}
        footer={
          <>
            <Button variant="secondary" onClick={resetModal}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {isEditing ? 'Save changes' : 'Create key'}
            </Button>
          </>
        }
      >
        <div className={styles.modalBody}>
          <Input
            autoFocus
            label="Access key"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="cpw_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Use a memorable prefix if you want to know where the key came from."
          />
          <div className={styles.modalActions}>
            <Button variant="secondary" size="sm" onClick={() => setDraft(createRandomKey())}>
              Generate another
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
