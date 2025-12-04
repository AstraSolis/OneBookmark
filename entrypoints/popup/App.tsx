import { useState, useEffect } from 'react'
import { getBackups, getUploadEnabledBackups, getDownloadEnabledBackups, updateBackup, type BackupConfig } from '@/utils/storage'
import { getLocalBookmarks } from '@/lib/bookmark/parser'
import { GistStorage } from '@/lib/storage/gist'
import { SyncEngine, getLockStatus, forceReleaseLock } from '@/lib/sync'
import type { SyncStatus } from '@/lib/bookmark/types'

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
    setMessage('已强制解锁')
    setStatus('idle')
  }

  async function handlePush() {
    setStatus('syncing')
    setMessage('正在上传...')
    setLockInfo(null)

    try {
      const lockStatus = await getLockStatus()
      if (lockStatus.locked) {
        setLockInfo({ locked: true, elapsed: lockStatus.elapsed })
        setStatus('error')
        setMessage('有其他操作正在进行')
        return
      }

      if (uploadBackups.length === 0) throw new Error('没有启用上传的备份')

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
        setMessage(`已上传到 ${successCount} 个备份`)
      } else if (successCount > 0) {
        setStatus('success')
        setMessage(`${successCount} 个成功，${failCount} 个失败`)
      } else throw new Error('所有备份上传失败')
      await loadStatus()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : '上传失败')
    }
  }

  function handlePullClick() {
    if (downloadBackups.length === 0) {
      setStatus('error')
      setMessage('没有启用下载的备份')
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
    setStatus('syncing')
    setMessage('正在下载...')
    setLockInfo(null)

    try {
      const lockStatus = await getLockStatus()
      if (lockStatus.locked) {
        setLockInfo({ locked: true, elapsed: lockStatus.elapsed })
        setStatus('error')
        setMessage('有其他操作正在进行')
        return
      }

      const storage = new GistStorage(backup.token, backup.gistId)
      const engine = new SyncEngine(storage)
      const result = await engine.pull()

      if (result.success) {
        await updateBackup(backup.id, { lastSyncTime: Date.now() })
        setStatus('success')
        setMessage('下载成功')
        await loadStatus()
        setTimeout(() => loadBookmarkStats(), 500)
      } else {
        throw new Error('下载失败')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : '下载失败')
    }
  }

  function openOptions() {
    browser.tabs.create({ url: browser.runtime.getURL('/options.html') })
  }

  const isSyncing = status === 'syncing'
  const uploadCount = uploadBackups.length
  const downloadCount = downloadBackups.length


  return (
    <div className="w-[300px] bg-slate-50 flex flex-col font-sans text-gray-900 relative">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center justify-between bg-white border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src="/icon/48.png" alt="Logo" className="w-7 h-7 rounded" />
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-none">OneBookmark</h1>
            <p className="text-[10px] font-medium text-gray-500 mt-0.5">跨浏览器书签同步</p>
          </div>
        </div>
        <button onClick={openOptions} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md transition-all" title="设置">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col">
        {!hasConfig ? (
          <div className="text-center py-5 bg-white rounded-lg shadow-sm border border-gray-100">
            <div className="w-12 h-12 mx-auto mb-2.5 bg-gray-50 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">欢迎使用</h3>
            <p className="text-xs text-gray-500 mb-3 px-4">请先配置备份以开始同步</p>
            <button onClick={openOptions} className="px-5 py-1.5 bg-sky-400 hover:bg-sky-500 text-white text-xs font-medium rounded-md transition-all shadow-sm active:scale-95">
              前往设置
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-3.5 shadow-sm border border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <span className="text-xs text-gray-500">书签</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{bookmarkCount}</p>
                </div>
                <div className="text-center border-l border-gray-100">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-xs text-gray-500">文件夹</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{folderCount}</p>
                </div>
              </div>
            </div>

            {!isLoading && uploadCount === 0 && downloadCount === 0 && (
              <div className="text-center text-xs text-amber-600 bg-amber-50 rounded-lg py-2 border border-amber-200">
                没有启用的备份，请先在设置中启用
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handlePush} disabled={isSyncing || uploadCount === 0} className="flex items-center justify-center gap-2 py-3 bg-sky-400 text-white rounded-lg shadow-sm hover:bg-sky-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSyncing && message.includes('上传') ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                )}
                <span className="text-sm font-medium">上传</span>
              </button>
              <button onClick={handlePullClick} disabled={isSyncing || downloadCount === 0} className="flex items-center justify-center gap-2 py-3 bg-emerald-400 text-white rounded-lg shadow-sm hover:bg-emerald-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSyncing && message.includes('下载') ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
                <span className="text-sm font-medium">下载</span>
              </button>
            </div>

            <div className="space-y-2">
              {message && (
                <div className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border ${status === 'error' ? 'bg-red-50 text-red-700 border-red-200' : status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                  {status === 'success' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {status === 'error' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                  {message}
                </div>
              )}
              {lastSync && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>上次同步: {lastSync}</span>
                </div>
              )}
              {lockInfo?.locked && (
                <div className="flex items-center justify-between px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs border border-amber-200">
                  <span>操作锁定中 ({Math.round((lockInfo.elapsed || 0) / 1000)}秒)</span>
                  <button onClick={handleForceUnlock} className="px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded text-amber-800 font-medium transition-colors">强制解锁</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 下载选择弹窗 */}
      {showPullSelect && (
        <div className="absolute inset-0 bg-black/50 flex items-end z-50">
          <div className="w-full bg-white rounded-t-2xl animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-medium text-gray-800">选择下载源</span>
              <button onClick={() => setShowPullSelect(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-2 max-h-60 overflow-y-auto">
              {downloadBackups.map((backup) => (
                <button
                  key={backup.id}
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
                      {backup.lastSyncTime ? new Date(backup.lastSyncTime).toLocaleString('zh-CN') : '从未同步'}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
