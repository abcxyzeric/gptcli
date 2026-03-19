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
      const message =
        err instanceof Error
          ? err.message
          : t('access_keys_page.load_error', {
              defaultValue: 'Failed to load access keys.',
            });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      showNotification(
        t('access_keys_page.empty_error', { defaultValue: 'Please enter an access key.' }),
        'error'
      );
      return;
    }

    const duplicateIndex = keys.findIndex(
      (value, index) => value === trimmed && index !== editingIndex
    );
    if (duplicateIndex !== -1) {
      showNotification(
        t('access_keys_page.duplicate_error', {
          defaultValue: 'This access key already exists.',
        }),
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      if (editingIndex === null) {
        await apiKeysApi.replace([...keys, trimmed]);
        showNotification(
          t('access_keys_page.added_success', { defaultValue: 'New access key added.' }),
          'success'
        );
      } else {
        await apiKeysApi.update(editingIndex, trimmed);
        showNotification(
          t('access_keys_page.updated_success', { defaultValue: 'Access key updated.' }),
          'success'
        );
      }

      await loadKeys();
      resetModal();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t('access_keys_page.save_error', {
              defaultValue: 'Unable to save the access key.',
            });
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, editingIndex, keys, loadKeys, resetModal, showNotification, t]);

  const handleDelete = useCallback((index: number) => {
    showConfirmation({
      title: t('access_keys_page.confirm_delete_title', {
        defaultValue: 'Delete access key',
      }),
      message: t('access_keys_page.confirm_delete_body', {
        defaultValue: 'This client key will stop working immediately after removal.',
      }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiKeysApi.delete(index);
          showNotification(
            t('access_keys_page.deleted_success', { defaultValue: 'Access key deleted.' }),
            'success'
          );
          await loadKeys();
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : t('access_keys_page.delete_error', {
                  defaultValue: 'Unable to delete the access key.',
                });
          showNotification(message, 'error');
        }
      },
    });
  }, [loadKeys, showConfirmation, showNotification, t]);

  const handleRotate = useCallback((index: number) => {
    const nextValue = createRandomKey();
    showConfirmation({
      title: t('access_keys_page.confirm_rotate_title', {
        defaultValue: 'Rotate access key',
      }),
      message: t('access_keys_page.confirm_rotate_body', {
        defaultValue: 'The old key will stop working as soon as the new one is saved.',
      }),
      confirmText: t('access_keys_page.rotate_confirm', { defaultValue: 'Rotate' }),
      cancelText: t('common.cancel'),
      variant: 'primary',
      onConfirm: async () => {
        try {
          await apiKeysApi.update(index, nextValue);
          showNotification(
            t('access_keys_page.rotated_success', { defaultValue: 'Access key rotated.' }),
            'success'
          );
          await loadKeys();
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : t('access_keys_page.rotate_error', {
                  defaultValue: 'Unable to rotate the access key.',
                });
          showNotification(message, 'error');
        }
      },
    });
  }, [loadKeys, showConfirmation, showNotification, t]);

  const handleCopy = useCallback(async (value: string) => {
    const copied = await copyToClipboard(value);
    showNotification(
      copied
        ? t('access_keys_page.copy_success', {
            defaultValue: 'Access key copied to clipboard.',
          })
        : t('access_keys_page.copy_failed', { defaultValue: 'Copy failed.' }),
      copied ? 'success' : 'error'
    );
  }, [showNotification, t]);

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
          <h1 className={styles.pageTitle}>
            {t('access_keys_page.title', { defaultValue: 'Access Keys' })}
          </h1>
          <p className={styles.description}>
            {t('access_keys_page.description', {
              defaultValue:
                'Manage the client keys that your web users or CLI tools will use to call the proxy.',
            })}
          </p>
        </div>
        <div className={styles.pageActions}>
          <Button variant="secondary" size="sm" onClick={() => void loadKeys()} disabled={loading}>
            {t('common.refresh')}
          </Button>
          <Button size="sm" onClick={openCreateModal} disabled={disableControls}>
            {t('access_keys_page.add_key', { defaultValue: 'Add key' })}
          </Button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{keyStats.total}</span>
          <span className={styles.statLabel}>
            {t('access_keys_page.total_client_keys', { defaultValue: 'Total client keys' })}
          </span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{keyStats.longLived}</span>
          <span className={styles.statLabel}>
            {t('access_keys_page.generated_in_panel', { defaultValue: 'Generated by this panel' })}
          </span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>
            {disableControls
              ? t('access_keys_page.offline', { defaultValue: 'Offline' })
              : t('access_keys_page.ready', { defaultValue: 'Ready' })}
          </span>
          <span className={styles.statLabel}>
            {t('access_keys_page.management_connection', {
              defaultValue: 'Management connection',
            })}
          </span>
        </Card>
      </div>

      <Card
        title={t('access_keys_page.list_title', { defaultValue: 'Key list' })}
        extra={
          <span className={styles.cardHint}>
            {t('access_keys_page.list_hint', {
              defaultValue:
                'These keys map to the top-level `api-keys` list in CLIProxyAPI.',
            })}
          </span>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>
            {t('access_keys_page.loading', { defaultValue: 'Loading access keys...' })}
          </div>
        ) : keys.length === 0 ? (
          <div className={styles.emptyState}>
            {t('access_keys_page.empty', {
              defaultValue:
                'No client keys yet. Create one here, then distribute it to your CLI users.',
            })}
          </div>
        ) : (
          <div className={styles.keysGrid}>
            {keys.map((value, index) => {
              const expanded = expandedIndexes.has(index);

              return (
                <div key={`${value}-${index}`} className={styles.keyCard}>
                  <div className={styles.keyHeader}>
                    <div>
                      <div className={styles.keyTitle}>
                        {t('access_keys_page.key_title', {
                          defaultValue: 'Client key #{{index}}',
                          index: index + 1,
                        })}
                      </div>
                      <div className={styles.keyMeta}>
                        {value.startsWith(ACCESS_KEY_PREFIX)
                          ? t('access_keys_page.generated_badge', {
                              defaultValue: 'Generated in panel',
                            })
                          : t('access_keys_page.imported_badge', {
                              defaultValue: 'Imported or custom',
                            })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.showButton}
                      onClick={() => toggleExpanded(index)}
                    >
                      {expanded
                        ? t('access_keys_page.hide', { defaultValue: 'Hide' })
                        : t('access_keys_page.show', { defaultValue: 'Show' })}
                    </button>
                  </div>

                  <div className={styles.keyValue}>{maskKey(value, expanded)}</div>

                  <div className={styles.keyActions}>
                    <Button variant="secondary" size="sm" onClick={() => void handleCopy(value)}>
                      {t('access_keys_page.copy', { defaultValue: 'Copy' })}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(index)}>
                      {t('access_keys_page.edit', { defaultValue: 'Edit' })}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRotate(index)}>
                      {t('access_keys_page.rotate', { defaultValue: 'Rotate' })}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(index)}>
                      {t('access_keys_page.delete', { defaultValue: 'Delete' })}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={t('access_keys_page.recommended_flow', { defaultValue: 'Recommended flow' })}>
        <div className={styles.flowList}>
          <div className={styles.flowItem}>
            <span className={styles.flowStep}>1</span>
            <div>
              <div className={styles.flowTitle}>
                {t('access_keys_page.flow_1_title', { defaultValue: 'Create a client key' })}
              </div>
              <p className={styles.flowText}>
                {t('access_keys_page.flow_1_desc', {
                  defaultValue:
                    'This key is what your users paste into their third-party CLI tools.',
                })}
              </p>
            </div>
          </div>
          <div className={styles.flowItem}>
            <span className={styles.flowStep}>2</span>
            <div>
              <div className={styles.flowTitle}>
                {t('access_keys_page.flow_2_title', {
                  defaultValue: 'Upload or login your accounts',
                })}
              </div>
              <p className={styles.flowText}>
                {t('access_keys_page.flow_2_desc', {
                  defaultValue:
                    'Use the Accounts and OAuth pages to add Codex, Claude, Gemini, Kimi or other credentials.',
                })}
              </p>
            </div>
          </div>
          <div className={styles.flowItem}>
            <span className={styles.flowStep}>3</span>
            <div>
              <div className={styles.flowTitle}>
                {t('access_keys_page.flow_3_title', {
                  defaultValue: 'Watch quota and usage',
                })}
              </div>
              <p className={styles.flowText}>
                {t('access_keys_page.flow_3_desc', {
                  defaultValue:
                    'Check the Quota page for remaining turns and the Usage page for request/token analytics.',
                })}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        title={
          isEditing
            ? t('access_keys_page.edit_key', { defaultValue: 'Edit access key' })
            : t('access_keys_page.create_key', { defaultValue: 'Create access key' })
        }
        onClose={resetModal}
        footer={
          <>
            <Button variant="secondary" onClick={resetModal}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {isEditing
                ? t('access_keys_page.save_changes', { defaultValue: 'Save changes' })
                : t('access_keys_page.create_key', { defaultValue: 'Create key' })}
            </Button>
          </>
        }
      >
        <div className={styles.modalBody}>
          <Input
            autoFocus
            label={t('access_keys_page.access_key_label', { defaultValue: 'Access key' })}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('access_keys_page.access_key_placeholder', {
              defaultValue: 'cpw_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            })}
            hint={t('access_keys_page.access_key_hint', {
              defaultValue:
                'Use a memorable prefix if you want to know where the key came from.',
            })}
          />
          <div className={styles.modalActions}>
            <Button variant="secondary" size="sm" onClick={() => setDraft(createRandomKey())}>
              {t('access_keys_page.generate_another', { defaultValue: 'Generate another' })}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
