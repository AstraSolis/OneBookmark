import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getBackups, getUploadEnabledBackups, getDownloadEnabledBackups, updateBackup, getSettings, type BackupConfig } from '@/utils/storage'
import { getLocalBookmarks } from '@/lib/bookmark/parser'
import { GistStorage } from '@/lib/storage/gist'
import { SyncEngine, getLockStatus, forceReleaseLock } from '@/lib/sync'
import { calculateDiff, type DiffResult } from '@/lib/bookmark/diff'
import type { SyncStatus } from '@/lib/bookmark/types'
import { motion, AnimatePresence, PressScale, springPresets, CheckIcon, CrossIcon, BottomSheet } from '@/lib/motion'

interface BackupWithProfile extends BackupConfig {
  username?: string
  avatarUrl?: string
}

function App() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState(false)
  const [uploadBackups, setUploadBackups] = useState<BackupWithProfile[]>([])
  const [downloadBackups, setDownloadBackups] = useState<BackupWithProfile[]>([])
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [folderCount, setFolderCount] = useState(0)
  const [lockInfo, setLockInfo] = useState<{ locked: boolean; elapsed?: number } | null>(null)
  const [showPullSelect, setShowPullSelect] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  // 差异预览相关状态
  const [showDiffPreview, setShowDiffPreview] = useState(false)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffAction, setDiffAction] = useState<'push' | 'pull' | null>(null)
  const [pendingPullBackup, setPendingPullBackup] = useState<BackupWithProfile | null>(null)

  useEffect(() => {
    loadStatus().finally(() => setIsLoading(false))
    loadBookmarkStats()
  }, [])

  async function loadBookmarkStats() {
    try {
      const bookmarks = await getLocalBookmarks()
      let urls = 0, folders = 0
      function count(items: typeof bookmarks, depth = 0) {
        for (const item of items) {
          if (item.url) urls++
          else if (item.children) {
            if (depth >= 2) folders++
            count(item.children, depth + 1)
          }
        }
      }
      count(bookmarks, 0)
      setBookmarkCount(urls)
      setFolderCount(folders)
    } catch { /* ignore */ }
  }

  async function loadStatus() {
    const backups = await getBackups()
    setHasConfig(backups.length > 0)
    
    const uploadEnabled = await getUploadEnabledBackups()
    const downloadEnabled = await getDownloadEnabledBackups()
    
    // 加载启用备份的 profile
    async function loadProfiles(list: BackupConfig[]): Promise<BackupWithProfile[]> {
      return Promise.all(
        list.map(async (backup) => {
          try {
            const storage = new GistStorage(backup.token, backup.gistId)
            const profile = await storage.getUserProfile()
            return { ...backup, username: profile?.name, avatarUrl: profile?.avatar_url }
          } catch { return backup }
        })
      )
    }
    
    setUploadBackups(await loadProfiles(uploadEnabled))
    setDownloadBackups(await loadProfiles(downloadEnabled))
    
    const allEnabled = backups.filter(b => b.enabled)
    const lastSyncTimes = allEnabled.map(b => b.lastSyncTime).filter((t): t is number => t !== null)
    if (lastSyncTimes.length > 0) {
      setLastSync(new Date(Math.max(...lastSyncTimes)).toLocaleString())
    }
  }

  async function handleForceUnlock() {
    await forceReleaseLock()
    setLockInfo(null)
    setMessage(t('popup.unlocked'))
    setStatus('idle')
  }

  async function handlePush() {
    if (uploadBackups.length === 0) {
      setStatus('error')
      setMessage(t('popup.noUploadBackup'))
      return
    }

    const lockStatus = await getLockStatus()
    if (lockStatus.locked) {
      setLockInfo({ locked: true, elapsed: lockStatus.elapsed })
      setStatus('error')
      setMessage(t('popup.operationLocked'))
      return
    }

    // 检查是否启用差异预览
    const settings = await getSettings()
    if (settings.diffPreviewEnabled && uploadBackups[0].gistId) {
      try {
        const storage = new GistStorage(uploadBackups[0].token, uploadBackups[0].gistId)
        const remoteData = await storage.read()
        const localBookmarks = await getLocalBookmarks()
        const remoteBookmarks = remoteData?.bookmarks || []
        const diff = calculateDiff(remoteBookmarks, localBookmarks)
        if (diff.hasChanges) {
          setDiffResult(diff)
          setDiffAction('push')
          setShowDiffPreview(true)
          return
        }
      } catch { /* 获取差异失败，继续执行 */ }
    }

    await executePush()
  }

  async function executePush() {
    setStatus('syncing')
    setMessage(t('popup.uploading'))
    setLockInfo(null)

    try {
      let successCount = 0, failCount = 0
      for (const backup of uploadBackups) {
        try {
          const storage = new GistStorage(backup.token, backup.gistId)
          const engine = new SyncEngine(storage)
          const result = await engine.push()
          if (result.success) {
            const gistId = storage.getGistId()
            await updateBackup(backup.id, { gistId: gistId !== backup.gistId ? gistId : backup.gistId, lastSyncTime: Date.now() })
            successCount++
          } else failCount++
        } catch { failCount++ }
      }

      if (failCount === 0) {
        setStatus('success')
        setMessage(t('popup.uploadSuccess', { count: successCount }))
      } else if (successCount > 0) {
        setStatus('success')
        setMessage(t('popup.partialSuccess', { success: successCount, fail: failCount }))
      } else throw new Error(t('popup.allUploadFailed'))
      await loadStatus()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : t('popup.uploadFailed'))
    }
  }

  function handlePullClick() {
    if (downloadBackups.length === 0) {
      setStatus('error')
      setMessage(t('popup.noDownloadBackup'))
      return
    }
    if (downloadBackups.length === 1) {
      handlePullFromBackup(downloadBackups[0])
    } else {
      setShowPullSelect(true)
    }
  }

  async function handlePullFromBackup(backup: BackupWithProfile) {
    setShowPullSelect(false)

    const lockStatus = await getLockStatus()
    if (lockStatus.locked) {
      setLockInfo({ locked: true, elapsed: lockStatus.elapsed })
      setStatus('error')
      setMessage(t('popup.operationLocked'))
      return
    }

    // 检查是否启用差异预览
    const settings = await getSettings()
    if (settings.diffPreviewEnabled && backup.gistId) {
      try {
        const storage = new GistStorage(backup.token, backup.gistId)
        const remoteData = await storage.read()
        if (remoteData) {
          const localBookmarks = await getLocalBookmarks()
          const diff = calculateDiff(localBookmarks, remoteData.bookmarks)
          if (diff.hasChanges) {
            setDiffResult(diff)
            setDiffAction('pull')
            setPendingPullBackup(backup)
            setShowDiffPreview(true)
            return
          }
        }
      } catch { /* 获取差异失败，继续执行 */ }
    }

    await executePullFromBackup(backup)
  }

  async function executePullFromBackup(backup: BackupWithProfile) {
    setStatus('syncing')
    setMessage(t('popup.downloading'))
    setLockInfo(null)

    try {
      const storage = new GistStorage(backup.token, backup.gistId)
      const engine = new SyncEngine(storage)
      const result = await engine.pull()

      if (result.success) {
        await updateBackup(backup.id, { lastSyncTime: Date.now() })
        setStatus('success')
        setMessage(t('popup.downloadSuccess'))
        await loadStatus()
        setTimeout(() => loadBookmarkStats(), 500)
      } else {
        throw new Error(t('popup.downloadFailed'))
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : t('popup.downloadFailed'))
    }
  }

  // 差异预览确认
  async function handleDiffConfirm() {
    setShowDiffPreview(false)
    setDiffResult(null)

    if (diffAction === 'push') {
      await executePush()
    } else if (diffAction === 'pull' && pendingPullBackup) {
      await executePullFromBackup(pendingPullBackup)
    }

    setDiffAction(null)
    setPendingPullBackup(null)
  }

  // 差异预览取消
  function handleDiffCancel() {
    setShowDiffPreview(false)
    setDiffResult(null)
    setDiffAction(null)
    setPendingPullBackup(null)
  }

  function openOptions() {
    browser.tabs.create({ url: browser.runtime.getURL('/options.html') })
  }

  const { t } = useTranslation()
  const isSyncing = status === 'syncing'
  const uploadCount = uploadBackups.length
  const downloadCount = downloadBackups.length


  return (
    <div className="w-[254px] bg-slate-50 flex flex-col font-sans text-gray-900 relative">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src="/icon/48.png" alt="Logo" className="w-7 h-7 rounded" />
          <span className="text-base font-semibold text-gray-800">{t('common.appName')}</span>
        </div>
        <motion.button
          onClick={openOptions}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
          title={t('common.settings')}
          whileHover={{ rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={springPresets.snappy}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </motion.button>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col">
        {!hasConfig ? (
          <div className="text-center py-5">
            <p className="text-xs text-gray-500 mb-3">{t('popup.configFirst')}</p>
            <button onClick={openOptions} className="px-5 py-1.5 bg-sky-400 hover:bg-sky-500 text-white text-xs font-medium rounded-md transition-all active:scale-95">
              {t('popup.goSettings')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {!isLoading && uploadCount === 0 && downloadCount === 0 && (
              <div className="text-center text-xs text-amber-600 bg-amber-50 rounded-lg py-2 border border-amber-200 mb-3">
                {t('popup.noEnabledBackup')}
              </div>
            )}

            {/* 按钮区域 */}
            <div className="flex justify-center gap-3 mb-3">
              <PressScale 
                onClick={handlePush} 
                disabled={isSyncing || uploadCount === 0} 
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sky-400 text-white text-sm font-medium rounded-xl hover:bg-sky-500 transition-colors shadow-lg shadow-sky-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing && message.includes(t('popup.uploading')) ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                )}
                {t('popup.upload')}
              </PressScale>

              <PressScale 
                onClick={handlePullClick} 
                disabled={isSyncing || downloadCount === 0} 
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-400 text-white text-sm font-medium rounded-xl hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing && message.includes(t('popup.downloading')) ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
                {t('popup.download')}
              </PressScale>
            </div>

            {/* 状态消息 */}
            <AnimatePresence>
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={springPresets.snappy}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium mb-2 ${status === 'error' ? 'bg-red-50 text-red-600' : status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}
                >
                  {status === 'success' && <CheckIcon className="w-3.5 h-3.5" />}
                  {status === 'error' && <CrossIcon className="w-3.5 h-3.5" />}
                  {message}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 锁定提示 */}
            {lockInfo?.locked && (
              <div className="flex items-center justify-between px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs mb-2">
                <span>{t('popup.lockDuration', { seconds: Math.round((lockInfo.elapsed || 0) / 1000) })}</span>
                <button onClick={handleForceUnlock} className="px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded text-amber-800 font-medium transition-colors">{t('popup.forceUnlock')}</button>
              </div>
            )}

            {/* 统计和同步时间 */}
            <div className="text-center text-[11px] text-gray-400 space-y-0.5">
              <div>{bookmarkCount} {t('popup.bookmarks')} · {folderCount} {t('popup.folders')}</div>
              {lastSync && <div>{t('popup.lastSync')}: {lastSync}</div>}
            </div>
          </div>
        )}
      </div>

      {/* 差异预览弹窗 */}
      <BottomSheet isOpen={showDiffPreview && !!diffResult} onClose={handleDiffCancel} className="flex flex-col max-h-[85%]">
        {diffResult && (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <span className="font-medium text-gray-800">{diffAction === 'push' ? t('popup.confirmUpload') : t('popup.confirmDownload')}</span>
                <p className="text-[10px] text-gray-400">{diffAction === 'push' ? t('popup.uploadOverwrite') : t('popup.downloadOverwrite')}</p>
              </div>
              <button onClick={handleDiffCancel} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-[10px]">
              <span className="text-gray-500">{t('popup.totalChanges', { count: diffResult.added.length + diffResult.removed.length + diffResult.modified.length })}:</span>
              {diffResult.added.length > 0 && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">+{diffResult.added.length}</span>}
              {diffResult.removed.length > 0 && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">-{diffResult.removed.length}</span>}
              {diffResult.modified.length > 0 && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">~{diffResult.modified.length}</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-48">
              {[...diffResult.added, ...diffResult.removed, ...diffResult.modified].map((item, i) => {
                const displayTitle = item.title || (item.url ? new URL(item.url).hostname : t('dashboard.noTitle'))
                return (
                  <div key={i} className={`p-2 rounded-lg text-xs ${
                    item.type === 'added' ? 'bg-emerald-50 border border-emerald-200' :
                    item.type === 'removed' ? 'bg-red-50 border border-red-200' :
                    'bg-amber-50 border border-amber-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-bold ${
                        item.type === 'added' ? 'text-emerald-600' :
                        item.type === 'removed' ? 'text-red-600' : 'text-amber-600'
                      }`}>{item.type === 'added' ? '+' : item.type === 'removed' ? '-' : '~'}</span>
                      <span className="font-medium text-gray-800 truncate">{displayTitle}</span>
                    </div>
                    {item.url && <div className="text-[10px] text-gray-500 truncate mt-0.5 pl-4">{item.url}</div>}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 p-3 border-t border-gray-100">
              <PressScale onClick={handleDiffCancel} className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">{t('common.cancel')}</PressScale>
              <PressScale onClick={handleDiffConfirm} className={`flex-1 py-2 text-sm text-white rounded-lg transition-colors ${
                diffAction === 'push' ? 'bg-sky-400 hover:bg-sky-500' : 'bg-emerald-400 hover:bg-emerald-500'
              }`}>{diffAction === 'push' ? t('popup.confirmUpload') : t('popup.confirmDownload')}</PressScale>
            </div>
          </>
        )}
      </BottomSheet>

      {/* 下载选择弹窗 */}
      <BottomSheet isOpen={showPullSelect} onClose={() => setShowPullSelect(false)}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-medium text-gray-800">{t('popup.selectSource')}</span>
          <button onClick={() => setShowPullSelect(false)} className="p-1 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-2 max-h-60 overflow-y-auto">
          {downloadBackups.map((backup, index) => (
            <motion.button
              key={backup.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springPresets.gentle, delay: index * 0.05 }}
              onClick={() => handlePullFromBackup(backup)}
              className="w-full p-3 hover:bg-gray-50 rounded-lg text-left flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-sky-100 flex-shrink-0">
                {backup.avatarUrl ? (
                  <img src={backup.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sky-500 font-bold text-sm">G</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{backup.name}</div>
                <div className="text-[10px] text-gray-400">
                  {backup.lastSyncTime ? new Date(backup.lastSyncTime).toLocaleString() : t('popup.neverSynced')}
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </motion.button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}

export default App
