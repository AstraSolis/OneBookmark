/**
 * 统一错误处理模块
 * 定义错误类型和错误分类函数
 */

// 错误类型
export type ErrorType =
  | 'network'      // 网络连接失败
  | 'auth'         // Token 无效/过期
  | 'notFound'     // Gist 不存在
  | 'rateLimit'    // API 限流
  | 'noData'       // 远端无数据
  | 'permission'   // 权限不足
  | 'folderNotFound' // 本地文件夹不存在
  | 'unknown'      // 未知错误

// Storage sync 配额超出错误
export class StorageQuotaError extends Error {
  constructor() {
    super('storage.sync quota exceeded')
    this.name = 'StorageQuotaError'
  }
}

// 检测浏览器扩展 storage.sync 配额错误（Chrome / Firefox 均适用）
export function isStorageQuotaError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'QuotaExceededError') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /QUOTA_BYTES|MAX_ITEMS|quota exceeded/i.test(msg)
}

// 同步错误类
export class SyncError extends Error {
  type: ErrorType

  constructor(type: ErrorType, message?: string) {
    super(message || getDefaultMessage(type))
    this.type = type
    this.name = 'SyncError'
  }
}

// 获取默认错误消息（用于日志，UI 使用 i18n）
function getDefaultMessage(type: ErrorType): string {
  const messages: Record<ErrorType, string> = {
    network: '网络连接失败',
    auth: 'Token 无效或已过期',
    notFound: 'Gist 不存在',
    rateLimit: 'API 请求过于频繁',
    noData: '远端没有数据',
    permission: '权限不足',
    folderNotFound: '文件夹不存在',
    unknown: '未知错误',
  }
  return messages[type]
}

// 根据 HTTP 状态码分类错误
export function classifyHttpError(status: number, message?: string): SyncError {
  switch (status) {
    case 401:
      return new SyncError('auth', message)
    case 403:
      // 403 可能是权限不足或限流
      if (message?.toLowerCase().includes('rate limit')) {
        return new SyncError('rateLimit', message)
      }
      return new SyncError('permission', message)
    case 404:
      return new SyncError('notFound', message)
    case 429:
      return new SyncError('rateLimit', message)
    default:
      return new SyncError('unknown', message || `HTTP ${status}`)
  }
}

// 根据 fetch 错误分类
export function classifyFetchError(err: unknown): SyncError {
  if (err instanceof SyncError) {
    return err
  }

  if (err instanceof TypeError) {
    // fetch 网络错误通常是 TypeError
    return new SyncError('network', err.message)
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
      return new SyncError('network', err.message)
    }
    return new SyncError('unknown', err.message)
  }

  return new SyncError('unknown', String(err))
}

// 获取错误的 i18n key
export function getErrorI18nKey(type: ErrorType): string {
  return `error.${type}`
}
