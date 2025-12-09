import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  getBackups,
  getUploadEnabledBackups,
  getDownloadEnabledBackups,
  addBackup,
  updateBackup,
  deleteBackup,
  toggleBackup,
  getSettings,
  type BackupConfig
} from '@/utils/storage'
import { GistStorage } from '@/lib/storage/gist'
import { SyncEngine, isLocked } from '@/lib/sync'
import { getLocalBookmarks, getBookmarksByFolder } from '@/lib/bookmark/parser'
import { htmlFormat } from '@/lib/bookmark/formats'
import { calculateDiff, type DiffResult } from '@/lib/bookmark/diff'
import { FadeInUp, HoverScale, PressScale, AnimatePresence, Overlay, ScaleIn, Switch, motion, springPresets, Skeleton } from '@/lib/motion'

// Portal 包装组件，将内容渲染到 body
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}

interface BackupWithProfile extends BackupConfig {
  username?: string
  avatarUrl?: string
  gistUrl?: string
}

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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [batchSyncing, setBatchSyncing] = useState<'push' | 'pull' | null>(null)
  // 差异预览相关状态
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffAction, setDiffAction] = useState<'push' | 'pull' | null>(null)
  const [pendingPullBackup, setPendingPullBackup] = useState<BackupWithProfile | null>(null)
  // 批量上传队列状态
  const [pendingPushBackups, setPendingPushBackups] = useState<BackupConfig[]>([])
  const [currentPushBackup, setCurrentPushBackup] = useState<BackupConfig | null>(null)
  const [pushResults, setPushResults] = useState<{ items: { name: string; added: number; removed: number }[]; fail: number }>({ items: [], fail: 0 })
  const initialActionHandled = useRef(false)

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
  }, [initialAction, loading, backups])

  async function loadBackups() {
    setLoading(true)
    try {
      const list = await getBackups()
      // 先设置基础数据，快速结束 loading 状态
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
      setMessage({ type: 'success', text: t('dashboard.backupDeleted') })
    } catch {
      setMessage({ type: 'error', text: t('dashboard.deleteFailed') })
    }
  }

  async function handleToggleBackup(id: string) {
    await toggleBackup(id)
    await loadBackups()
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

  async function handleModalSubmit(data: { name: string; token: string; gistId: string; folderPath: string | null }) {
    try {
      if (editingBackup) {
        await updateBackup(editingBackup.id, {
          name: data.name,
          token: data.token,
          gistId: data.gistId || null,
          folderPath: data.folderPath
        })
        setMessage({ type: 'success', text: t('dashboard.backupUpdated') })
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
        setMessage({ type: 'success', text: t('dashboard.backupAdded') })
      }
      await loadBackups()
      setShowModal(false)
    } catch {
      setMessage({ type: 'error', text: t('dashboard.saveFailed') })
    }
  }

  // 批量上传到所有启用的备份
  async function handleBatchPush() {
    const enabled = await getUploadEnabledBackups()
    if (enabled.length === 0) {
      setMessage({ type: 'error', text: t('popup.noUploadBackup') })
      return
    }
    if (await isLocked()) {
      setMessage({ type: 'error', text: t('popup.operationLocked') })
      return
    }

    // 检查是否启用差异预览
    const settings = await getSettings()
    if (settings.diffPreviewEnabled) {
      // 初始化队列和结果
      setPendingPushBackups(enabled)
      setPushResults({ items: [], fail: 0 })
      // 开始处理第一个备份
      await processNextPushBackup(enabled, { items: [], fail: 0 })
      return
    }

    await executeBatchPush()
  }

  // 处理队列中下一个备份的 diff 预览
  async function processNextPushBackup(
    queue: BackupConfig[],
    results: { items: { name: string; added: number; removed: number }[]; fail: number }
  ) {
    if (queue.length === 0) {
      // 队列处理完毕，显示结果
      finishBatchPush(results)
      return
    }

    const [current, ...rest] = queue
    setPendingPushBackups(rest)
    setCurrentPushBackup(current)

    // 尝试获取 diff
    if (current.gistId) {
      try {
        const storage = new GistStorage(current.token, current.gistId)
        const remoteData = await storage.read()
        const folderPath = current.folderPath
        const localBookmarks = folderPath
          ? await getBookmarksByFolder(folderPath)
          : await getLocalBookmarks()
        const remoteBookmarks = remoteData?.bookmarks || []
        const diff = calculateDiff(remoteBookmarks, localBookmarks, { skipRootPath: !!folderPath })

        if (diff.hasChanges) {
          // 有变更，显示预览
          setDiffResult(diff)
          setDiffAction('push')
          setPushResults(results)
          setShowDiffModal(true)
          return
        }
      } catch {
        // 获取差异失败，直接执行上传
      }
    }

    // 无变更，跳过此备份继续下一个
    await processNextPushBackup(rest, results)
  }

  // 执行单个备份的上传
  async function executeSinglePush(
    backup: BackupConfig,
    results: { items: { name: string; added: number; removed: number }[]; fail: number },
    diff?: DiffResult
  ): Promise<{ items: { name: string; added: number; removed: number }[]; fail: number }> {
    setBatchSyncing('push')
    try {
      const storage = new GistStorage(backup.token, backup.gistId)
      const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
      const result = await engine.push()
      if (result.success) {
        const gistId = storage.getGistId()
        if (gistId && gistId !== backup.gistId) {
          await updateBackup(backup.id, { gistId, lastSyncTime: Date.now() })
        } else {
          await updateBackup(backup.id, { lastSyncTime: Date.now() })
        }
        return {
          items: [...results.items, { name: backup.name, added: diff?.added.length || 0, removed: diff?.removed.length || 0 }],
          fail: results.fail
        }
      }
      return { ...results, fail: results.fail + 1 }
    } catch {
      return { ...results, fail: results.fail + 1 }
    } finally {
      setBatchSyncing(null)
    }
  }

  // 完成批量上传，显示结果
  async function finishBatchPush(results: { items: { name: string; added: number; removed: number }[]; fail: number }) {
    setCurrentPushBackup(null)
    setPendingPushBackups([])
    setPushResults({ items: [], fail: 0 })
    await loadBackups()

    if (results.items.length === 0 && results.fail === 0) {
      // 所有备份都没有变更或被跳过
      setMessage({ type: 'success', text: t('popup.uploadSuccessNoChanges') })
    } else if (results.fail === 0) {
      // 生成每个备份的消息
      const text = results.items.map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed })).join('\n')
      setMessage({ type: 'success', text })
    } else if (results.items.length === 0) {
      setMessage({ type: 'error', text: t('popup.uploadFailed') })
    } else {
      setMessage({ type: 'error', text: t('popup.partialSuccess', { success: results.items.length, fail: results.fail }) })
    }
  }

  // 执行批量上传（差异预览未启用时）
  async function executeBatchPush() {
    const enabled = await getUploadEnabledBackups()
    setBatchSyncing('push')
    const results: { name: string; added: number; removed: number }[] = []
    let failCount = 0

    for (const backup of enabled) {
      try {
        const storage = new GistStorage(backup.token, backup.gistId)
        let added = 0, removed = 0
        // 计算 diff
        if (backup.gistId) {
          try {
            const remoteData = await storage.read()
            const folderPath = backup.folderPath
            const localBookmarks = folderPath
              ? await getBookmarksByFolder(folderPath)
              : await getLocalBookmarks()
            const remoteBookmarks = remoteData?.bookmarks || []
            const diff = calculateDiff(remoteBookmarks, localBookmarks, { skipRootPath: !!folderPath })
            if (!diff.hasChanges) continue // 没有变化，跳过
            added = diff.added.length
            removed = diff.removed.length
          } catch { /* 获取 diff 失败，继续执行 */ }
        }
        const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
        const result = await engine.push()
        if (result.success) {
          const gistId = storage.getGistId()
          if (gistId && gistId !== backup.gistId) {
            await updateBackup(backup.id, { gistId, lastSyncTime: Date.now() })
          } else {
            await updateBackup(backup.id, { lastSyncTime: Date.now() })
          }
          results.push({ name: backup.name, added, removed })
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    setBatchSyncing(null)
    await loadBackups()
    if (results.length === 0 && failCount === 0) {
      setMessage({ type: 'success', text: t('popup.uploadSuccessNoChanges') })
    } else if (failCount === 0) {
      const text = results.map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed })).join('\n')
      setMessage({ type: 'success', text })
    } else if (results.length > 0) {
      setMessage({ type: 'error', text: t('popup.partialSuccess', { success: results.length, fail: failCount }) })
    } else {
      setMessage({ type: 'error', text: t('popup.uploadFailed') })
    }
  }

  // 打开下载选择弹窗
  function handleBatchPull() {
    const enabled = backups.filter(b => b.enabled && b.downloadEnabled !== false)
    if (enabled.length === 0) {
      setMessage({ type: 'error', text: t('popup.noDownloadBackup') })
      return
    }
    setShowPullModal(true)
  }

  // 从指定备份下载
  async function handlePullFromBackup(backup: BackupWithProfile) {
    if (await isLocked()) {
      setMessage({ type: 'error', text: t('popup.operationLocked') })
      return
    }

    setShowPullModal(false)

    // 检查是否启用差异预览
    const settings = await getSettings()
    if (settings.diffPreviewEnabled && backup.gistId) {
      try {
        const storage = new GistStorage(backup.token, backup.gistId)
        const remoteData = await storage.read()
        if (remoteData) {
          // 使用与实际同步相同的文件夹路径获取本地书签
          const folderPath = backup.folderPath
          const localBookmarks = folderPath
            ? await getBookmarksByFolder(folderPath)
            : await getLocalBookmarks()
          // 下载：本地将被远端覆盖，所以 source=本地, target=远端
          // 如果使用了文件夹同步，跳过根路径比较（不同设备可能使用不同文件夹名）
          const diff = calculateDiff(localBookmarks, remoteData.bookmarks, { skipRootPath: !!folderPath })
          if (diff.hasChanges) {
            setDiffResult(diff)
            setDiffAction('pull')
            setPendingPullBackup(backup)
            setShowDiffModal(true)
            return
          }
        }
      } catch {
        // 获取差异失败，继续执行下载
      }
    }

    await executePullFromBackup(backup)
  }

  // 执行下载
  async function executePullFromBackup(backup: BackupWithProfile) {
    setBatchSyncing('pull')

    try {
      const storage = new GistStorage(backup.token, backup.gistId)
      const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
      const result = await engine.pull()
      if (result.success) {
        await updateBackup(backup.id, { lastSyncTime: Date.now() })
        setMessage({ type: 'success', text: t('popup.downloadSuccess') })
      } else {
        setMessage({ type: 'error', text: t('popup.downloadFailed') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('popup.downloadFailed') })
    }

    setBatchSyncing(null)
    await loadBackups()
  }

  // 差异预览确认
  async function handleDiffConfirm() {
    setShowDiffModal(false)
    const currentDiff = diffResult
    setDiffResult(null)

    if (diffAction === 'push' && currentPushBackup) {
      // 执行当前备份的上传，然后继续处理队列
      const newResults = await executeSinglePush(currentPushBackup, pushResults, currentDiff || undefined)
      setDiffAction(null)
      await processNextPushBackup(pendingPushBackups, newResults)
    } else if (diffAction === 'pull' && pendingPullBackup) {
      await executePullFromBackup(pendingPullBackup)
      setDiffAction(null)
      setPendingPullBackup(null)
    }
  }

  // 差异预览取消（跳过当前备份，继续下一个）
  async function handleDiffCancel() {
    setShowDiffModal(false)
    setDiffResult(null)

    // 如果是 push 操作，跳过当前备份，继续处理队列
    if (diffAction === 'push' && currentPushBackup) {
      setDiffAction(null)
      // 继续处理下一个备份
      await processNextPushBackup(pendingPushBackups, pushResults)
      return
    }

    // pull 操作直接关闭
    setDiffAction(null)
    setPendingPullBackup(null)
  }

  // 取消整个批量上传操作
  function handleCancelAllPush() {
    setShowDiffModal(false)
    setDiffResult(null)
    setDiffAction(null)
    setCurrentPushBackup(null)
    setPendingPushBackups([])

    if (pushResults.items.length > 0 || pushResults.fail > 0) {
      loadBackups()
      if (pushResults.fail === 0 && pushResults.items.length > 0) {
        const text = pushResults.items.map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed })).join('\n')
        setMessage({ type: 'success', text })
      } else if (pushResults.items.length > 0) {
        setMessage({
          type: 'error',
          text: t('popup.partialSuccess', { success: pushResults.items.length, fail: pushResults.fail }),
        })
      }
    }
    setPushResults({ items: [], fail: 0 })
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('dashboard.newBackup')}
            </PressScale>
          </div>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={springPresets.snappy}
              className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'}`}
            >
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
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
        ) : backups.length > 0 ? (
          <div className="space-y-3">
            {backups.map((backup, index) => (
              <BackupCard
                key={backup.id}
                backup={backup}
                index={index}
                onEdit={() => handleEditBackup(backup)}
                onDelete={() => handleDeleteBackup(backup.id)}
                onToggle={() => handleToggleBackup(backup.id)}
                onToggleUpload={() => handleToggleUpload(backup.id)}
                onToggleDownload={() => handleToggleDownload(backup.id)}
                onUpdate={loadBackups}
                onMessage={setMessage}
              />
            ))}
          </div>
        ) : (
          <FadeInUp>
            <HoverScale className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-50 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">{t('dashboard.noBackup')}</p>
              <p className="text-sm text-slate-400 mt-1">{t('dashboard.noBackupHint')}</p>
            </HoverScale>
          </FadeInUp>
        )}
      </div>
      <NewBackupModal
        isOpen={showModal}
        editingBackup={editingBackup}
        onClose={() => setShowModal(false)}
        onSubmit={handleModalSubmit}
      />
      <PullSelectModal
        isOpen={showPullModal}
        backups={backups.filter(b => b.enabled && b.downloadEnabled !== false)}
        onClose={() => setShowPullModal(false)}
        onSelect={handlePullFromBackup}
      />
      <DiffPreviewModal
        isOpen={showDiffModal}
        diff={diffResult}
        action={diffAction}
        backupName={diffAction === 'push' ? currentPushBackup?.name : pendingPullBackup?.name}
        hasMoreBackups={diffAction === 'push' && pendingPushBackups.length > 0}
        onConfirm={handleDiffConfirm}
        onSkip={handleDiffCancel}
        onCancelAll={handleCancelAllPush}
      />
    </FadeInUp>
  )
}


