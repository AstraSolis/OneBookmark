// 单个备份配置
export interface BackupConfig {
  id: string
  name: string
  enabled: boolean
  uploadEnabled: boolean
  downloadEnabled: boolean
  type: 'gist'
  token: string
  gistId: string | null
  lastSyncTime: number | null
}

const CONFIG_KEY = 'onebookmark_backups'
const SETTINGS_KEY = 'onebookmark_settings'

// 应用设置
export interface AppSettings {
  diffPreviewEnabled: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  diffPreviewEnabled: false
}

// 获取设置
export async function getSettings(): Promise<AppSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] }
}

// 更新设置
export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, ...updates } })
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// 获取所有备份
export async function getBackups(): Promise<BackupConfig[]> {
  const result = await browser.storage.local.get(CONFIG_KEY)
  return result[CONFIG_KEY] || []
}

// 保存所有备份
async function saveBackups(backups: BackupConfig[]): Promise<void> {
  await browser.storage.local.set({ [CONFIG_KEY]: backups })
}

// 获取启用的备份
export async function getEnabledBackups(): Promise<BackupConfig[]> {
  const backups = await getBackups()
  return backups.filter(b => b.enabled)
}

// 获取启用上传的备份
export async function getUploadEnabledBackups(): Promise<BackupConfig[]> {
  const backups = await getBackups()
  return backups.filter(b => b.enabled && b.uploadEnabled !== false)
}

// 获取启用下载的备份
export async function getDownloadEnabledBackups(): Promise<BackupConfig[]> {
  const backups = await getBackups()
  return backups.filter(b => b.enabled && b.downloadEnabled !== false)
}

// 添加备份
export async function addBackup(backup: Omit<BackupConfig, 'id'>): Promise<BackupConfig> {
  const backups = await getBackups()
  const newBackup: BackupConfig = { ...backup, id: generateId() }
  backups.push(newBackup)
  await saveBackups(backups)
  return newBackup
}

// 更新备份
export async function updateBackup(id: string, updates: Partial<Omit<BackupConfig, 'id'>>): Promise<void> {
  const backups = await getBackups()
  const index = backups.findIndex(b => b.id === id)
  if (index !== -1) {
    backups[index] = { ...backups[index], ...updates }
    await saveBackups(backups)
  }
}

// 删除备份
export async function deleteBackup(id: string): Promise<void> {
  const backups = await getBackups()
  await saveBackups(backups.filter(b => b.id !== id))
}

// 切换备份启用状态
export async function toggleBackup(id: string): Promise<void> {
  const backups = await getBackups()
  const backup = backups.find(b => b.id === id)
  if (backup) {
    backup.enabled = !backup.enabled
    await saveBackups(backups)
  }
}
