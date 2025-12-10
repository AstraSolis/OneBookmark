import type { BackupConfig } from '@/utils/storage'
import type { DiffResult } from '@/lib/bookmark/diff'

// 带 profile 信息的备份配置
export interface BackupWithProfile extends BackupConfig {
  username?: string
  avatarUrl?: string
  gistUrl?: string
}

// Dashboard 组件 props
export interface DashboardProps {
  initialAction?: { action?: 'push' | 'pull'; backupId?: string }
  onActionHandled?: () => void
}

// 同步操作状态
export type SyncingState = 'push' | 'pull' | null

// 批量上传结果
export interface PushResults {
  items: { name: string; added: number; removed: number }[]
  fail: number
}

// 差异预览状态
export interface DiffPreviewState {
  showModal: boolean
  result: DiffResult | null
  action: 'push' | 'pull' | null
  pendingPullBackup: BackupWithProfile | null
  pendingPushBackups: BackupConfig[]
  currentPushBackup: BackupConfig | null
  pushResults: PushResults
}

// 备份表单数据
export interface BackupFormData {
  name: string
  token: string
  gistId: string
  folderPath: string | null
}
