import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isLocked, pushBookmarks, pullBookmarks, calculateSyncDiff, getErrorI18nKey, type ErrorType } from '@/lib/sync'
import { getSettings, type BackupConfig } from '@/utils/storage'
import type { DiffResult } from '@/lib/bookmark/diff'
import type { BackupWithProfile, SyncingState, PushResults } from '../components/dashboard-components/types'

// 根据错误类型获取 i18n 消息
function getErrorMessage(t: (key: string) => string, errorType?: ErrorType, fallbackKey?: string): string {
  if (errorType) {
    return t(getErrorI18nKey(errorType))
  }
  return t(fallbackKey || 'error.unknown')
}

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

const INITIAL_DIFF_STATE: DiffPreviewState = {
  showModal: false,
  result: null,
  action: null,
  pendingPullBackup: null,
  pendingPushBackups: [],
  currentPushBackup: null,
  pushResults: { items: [], fail: 0, lastErrorType: undefined }
}

export function useSyncOperations({ backups, onReload, showMessage }: Options) {
  const { t } = useTranslation()
  const [batchSyncing, setBatchSyncing] = useState<SyncingState>(null)
  const [diffState, setDiffState] = useState<DiffPreviewState>(INITIAL_DIFF_STATE)

  const uploadEnabledBackups = useMemo(
    () => backups.filter(b => b.enabled && b.uploadEnabled !== false),
    [backups]
  )

  // 处理队列中下一个备份的 diff 预览
  const processNextPushBackup = useCallback(async (
    queue: BackupConfig[],
    results: PushResults
  ) => {
    if (queue.length === 0) {
      await finishBatchPush(results)
      return
    }

    const [current, ...rest] = queue
    setDiffState(prev => ({
      ...prev,
      pendingPushBackups: rest,
      currentPushBackup: current
    }))

    const diff = await calculateSyncDiff(current, 'push')
    if (diff?.hasChanges) {
      setDiffState(prev => ({
        ...prev,
        result: diff,
        action: 'push',
        pushResults: results,
        showModal: true
      }))
      return
    }

    await processNextPushBackup(rest, results)
  }, [])


  // 执行单个备份的上传
  const executeSinglePush = useCallback(async (
    backup: BackupConfig,
    results: PushResults,
    diff?: DiffResult
  ): Promise<PushResults> => {
    setBatchSyncing('push')
    const result = await pushBookmarks(backup)
    setBatchSyncing(null)

    if (result.success) {
      return {
        items: [...results.items, {
          name: backup.name,
          added: diff?.added.length || result.diff?.added || 0,
          removed: diff?.removed.length || result.diff?.removed || 0
        }],
        fail: results.fail,
        lastErrorType: results.lastErrorType
      }
    }
    return {
      ...results,
      fail: results.fail + 1,
      lastErrorType: result.errorType || results.lastErrorType
    }
  }, [])

  // 完成批量上传
  const finishBatchPush = useCallback(async (results: PushResults) => {
    setDiffState(prev => ({
      ...prev,
      currentPushBackup: null,
      pendingPushBackups: [],
      pushResults: { items: [], fail: 0, lastErrorType: undefined }
    }))
    await onReload()

    if (results.items.length === 0 && results.fail === 0) {
      showMessage('success', t('popup.uploadSuccessNoChanges'))
    } else if (results.fail === 0) {
      const text = results.items
        .map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed }))
        .join('\n')
      showMessage('success', text)
    } else if (results.items.length === 0) {
      showMessage('error', getErrorMessage(t, results.lastErrorType, 'popup.uploadFailed'))
    } else {
      showMessage('error', t('popup.partialSuccess', { success: results.items.length, fail: results.fail }))
    }
  }, [t, showMessage, onReload])

  // 执行批量上传（差异预览未启用时）
  const executeBatchPush = useCallback(async () => {
    setBatchSyncing('push')
    const results: { name: string; added: number; removed: number }[] = []
    let failCount = 0
    let lastErrorType: ErrorType | undefined

    for (const backup of uploadEnabledBackups) {
      const result = await pushBookmarks(backup)
      if (result.success) {
        if (result.diff && (result.diff.added > 0 || result.diff.removed > 0)) {
          results.push({ name: backup.name, added: result.diff.added, removed: result.diff.removed })
        }
      } else {
        failCount++
        lastErrorType = result.errorType
      }
    }

    setBatchSyncing(null)
    await onReload()

    if (results.length === 0 && failCount === 0) {
      showMessage('success', t('popup.uploadSuccessNoChanges'))
    } else if (failCount === 0) {
      const text = results
        .map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed }))
        .join('\n')
      showMessage('success', text)
    } else if (results.length > 0) {
      showMessage('error', t('popup.partialSuccess', { success: results.length, fail: failCount }))
    } else {
      showMessage('error', getErrorMessage(t, lastErrorType, 'popup.uploadFailed'))
    }
  }, [uploadEnabledBackups, t, showMessage, onReload])


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
        pushResults: { items: [], fail: 0, lastErrorType: undefined }
      }))
      await processNextPushBackup(uploadEnabledBackups, { items: [], fail: 0, lastErrorType: undefined })
      return
    }

    await executeBatchPush()
  }, [t, showMessage, uploadEnabledBackups, processNextPushBackup, executeBatchPush])

  // 执行下载
  const executePullFromBackup = useCallback(async (backup: BackupWithProfile) => {
    setBatchSyncing('pull')

    const result = await pullBookmarks(backup)
    if (result.success) {
      showMessage('success', t('popup.downloadSuccess'))
    } else {
      showMessage('error', getErrorMessage(t, result.errorType, 'popup.downloadFailed'))
    }

    setBatchSyncing(null)
    await onReload()
  }, [t, showMessage, onReload])

  // 上传到指定备份
  const handlePushToBackup = useCallback(async (backup: BackupWithProfile) => {
    if (await isLocked()) {
      showMessage('error', t('popup.operationLocked'))
      return
    }

    const settings = await getSettings()
    if (settings.diffPreviewEnabled) {
      const diff = await calculateSyncDiff(backup, 'push')
      if (diff?.hasChanges) {
        setDiffState(prev => ({
          ...prev,
          result: diff,
          action: 'push',
          currentPushBackup: backup,
          pendingPushBackups: [],
          pushResults: { items: [], fail: 0, lastErrorType: undefined },
          showModal: true
        }))
        return
      }
    }

    setBatchSyncing('push')
    const result = await pushBookmarks(backup)
    if (result.success) {
      const { added = 0, removed = 0 } = result.diff || {}
      if (added === 0 && removed === 0) {
        showMessage('success', t('popup.uploadSuccessNoChanges'))
      } else {
        showMessage('success', t('popup.uploadSuccess', { name: backup.name, added, removed }))
      }
    } else {
      showMessage('error', getErrorMessage(t, result.errorType, 'popup.uploadFailed'))
    }
    setBatchSyncing(null)
    await onReload()
  }, [t, showMessage, onReload])

  // 从指定备份下载
  const handlePullFromBackup = useCallback(async (backup: BackupWithProfile) => {
    if (await isLocked()) {
      showMessage('error', t('popup.operationLocked'))
      return
    }

    const settings = await getSettings()
    if (settings.diffPreviewEnabled && backup.gistId) {
      const diff = await calculateSyncDiff(backup, 'pull')
      if (diff?.hasChanges) {
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

    await executePullFromBackup(backup)
  }, [t, showMessage, executePullFromBackup])

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
  }, [diffState, executeSinglePush, processNextPushBackup, executePullFromBackup])

  // 差异预览取消（跳过当前备份）
  const handleDiffCancel = useCallback(async () => {
    setDiffState(prev => ({ ...prev, showModal: false, result: null }))

    if (diffState.action === 'push' && diffState.currentPushBackup) {
      setDiffState(prev => ({ ...prev, action: null }))
      await processNextPushBackup(diffState.pendingPushBackups, diffState.pushResults)
      return
    }

    setDiffState(prev => ({ ...prev, action: null, pendingPullBackup: null }))
  }, [diffState, processNextPushBackup])

  // 取消整个批量上传操作
  const handleCancelAllPush = useCallback(() => {
    setDiffState(prev => {
      if (prev.pushResults.items.length > 0 || prev.pushResults.fail > 0) {
        onReload()
        if (prev.pushResults.fail === 0 && prev.pushResults.items.length > 0) {
          const text = prev.pushResults.items
            .map(item => t('popup.uploadSuccess', { name: item.name, added: item.added, removed: item.removed }))
            .join('\n')
          showMessage('success', text)
        } else if (prev.pushResults.items.length > 0) {
          showMessage('error', t('popup.partialSuccess', { success: prev.pushResults.items.length, fail: prev.pushResults.fail }))
        }
      }
      return INITIAL_DIFF_STATE
    })
  }, [t, showMessage, onReload])

  return {
    batchSyncing,
    diffState,
    handleBatchPush,
    handlePushToBackup,
    handlePullFromBackup,
    handleDiffConfirm,
    handleDiffCancel,
    handleCancelAllPush
  }
}
