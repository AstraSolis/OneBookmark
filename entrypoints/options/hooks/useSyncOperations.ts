import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GistStorage } from '@/lib/storage/gist'
import { SyncEngine, isLocked } from '@/lib/sync'
import { getLocalBookmarks, getBookmarksByFolder } from '@/lib/bookmark/parser'
import { calculateDiff, type DiffResult } from '@/lib/bookmark/diff'
import { getSettings, updateBackup, type BackupConfig } from '@/utils/storage'
import type { BackupWithProfile, SyncingState, PushResults } from '../components/dashboard-components/types'

interface DiffPreviewState {
  showModal: boolean
  result: DiffResult | null
  action: 'push' | 'pull' | null
  pendingPullBackup: BackupWithProfile | null
  pendingPushBackups: BackupConfig[]
  currentPushBackup: BackupConfig | null
  pushResults: PushResults
}

interface Options {
  backups: BackupWithProfile[]
  onReload: () => Promise<void>
  showMessage: (type: 'success' | 'error', text: string) => void
}

export function useSyncOperations({ backups, onReload, showMessage }: Options) {
  const { t } = useTranslation()
  const [batchSyncing, setBatchSyncing] = useState<SyncingState>(null)
  const [diffState, setDiffState] = useState<DiffPreviewState>({
    showModal: false,
    result: null,
    action: null,
    pendingPullBackup: null,
    pendingPushBackups: [],
    currentPushBackup: null,
    pushResults: { items: [], fail: 0 }
  })

  // 从传入的 backups 中筛选启用上传的备份
  const uploadEnabledBackups = useMemo(
    () => backups.filter(b => b.enabled && b.uploadEnabled !== false),
    [backups]
  )

  // 批量上传到所有启用的备份
  const handleBatchPush = useCallback(async () => {
    if (uploadEnabledBackups.length === 0) {
      showMessage('error', t('popup.noUploadBackup'))
      return
    }
    if (await isLocked()) {
      showMessage('error', t('popup.operationLocked'))
      return
    }

    const settings = await getSettings()
    if (settings.diffPreviewEnabled) {
      setDiffState(prev => ({
        ...prev,
        pendingPushBackups: uploadEnabledBackups,
        pushResults: { items: [], fail: 0 }
      }))
      await processNextPushBackup(uploadEnabledBackups, { items: [], fail: 0 })
      return
    }

    await executeBatchPush()
  }, [t, showMessage, uploadEnabledBackups])

  // 处理队列中下一个备份的 diff 预览
  async function processNextPushBackup(
    queue: BackupConfig[],
    results: PushResults
  ) {
    if (queue.length === 0) {
      finishBatchPush(results)
      return
    }

    const [current, ...rest] = queue
    setDiffState(prev => ({
      ...prev,
      pendingPushBackups: rest,
      currentPushBackup: current
    }))

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
          setDiffState(prev => ({
            ...prev,
            result: diff,
            action: 'push',
            pushResults: results,
            showModal: true
          }))
          return
        }
      } catch {
        // 获取差异失败，直接执行上传
      }
    }

    await processNextPushBackup(rest, results)
  }

  // 执行单个备份的上传
  async function executeSinglePush(
    backup: BackupConfig,
    results: PushResults,
    diff?: DiffResult
  ): Promise<PushResults> {
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

  // 完成批量上传
  async function finishBatchPush(results: PushResults) {
    setDiffState(prev => ({
      ...prev,
      currentPushBackup: null,
      pendingPushBackups: [],
      pushResults: { items: [], fail: 0 }
    }))
    await onReload()

    if (results.items.length === 0 && results.fail === 0) {
      showMessage('success', t('popup.uploadSuccessNoChanges'))
    } else if (results.fail === 0) {
      const text = results.items.map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed })).join('\n')
      showMessage('success', text)
    } else if (results.items.length === 0) {
      showMessage('error', t('popup.uploadFailed'))
    } else {
      showMessage('error', t('popup.partialSuccess', { success: results.items.length, fail: results.fail }))
    }
  }

  // 执行批量上传（差异预览未启用时）
  async function executeBatchPush() {
    setBatchSyncing('push')
    const results: { name: string; added: number; removed: number }[] = []
    let failCount = 0

    for (const backup of uploadEnabledBackups) {
      try {
        const storage = new GistStorage(backup.token, backup.gistId)
        let added = 0, removed = 0
        if (backup.gistId) {
          try {
            const remoteData = await storage.read()
            const folderPath = backup.folderPath
            const localBookmarks = folderPath
              ? await getBookmarksByFolder(folderPath)
              : await getLocalBookmarks()
            const remoteBookmarks = remoteData?.bookmarks || []
            const diff = calculateDiff(remoteBookmarks, localBookmarks, { skipRootPath: !!folderPath })
            if (!diff.hasChanges) continue
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
    await onReload()
    if (results.length === 0 && failCount === 0) {
      showMessage('success', t('popup.uploadSuccessNoChanges'))
    } else if (failCount === 0) {
      const text = results.map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed })).join('\n')
      showMessage('success', text)
    } else if (results.length > 0) {
      showMessage('error', t('popup.partialSuccess', { success: results.length, fail: failCount }))
    } else {
      showMessage('error', t('popup.uploadFailed'))
    }
  }

  // 从指定备份下载
  const handlePullFromBackup = useCallback(async (backup: BackupWithProfile) => {
    if (await isLocked()) {
      showMessage('error', t('popup.operationLocked'))
      return
    }

    const settings = await getSettings()
    if (settings.diffPreviewEnabled && backup.gistId) {
      try {
        const storage = new GistStorage(backup.token, backup.gistId)
        const remoteData = await storage.read()
        if (remoteData) {
          const folderPath = backup.folderPath
          const localBookmarks = folderPath
            ? await getBookmarksByFolder(folderPath)
            : await getLocalBookmarks()
          const diff = calculateDiff(localBookmarks, remoteData.bookmarks, { skipRootPath: !!folderPath })
          if (diff.hasChanges) {
            setDiffState(prev => ({
              ...prev,
              result: diff,
              action: 'pull',
              pendingPullBackup: backup,
              showModal: true
            }))
            return
          }
        }
      } catch {
        // 获取差异失败，继续执行下载
      }
    }

    await executePullFromBackup(backup)
  }, [t, showMessage])

  // 执行下载
  async function executePullFromBackup(backup: BackupWithProfile) {
    setBatchSyncing('pull')

    try {
      const storage = new GistStorage(backup.token, backup.gistId)
      const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
      const result = await engine.pull()
      if (result.success) {
        await updateBackup(backup.id, { lastSyncTime: Date.now() })
        showMessage('success', t('popup.downloadSuccess'))
      } else {
        showMessage('error', t('popup.downloadFailed'))
      }
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : t('popup.downloadFailed'))
    }

    setBatchSyncing(null)
    await onReload()
  }

  // 差异预览确认
  const handleDiffConfirm = useCallback(async () => {
    setDiffState(prev => ({ ...prev, showModal: false }))
    const currentDiff = diffState.result

    if (diffState.action === 'push' && diffState.currentPushBackup) {
      const newResults = await executeSinglePush(diffState.currentPushBackup, diffState.pushResults, currentDiff || undefined)
      setDiffState(prev => ({ ...prev, result: null, action: null }))
      await processNextPushBackup(diffState.pendingPushBackups, newResults)
    } else if (diffState.action === 'pull' && diffState.pendingPullBackup) {
      await executePullFromBackup(diffState.pendingPullBackup)
      setDiffState(prev => ({ ...prev, result: null, action: null, pendingPullBackup: null }))
    }
  }, [diffState])

  // 差异预览取消（跳过当前备份）
  const handleDiffCancel = useCallback(async () => {
    setDiffState(prev => ({ ...prev, showModal: false, result: null }))

    if (diffState.action === 'push' && diffState.currentPushBackup) {
      setDiffState(prev => ({ ...prev, action: null }))
      await processNextPushBackup(diffState.pendingPushBackups, diffState.pushResults)
      return
    }

    setDiffState(prev => ({ ...prev, action: null, pendingPullBackup: null }))
  }, [diffState])

  // 取消整个批量上传操作
  const handleCancelAllPush = useCallback(() => {
    setDiffState(prev => {
      if (prev.pushResults.items.length > 0 || prev.pushResults.fail > 0) {
        onReload()
        if (prev.pushResults.fail === 0 && prev.pushResults.items.length > 0) {
          const text = prev.pushResults.items.map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed })).join('\n')
          showMessage('success', text)
        } else if (prev.pushResults.items.length > 0) {
          showMessage('error', t('popup.partialSuccess', { success: prev.pushResults.items.length, fail: prev.pushResults.fail }))
        }
      }
      return {
        showModal: false,
        result: null,
        action: null,
        pendingPullBackup: null,
        pendingPushBackups: [],
        currentPushBackup: null,
        pushResults: { items: [], fail: 0 }
      }
    })
  }, [t, showMessage, onReload])

  return {
    batchSyncing,
    diffState,
    handleBatchPush,
    handlePullFromBackup,
    handleDiffConfirm,
    handleDiffCancel,
    handleCancelAllPush
  }
}