interface BackupCardProps {
  backup: BackupWithProfile
  index: number
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onToggleUpload: () => void
  onToggleDownload: () => void
  onUpdate: () => void
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
}

function BackupCard({ backup, index, onEdit, onDelete, onToggle, onToggleUpload, onToggleDownload, onUpdate, onMessage }: BackupCardProps) {
  const { t } = useTranslation()
  const [syncing, setSyncing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handlePush() {
    if (await isLocked()) {
      onMessage({ type: 'error', text: t('popup.operationLocked') })
      return
    }
    setSyncing(true)
    try {
      const storage = new GistStorage(backup.token, backup.gistId)
      let added = 0, removed = 0
      // 计算 diff
      if (backup.gistId) {
        try {
          const remoteData = await storage.read()
          const folderPath = backup.folderPath
          const localBookmarks = folderPath
            ? await getBookmarksByFolder(folderPath)
            : await getLocalBookmarks()
          const remoteBookmarks = remoteData?.bookmarks || []
          const diff = calculateDiff(remoteBookmarks, localBookmarks, { skipRootPath: !!folderPath })
          if (!diff.hasChanges) {
            onMessage({ type: 'success', text: t('popup.uploadSuccessNoChanges') })
            return
          }
          added = diff.added.length
          removed = diff.removed.length
        } catch { /* 获取 diff 失败，继续执行 */ }
      }
      const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
      const result = await engine.push()
      if (result.success) {
        const gistId = storage.getGistId()
        if (gistId && gistId !== backup.gistId) {
          await updateBackup(backup.id, { gistId, lastSyncTime: Date.now() })
        } else {
          await updateBackup(backup.id, { lastSyncTime: Date.now() })
        }
        onMessage({ type: 'success', text: t('popup.uploadSuccess', { name: backup.name, added, removed }) })
      } else {
        onMessage({ type: 'error', text: t('popup.uploadFailed') })
      }
      onUpdate()
    } catch (err) {
      onMessage({ type: 'error', text: t('popup.uploadFailed') })
      console.error('上传失败:', err)
    } finally {
      setSyncing(false)
      setShowMenu(false)
    }
  }

  async function handlePull() {
    if (await isLocked()) {
      onMessage({ type: 'error', text: t('popup.operationLocked') })
      return
    }
    setRestoring(true)
    try {
      const storage = new GistStorage(backup.token, backup.gistId)
      const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
      const result = await engine.pull()
      if (result.success) {
        await updateBackup(backup.id, { lastSyncTime: Date.now() })
        onMessage({ type: 'success', text: t('popup.downloadSuccess') })
      } else {
        onMessage({ type: 'error', text: t('popup.downloadFailed') })
      }
      onUpdate()
    } catch (err) {
      onMessage({ type: 'error', text: t('popup.downloadFailed') })
      console.error('下载失败:', err)
    } finally {
      setRestoring(false)
      setShowMenu(false)
    }
  }

  async function handleExportHtml() {
    try {
      const bookmarks = backup.folderPath
        ? await getBookmarksByFolder(backup.folderPath)
        : await getLocalBookmarks()
      const html = htmlFormat.serialize(bookmarks)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bookmarks-${backup.name}-${new Date().toISOString().slice(0, 10)}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出失败:', err)
    } finally {
      setShowMenu(false)
    }
  }

  const lastSync = backup.lastSyncTime
    ? new Date(backup.lastSyncTime).toLocaleString()
    : null

  return (
    <FadeInUp delay={index * 0.05}>
      <HoverScale className={`bg-white rounded-2xl border shadow-sm ${backup.enabled ? 'border-gray-100' : 'border-gray-200 opacity-60'} ${showMenu ? 'z-50 relative' : ''}`}>
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-sky-100 flex-shrink-0 border-2 border-white shadow-sm">
              {backup.avatarUrl ? (
                <img src={backup.avatarUrl} alt={backup.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sky-500 font-bold text-lg">G</div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-800">{backup.name}</span>
                {backup.folderPath && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-md font-medium border border-amber-100" title={backup.folderPath}>
                    {backup.folderPath.split('/').pop()}
                  </span>
                )}
                {backup.uploadEnabled !== false && (
                  <span className="px-2 py-0.5 bg-sky-50 text-sky-600 text-xs rounded-md font-medium border border-sky-100">{t('popup.upload')}</span>
                )}
                {backup.downloadEnabled !== false && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-md font-medium border border-emerald-100">{t('popup.download')}</span>
                )}
              </div>
              {backup.gistUrl ? (
                <a href={backup.gistUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-500 hover:text-sky-600 hover:underline flex items-center gap-1">
                  {t('dashboard.viewGist')}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                <span className="text-sm text-slate-400">{t('dashboard.noGist')}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-400">{t('dashboard.lastSync')}</div>
              <div className="text-sm font-medium text-slate-700">{lastSync || t('dashboard.never')}</div>
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-slate-100">
              <button onClick={onEdit} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title={t('common.edit')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={onDelete} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title={t('common.delete')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div className="relative" ref={menuRef}>
                <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" />
                  </svg>
                </button>
                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={springPresets.snappy}
                      className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50"
                    >
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                        <button onClick={handlePush} disabled={syncing} className="flex items-center gap-2 text-sm text-slate-700 disabled:opacity-50">
                          {syncing ? <Spinner /> : <UploadIcon />}
                          {syncing ? t('popup.uploading') : t('popup.upload')}
                        </button>
                        <Switch size="sm" enabled={backup.uploadEnabled !== false} onChange={onToggleUpload} />
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                        <button onClick={handlePull} disabled={restoring} className="flex items-center gap-2 text-sm text-slate-700 disabled:opacity-50">
                          {restoring ? <Spinner /> : <DownloadIcon />}
                          {restoring ? t('popup.downloading') : t('popup.download')}
                        </button>
                        <Switch size="sm" enabled={backup.downloadEnabled !== false} onChange={onToggleDownload} />
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <button onClick={handleExportHtml} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <ExportIcon />
                        {t('dashboard.exportHtml')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </HoverScale>
    </FadeInUp>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}


interface NewBackupModalProps {
  isOpen: boolean
  editingBackup: BackupConfig | null
  onClose: () => void
  onSubmit: (data: { name: string; token: string; gistId: string; folderPath: string | null }) => void
}

function NewBackupModal({ isOpen, editingBackup, onClose, onSubmit }: NewBackupModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [gistId, setGistId] = useState('')
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [testing, setTesting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTestResult(null)
      if (editingBackup) {
        setName(editingBackup.name || '')
        setToken(editingBackup.token || '')
        setGistId(editingBackup.gistId || '')
        setFolderPath(editingBackup.folderPath || null)
      } else {
        setName('')
        setToken('')
        setGistId('')
        setFolderPath(null)
      }
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, editingBackup])

  async function handleTest() {
    if (!token.trim()) {
      setTestResult({ success: false, message: t('dashboard.tokenRequired') })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const storage = new GistStorage(token.trim())
      const profile = await storage.getUserProfile()
      if (profile) {
        setTestResult({ success: true, message: t('dashboard.authSuccess', { name: profile.name }) })
      } else {
        setTestResult({ success: false, message: t('dashboard.tokenInvalid') })
      }
    } catch {
      setTestResult({ success: false, message: t('dashboard.connectionFailed') })
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit() {
    if (!token.trim()) {
      setTestResult({ success: false, message: t('dashboard.tokenRequired') })
      return
    }
    setCreating(true)
    try {
      const storage = new GistStorage(token.trim())
      const profile = await storage.getUserProfile()
      if (!profile) {
        setTestResult({ success: false, message: t('dashboard.tokenInvalid') })
        return
      }
      onSubmit({
        name: name.trim() || 'GitHub Gist',
        token: token.trim(),
        gistId: gistId.trim(),
        folderPath
      })
    } catch {
      setTestResult({ success: false, message: t('dashboard.verifyFailed') })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <Overlay onClick={onClose} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">{editingBackup ? t('dashboard.editBackup') : t('dashboard.newBackup')}</h3>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.backupName')}</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="GitHub Gist"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.backupMethod')}</label>
                <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-slate-800">GitHub Gist</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.token')} <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  {t('dashboard.tokenHint')}
                  <a href="https://github.com/settings/tokens/new?scopes=gist&description=OneBookmark" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline ml-1">{t('dashboard.createToken')}</a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.gistId')}</label>
                <input
                  type="text"
                  value={gistId}
                  onChange={(e) => setGistId(e.target.value)}
                  placeholder={t('dashboard.gistIdPlaceholder')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  {t('dashboard.gistIdHint')}
                  <a href="https://gist.github.com/" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline ml-1">{t('dashboard.viewMyGist')}</a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.folderPath')}</label>
                <button
                  type="button"
                  onClick={() => setShowFolderPicker(true)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-left text-sm transition-all hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400"
                >
                  {folderPath ? (
                    <span className="text-slate-800">{folderPath}</span>
                  ) : (
                    <span className="text-slate-400">{t('dashboard.rootFolder')}</span>
                  )}
                </button>
                <p className="mt-1.5 text-xs text-slate-400">{t('dashboard.folderPathHint')}</p>
              </div>
              <AnimatePresence>
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={springPresets.snappy}
                    className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'}`}
                  >
                    {testResult.message}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <PressScale onClick={handleTest} disabled={testing} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50">
                {testing ? t('dashboard.testing') : t('dashboard.testConnection')}
              </PressScale>
              <div className="flex gap-3">
                <PressScale onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">{t('common.cancel')}</PressScale>
                <PressScale onClick={handleSubmit} disabled={creating || !token.trim()} className="px-4 py-2 bg-sky-400 text-white text-sm font-medium rounded-xl hover:bg-sky-500 transition-colors shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
                  {creating ? t('dashboard.saving') : (editingBackup ? t('common.save') : t('dashboard.create'))}
                </PressScale>
              </div>
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
      <FolderPickerModal
        isOpen={showFolderPicker}
        currentPath={folderPath}
        onClose={() => setShowFolderPicker(false)}
        onSelect={(path) => {
          setFolderPath(path)
          setShowFolderPicker(false)
        }}
      />
    </Portal>
  )
}

// 下载选择弹窗
interface PullSelectModalProps {
  isOpen: boolean
  backups: BackupWithProfile[]
  onClose: () => void
  onSelect: (backup: BackupWithProfile) => void
}

function PullSelectModal({ isOpen, backups, onClose, onSelect }: PullSelectModalProps) {
  const { t } = useTranslation()

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <Overlay onClick={onClose} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">{t('dashboard.selectSource')}</h3>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {backups.map((backup, index) => (
                <motion.button
                  key={backup.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springPresets.gentle, delay: index * 0.05 }}
                  onClick={() => onSelect(backup)}
                  className="w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-left transition-colors flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-sky-100 flex-shrink-0">
                    {backup.avatarUrl ? (
                      <img src={backup.avatarUrl} alt={backup.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sky-500 font-bold">G</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{backup.name}</div>
                    <div className="text-xs text-slate-400">
                      {backup.lastSyncTime
                        ? `${t('dashboard.lastSync')}: ${new Date(backup.lastSyncTime).toLocaleString()}`
                        : t('popup.neverSynced')}
                    </div>
                  </div>
                  <DownloadIcon />
                </motion.button>
              ))}
            </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                <p className="text-xs text-slate-400 text-center">{t('dashboard.selectSourceHint')}</p>
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

// 差异预览弹窗
interface DiffPreviewModalProps {
  isOpen: boolean
  diff: DiffResult | null
  action: 'push' | 'pull' | null
  backupName?: string
  hasMoreBackups?: boolean
  onConfirm: () => void
  onSkip: () => void
  onCancelAll: () => void
}

function DiffPreviewModal({
  isOpen,
  diff,
  action,
  backupName,
  hasMoreBackups,
  onConfirm,
  onSkip,
  onCancelAll,
}: DiffPreviewModalProps) {
  const { t } = useTranslation()

  const totalChanges = diff ? diff.added.length + diff.removed.length + diff.modified.length : 0
  const actionDesc = action === 'push' ? t('popup.uploadOverwrite') : t('popup.downloadOverwrite')

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && diff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <Overlay onClick={hasMoreBackups ? onSkip : onCancelAll} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-800">
                      {action === 'push' ? t('popup.confirmUpload') : t('popup.confirmDownload')}
                    </h3>
                    {backupName && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                        {backupName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{actionDesc}</p>
                </div>
                <button
                  onClick={hasMoreBackups ? onSkip : onCancelAll}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 统计信息 */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                <span className="text-sm text-slate-600">{t('popup.totalChanges', { count: totalChanges })}:</span>
                {diff.added.length > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                    +{diff.added.length}
                  </span>
                )}
                {diff.removed.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">-{diff.removed.length}</span>
                )}
                {diff.modified.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                    ~{diff.modified.length}
                  </span>
                )}
              </div>

              {/* 差异列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {diff.added.map((item, i) => (
                  <DiffItemRow key={`add-${i}`} item={item} index={i} />
                ))}
                {diff.removed.map((item, i) => (
                  <DiffItemRow key={`rm-${i}`} item={item} index={diff.added.length + i} />
                ))}
                {diff.modified.map((item, i) => (
                  <DiffItemRow key={`mod-${i}`} item={item} index={diff.added.length + diff.removed.length + i} />
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                {hasMoreBackups ? (
                  <>
                    <PressScale
                      onClick={onCancelAll}
                      className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      {t('common.cancelAll')}
                    </PressScale>
                    <PressScale
                      onClick={onSkip}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {t('common.skip')}
                    </PressScale>
                  </>
                ) : (
                  <PressScale
                    onClick={onCancelAll}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    {t('common.cancel')}
                  </PressScale>
                )}
                <PressScale
                  onClick={onConfirm}
                  className={`px-4 py-2 text-white text-sm font-medium rounded-xl transition-colors shadow-lg ${
                    action === 'push'
                      ? 'bg-sky-400 hover:bg-sky-500 shadow-sky-200'
                      : 'bg-emerald-400 hover:bg-emerald-500 shadow-emerald-200'
                  }`}
                >
                  {action === 'push' ? t('popup.confirmUpload') : t('popup.confirmDownload')}
                </PressScale>
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

// 文件夹选择器弹窗
interface FolderPickerModalProps {
  isOpen: boolean
  currentPath: string | null
  onClose: () => void
  onSelect: (path: string | null) => void
}

function FolderPickerModal({ isOpen, currentPath, onClose, onSelect }: FolderPickerModalProps) {
  const { t } = useTranslation()
  const [folders, setFolders] = useState<Array<{ path: string; title: string; depth: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadFolders()
    }
  }, [isOpen])

  async function loadFolders() {
    setLoading(true)
    try {
      const tree = await browser.bookmarks.getTree()
      const result: Array<{ path: string; title: string; depth: number }> = []

      function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string, depth: number) {
        for (const node of nodes) {
          if (!node.url && node.title) {
            const path = `${parentPath}/${node.title}`
            result.push({ path, title: node.title, depth })
            if (node.children) {
              traverse(node.children, path, depth + 1)
            }
          } else if (!node.title && node.children) {
            traverse(node.children, '', depth)
          }
        }
      }

      traverse(tree, '', 0)
      setFolders(result)
    } catch (err) {
      console.error('加载文件夹失败:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <Overlay onClick={onClose} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">{t('dashboard.selectFolder')}</h3>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                  <div className="p-4 text-center text-slate-400">{t('common.loading')}</div>
                ) : (
                  <>
                    <button
                      onClick={() => onSelect(null)}
                      className={`w-full p-3 rounded-lg text-left transition-colors flex items-center gap-3 ${
                        currentPath === null ? 'bg-sky-50 text-sky-700' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <span className="font-medium">{t('dashboard.rootFolder')}</span>
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.path}
                        onClick={() => onSelect(folder.path)}
                        className={`w-full p-3 rounded-lg text-left transition-colors flex items-center gap-3 ${
                          currentPath === folder.path ? 'bg-sky-50 text-sky-700' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                        style={{ paddingLeft: `${12 + folder.depth * 16}px` }}
                      >
                        <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                        <span className="truncate">{folder.title}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

// 差异项行
function DiffItemRow({ item, index }: { item: import('@/lib/bookmark/diff').DiffItem; index: number }) {
  const { t } = useTranslation()
  const bgColor = item.type === 'added' ? 'bg-emerald-50 border-emerald-200' :
                  item.type === 'removed' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
  const textColor = item.type === 'added' ? 'text-emerald-700' :
                    item.type === 'removed' ? 'text-red-700' :
                    'text-amber-700'
  const icon = item.type === 'added' ? '+' : item.type === 'removed' ? '-' : '~'

  function getDisplayTitle(title: string | undefined, url: string | undefined): string {
    if (title) return title
    if (url) {
      try {
        return new URL(url).hostname
      } catch {
        return t('dashboard.noTitle')
      }
    }
    return t('dashboard.noTitle')
  }

  const displayTitle = getDisplayTitle(item.title, item.url)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springPresets.gentle, delay: index * 0.03 }}
      className={`p-3 rounded-lg border ${bgColor}`}
    >
      <div className="flex items-start gap-2">
        <span className={`font-mono font-bold ${textColor}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 truncate">{displayTitle}</span>
            {item.path.length > 0 && (
              <span className="text-xs text-slate-400 truncate">({item.path.join(' / ')})</span>
            )}
          </div>
          {item.url && (
            <div className="text-xs text-slate-500 truncate mt-0.5">{item.url}</div>
          )}
          {item.type === 'modified' && item.oldTitle && (
            <div className="text-xs text-red-400 line-through truncate mt-0.5">{t('dashboard.originalTitle')}: {item.oldTitle || t('dashboard.noTitle')}</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
