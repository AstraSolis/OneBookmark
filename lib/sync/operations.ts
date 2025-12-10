/**
 * 统一的同步操作函数
 * 集中处理 push/pull 逻辑，避免代码重复
 */

import type { BookmarkNode } from '../bookmark/types'
import type { DiffResult } from '../bookmark/diff'
import type { BackupConfig } from '@/utils/storage'
import { GistStorage } from '../storage/gist'
import { SyncEngine } from './engine'
import { getLocalBookmarks, getBookmarksByFolder } from '../bookmark/parser'
import { calculateDiff } from '../bookmark/diff'
import { updateBackup } from '@/utils/storage'

// Push 操作结果
export interface PushResult {
  success: boolean
  error?: string
  diff?: { added: number; removed: number }
  newGistId?: string
}

// Pull 操作结果
export interface PullResult {
  success: boolean
  error?: string
  changes?: number
}

// 获取备份对应的本地书签
export async function getBookmarksForBackup(backup: BackupConfig): Promise<BookmarkNode[]> {
  return backup.folderPath
    ? await getBookmarksByFolder(backup.folderPath)
    : await getLocalBookmarks()
}

// 计算同步差异
export async function calculateSyncDiff(
  backup: BackupConfig,
  direction: 'push' | 'pull'
): Promise<DiffResult | null> {
  if (!backup.gistId) return null

  try {
    const storage = new GistStorage(backup.token, backup.gistId)
    const remoteData = await storage.read()
    if (!remoteData) return null

    const localBookmarks = await getBookmarksForBackup(backup)
    const skipRootPath = !!backup.folderPath

    // push: 远端 → 本地 (本地覆盖远端)
    // pull: 本地 → 远端 (远端覆盖本地)
    return direction === 'push'
      ? calculateDiff(remoteData.bookmarks, localBookmarks, { skipRootPath })
      : calculateDiff(localBookmarks, remoteData.bookmarks, { skipRootPath })
  } catch {
    return null
  }
}


// 执行 Push 操作
export async function pushBookmarks(backup: BackupConfig): Promise<PushResult> {
  try {
    const storage = new GistStorage(backup.token, backup.gistId)

    // 计算 diff（如果有远端数据）
    let diff: { added: number; removed: number } | undefined
    if (backup.gistId) {
      try {
        const remoteData = await storage.read()
        const localBookmarks = await getBookmarksForBackup(backup)
        const remoteBookmarks = remoteData?.bookmarks || []
        const diffResult = calculateDiff(remoteBookmarks, localBookmarks, {
          skipRootPath: !!backup.folderPath
        })

        if (!diffResult.hasChanges) {
          return { success: true, diff: { added: 0, removed: 0 } }
        }
        diff = { added: diffResult.added.length, removed: diffResult.removed.length }
      } catch {
        // diff 计算失败，继续执行 push
      }
    }

    const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
    const result = await engine.push()

    if (result.success) {
      const newGistId = storage.getGistId()
      const updates: Partial<BackupConfig> = { lastSyncTime: Date.now() }
      if (newGistId && newGistId !== backup.gistId) {
        updates.gistId = newGistId
      }
      await updateBackup(backup.id, updates)

      return { success: true, diff, newGistId: updates.gistId ?? undefined }
    }

    return { success: false, error: result.error }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '上传失败' }
  }
}

// 执行 Pull 操作
export async function pullBookmarks(backup: BackupConfig): Promise<PullResult> {
  try {
    const storage = new GistStorage(backup.token, backup.gistId)
    const engine = new SyncEngine(storage, { folderPath: backup.folderPath })
    const result = await engine.pull()

    if (result.success) {
      await updateBackup(backup.id, { lastSyncTime: Date.now() })
      return { success: true, changes: result.changes }
    }

    return { success: false, error: result.error }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '下载失败' }
  }
}
