import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Toast, createToastId, type ToastMessage } from './Toast'
import {
  getBackups,
  addBackup,
  updateBackup,
  deleteBackup,
  type BackupConfig
} from '@/utils/storage'
import { GistStorage } from '@/lib/storage/gist'
import { FadeInUp, HoverScale, PressScale, Skeleton } from '@/lib/motion'
import { useSyncOperations } from '../hooks/useSyncOperations'
import {
  BackupCard,
  BackupModal,
  PullSelectModal,
  DiffPreviewModal,
  Spinner,
  UploadIcon,
  DownloadIcon,
  PlusIcon,
  BookmarkIcon,
  type BackupWithProfile,
  type BackupFormData
} from './dashboard-components'

interface DashboardProps {
  initialAction?: { action?: 'push' | 'pull'; backupId?: string }
  onActionHandled?: () => void
}

export function Dashboard({ initialAction, onActionHandled }: DashboardProps) {
  const { t } = useTranslation()
  const [backups, setBackups] = useState<BackupWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showPullModal, setShowPullModal] = useState(false)
  const [editingBackup, setEditingBackup] = useState<BackupConfig | null>(null)
  const [messages, setMessages] = useState<ToastMessage[]>([])
  const initialActionHandled = useRef(false)

  function showMessage(type: 'success' | 'error', text: string) {
    const id = createToastId()
    setMessages((prev) => [...prev, { id, type, text }])
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }, 3000)
  }

  function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const {
    batchSyncing,
    diffState,
    handleBatchPush,
    handlePullFromBackup,
    handleDiffConfirm,
    handleDiffCancel,
    handleCancelAllPush
  } = useSyncOperations({
    backups,
    onReload: loadBackups,
    showMessage
  })

  useEffect(() => {
    loadBackups()
  }, [])

  // 处理从 popup 传入的初始操作
  useEffect(() => {
    if (!initialAction?.action || loading || initialActionHandled.current) return
    initialActionHandled.current = true

    if (initialAction.action === 'push') {
      handleBatchPush()
    } else if (initialAction.action === 'pull') {
      if (initialAction.backupId) {
        const backup = backups.find(b => b.id === initialAction.backupId)
        if (backup) handlePullFromBackup(backup)
      } else {
        handleBatchPull()
      }
    }
    onActionHandled?.()
  }, [initialAction, loading, backups, handleBatchPush, handlePullFromBackup])

  async function loadBackups() {
    setLoading(true)
    try {
      const list = await getBackups()
      const basicBackups: BackupWithProfile[] = list.map((backup) => ({
        ...backup,
        gistUrl: backup.gistId ? `https://gist.github.com/${backup.gistId}` : undefined
      }))
      setBackups(basicBackups)
      setLoading(false)

      // 异步加载 profile 信息
      const withProfiles = await Promise.all(
        basicBackups.map(async (backup) => {
          if (backup.type === 'gist' && backup.token) {
            try {
              const storage = new GistStorage(backup.token, backup.gistId)
              const profile = await storage.getUserProfile()
              return {
                ...backup,
                username: profile?.name || 'GitHub User',
                avatarUrl: profile?.avatar_url
              }
            } catch {
              return backup
            }
          }
          return backup
        })
      )
      setBackups(withProfiles)
    } catch {
      setBackups([])
      setLoading(false)
    }
  }

  function handleNewBackup() {
    setEditingBackup(null)
    setShowModal(true)
  }

  function handleEditBackup(backup: BackupConfig) {
    setEditingBackup(backup)
    setShowModal(true)
  }

  async function handleDeleteBackup(id: string) {
    if (!confirm(t('dashboard.confirmDelete'))) return
    try {
      await deleteBackup(id)
      await loadBackups()
      showMessage('success', t('dashboard.backupDeleted'))
    } catch {
      showMessage('error', t('dashboard.deleteFailed'))
    }
  }

  async function handleToggleUpload(id: string) {
    const backup = backups.find(b => b.id === id)
    if (backup) {
      await updateBackup(id, { uploadEnabled: backup.uploadEnabled === false })
      await loadBackups()
    }
  }

  async function handleToggleDownload(id: string) {
    const backup = backups.find(b => b.id === id)
    if (backup) {
      await updateBackup(id, { downloadEnabled: backup.downloadEnabled === false })
      await loadBackups()
    }
  }

  async function handleModalSubmit(data: BackupFormData) {
    try {
      if (editingBackup) {
        await updateBackup(editingBackup.id, {
          name: data.name,
          token: data.token,
          gistId: data.gistId || null,
          folderPath: data.folderPath
        })
        showMessage('success', t('dashboard.backupUpdated'))
      } else {
        await addBackup({
          name: data.name || 'GitHub Gist',
          enabled: true,
          uploadEnabled: true,
          downloadEnabled: true,
          type: 'gist',
          token: data.token,
          gistId: data.gistId || null,
          lastSyncTime: null,
          folderPath: data.folderPath
        })
        showMessage('success', t('dashboard.backupAdded'))
      }
      await loadBackups()
      setShowModal(false)
    } catch {
      showMessage('error', t('dashboard.saveFailed'))
    }
  }

  function handleBatchPull() {
    const enabled = backups.filter(b => b.enabled && b.downloadEnabled !== false)
    if (enabled.length === 0) {
      showMessage('error', t('popup.noDownloadBackup'))
      return
    }
    setShowPullModal(true)
  }

  function handleSelectPullBackup(backup: BackupWithProfile) {
    setShowPullModal(false)
    handlePullFromBackup(backup)
  }

  const enabledCount = backups.filter(b => b.enabled).length

  return (
    <FadeInUp className="flex-1 p-8 overflow-auto relative z-10">
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">{t('dashboard.backupList')}</h1>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
              {t('dashboard.backupCount', { count: backups.length })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {backups.length > 0 && (
              <>
                <PressScale
                  onClick={handleBatchPush}
                  disabled={batchSyncing !== null || enabledCount === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-400 text-white text-sm font-medium rounded-xl hover:bg-sky-500 transition-colors shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {batchSyncing === 'push' ? <Spinner /> : <UploadIcon />}
                  {t('popup.upload')}
                </PressScale>
                <PressScale
                  onClick={handleBatchPull}
                  disabled={batchSyncing !== null || enabledCount === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-400 text-white text-sm font-medium rounded-xl hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {batchSyncing === 'pull' ? <Spinner /> : <DownloadIcon />}
                  {t('popup.download')}
                </PressScale>
              </>
            )}
            <PressScale
              onClick={handleNewBackup}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-300"
            >
              <PlusIcon />
              {t('dashboard.newBackup')}
            </PressScale>
          </div>
        </div>

        <Toast messages={messages} onRemove={removeMessage} />

        {loading ? (
          <LoadingSkeleton />
        ) : backups.length > 0 ? (
          <div className="space-y-3">
            {backups.map((backup, index) => (
              <BackupCard
                key={backup.id}
                backup={backup}
                index={index}
                onEdit={() => handleEditBackup(backup)}
                onDelete={() => handleDeleteBackup(backup.id)}
                onToggleUpload={() => handleToggleUpload(backup.id)}
                onToggleDownload={() => handleToggleDownload(backup.id)}
                onUpdate={loadBackups}
                onMessage={showMessage}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      <BackupModal
        isOpen={showModal}
        editingBackup={editingBackup}
        onClose={() => setShowModal(false)}
        onSubmit={handleModalSubmit}
      />
      <PullSelectModal
        isOpen={showPullModal}
        backups={backups.filter(b => b.enabled && b.downloadEnabled !== false)}
        onClose={() => setShowPullModal(false)}
        onSelect={handleSelectPullBackup}
      />
      <DiffPreviewModal
        isOpen={diffState.showModal}
        diff={diffState.result}
        action={diffState.action}
        backupName={diffState.action === 'push' ? diffState.currentPushBackup?.name : diffState.pendingPullBackup?.name}
        hasMoreBackups={diffState.action === 'push' && diffState.pendingPushBackups.length > 0}
        onConfirm={handleDiffConfirm}
        onSkip={handleDiffCancel}
        onCancelAll={handleCancelAllPush}
      />
    </FadeInUp>
  )
}

// 加载骨架屏
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
          <Skeleton variant="circle" className="w-12 h-12" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-1 text-right">
            <Skeleton className="h-3 w-16 ml-auto" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      ))}
    </div>
  )
}

// 空状态
function EmptyState() {
  const { t } = useTranslation()
  return (
    <FadeInUp>
      <HoverScale className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-50 rounded-2xl flex items-center justify-center">
          <BookmarkIcon />
        </div>
        <p className="text-slate-600 font-medium">{t('dashboard.noBackup')}</p>
        <p className="text-sm text-slate-400 mt-1">{t('dashboard.noBackupHint')}</p>
      </HoverScale>
    </FadeInUp>
  )
}
