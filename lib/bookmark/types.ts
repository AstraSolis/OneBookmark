// 书签节点
export interface BookmarkNode {
  id: string
  title: string
  url?: string
  children?: BookmarkNode[]
  dateAdded?: number
}

// 同步数据
export interface SyncData {
  version: number
  lastSync: number
  bookmarks: BookmarkNode[]
  checksum: string
}

// 同步状态
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

// 错误类型（从 errors.ts 复制，避免循环依赖）
export type ErrorType =
  | 'network'
  | 'auth'
  | 'notFound'
  | 'rateLimit'
  | 'noData'
  | 'permission'
  | 'folderNotFound'
  | 'unknown'

// 同步结果
export type SyncResult =
  | { success: true; changes: number }
  | { success: false; error: string; errorType?: ErrorType }
