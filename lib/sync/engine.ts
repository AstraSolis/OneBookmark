import type { SyncResult, BookmarkNode } from '../bookmark/types'
import type { StorageBackend } from '../storage/interface'
import { getLocalBookmarks, getBookmarksByFolder, createSyncData } from '../bookmark/parser'
import { writeBookmarks, writeBookmarksToFolder } from '../bookmark/writer'
import { withLock } from './lock'
import { SyncError } from '../errors'

// 同步选项
export interface SyncOptions {
  folderPath?: string | null
}

// 同步引擎（仅支持手动上传/下载）
export class SyncEngine {
  private storage: StorageBackend
  private options: SyncOptions

  constructor(storage: StorageBackend, options: SyncOptions = {}) {
    this.storage = storage
    this.options = options
  }

  // 上传本地书签到远端（覆盖模式）
  async push(): Promise<SyncResult> {
    try {
      return await withLock('push', async () => {
        const folderPath = this.options.folderPath
        console.log('[Sync] 开始 Push 操作，文件夹:', folderPath || '根目录')

        const localBookmarks = await getBookmarksByFolder(folderPath || null)
        const syncData = createSyncData(localBookmarks)

        await this.storage.write(syncData)

        console.log('[Sync] Push 完成，书签数:', localBookmarks.length)
        return { success: true as const, changes: countBookmarks(localBookmarks) }
      })
    } catch (err) {
      console.error('[Sync] Push 失败:', err)
      if (err instanceof SyncError) {
        return { success: false as const, error: err.message, errorType: err.type }
      }
      return { success: false as const, error: err instanceof Error ? err.message : '上传失败' }
    }
  }

  // 下载远端书签到本地（覆盖模式）
  async pull(): Promise<SyncResult> {
    try {
      return await withLock('pull', async () => {
        const folderPath = this.options.folderPath
        console.log('[Sync] 开始 Pull 操作，文件夹:', folderPath || '根目录')

        const data = await this.storage.read()

        if (!data) {
          throw new SyncError('noData')
        }

        const count = await writeBookmarksToFolder(data.bookmarks, folderPath || null)

        console.log('[Sync] Pull 完成，变更数:', count)
        return { success: true as const, changes: count }
      })
    } catch (err) {
      console.error('[Sync] Pull 失败:', err)
      if (err instanceof SyncError) {
        return { success: false as const, error: err.message, errorType: err.type }
      }
      return { success: false as const, error: err instanceof Error ? err.message : '下载失败' }
    }
  }
}

// 统计书签数量
function countBookmarks(bookmarks: BookmarkNode[]): number {
  let count = 0
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (node.url) count++
      if (node.children) traverse(node.children)
    }
  }
  traverse(bookmarks)
  return count
}
