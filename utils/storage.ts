import { StorageQuotaError, isStorageQuotaError } from '@/lib/errors'

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
  // 文件夹映射路径，如 "/书签栏/工作"，空或 "/" 表示根目录
  folderPath: string | null
}

// CONFIG_KEY / SETTINGS_KEY 存储于 storage.sync（随浏览器账号同步）
// LOCAL_SETTINGS_KEY 存储于 storage.local（base64 图片不适合 sync）
const CONFIG_KEY = 'onebookmark_backups'
const SETTINGS_KEY = 'onebookmark_settings'
const LOCAL_SETTINGS_KEY = 'onebookmark_local_settings'

// 背景设置
export interface BackgroundSettings {
  type: 'particles' | 'remote' | 'local' | 'none'
  remoteUrl?: string
  localData?: string // Base64 编码的图片数据，单独存于 storage.local
}

// 应用设置
export interface AppSettings {
  diffPreviewEnabled: boolean
  badgeEnabled: boolean
  notifyEnabled: boolean
  autoSyncEnabled: boolean
  autoSyncInterval: number  // 单位：分钟
  background: BackgroundSettings
}

const DEFAULT_SETTINGS: AppSettings = {
  diffPreviewEnabled: false,
  badgeEnabled: true,
  notifyEnabled: true,
  autoSyncEnabled: false,
  autoSyncInterval: 60,
  background: { type: 'particles' }
}

// 获取设置（sync 常规设置 + local localData 合并）
export async function getSettings(): Promise<AppSettings> {
  const [syncResult, localResult] = await Promise.all([
    browser.storage.sync.get(SETTINGS_KEY),
    browser.storage.local.get(LOCAL_SETTINGS_KEY),
  ])
  const syncSettings = syncResult[SETTINGS_KEY] || {}
  const localBackground = localResult[LOCAL_SETTINGS_KEY] || {}
  return {
    ...DEFAULT_SETTINGS,
    ...syncSettings,
    background: {
      ...DEFAULT_SETTINGS.background,
      ...syncSettings.background,
      localData: localBackground.localData,
    },
  }
}

// 更新设置（localData 写 local，其余写 sync）
export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  const merged = { ...current, ...updates }
  const { background, ...otherSettings } = merged
  const { localData, ...backgroundWithoutLocalData } = background || {}

  try {
    await Promise.all([
      browser.storage.sync.set({ [SETTINGS_KEY]: { ...otherSettings, background: backgroundWithoutLocalData } }),
      browser.storage.local.set({ [LOCAL_SETTINGS_KEY]: { localData } }),
    ])
  } catch (err) {
    if (isStorageQuotaError(err)) throw new StorageQuotaError()
    throw err
  }
}

// 发送系统通知（检查用户设置）
export async function sendNotification(title: string, message: string) {
  const settings = await getSettings()
  if (!settings.notifyEnabled) return
  try {
    await browser.runtime.sendMessage({ type: 'notify', title, message })
  } catch { /* popup 关闭时可能失败，忽略 */ }
}

// 生成唯一 ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// 获取所有备份
export async function getBackups(): Promise<BackupConfig[]> {
  const result = await browser.storage.sync.get(CONFIG_KEY)
  return result[CONFIG_KEY] || []
}

// 保存所有备份
async function saveBackups(backups: BackupConfig[]): Promise<void> {
  try {
    await browser.storage.sync.set({ [CONFIG_KEY]: backups })
  } catch (err) {
    if (isStorageQuotaError(err)) throw new StorageQuotaError()
    throw err
  }
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

// 将旧版 storage.local 数据迁移到 storage.sync（首次运行时调用）
export async function migrateToSync(): Promise<void> {
  const [syncBackups, syncSettings, localBackups, localSettings] = await Promise.all([
    browser.storage.sync.get(CONFIG_KEY),
    browser.storage.sync.get(SETTINGS_KEY),
    browser.storage.local.get(CONFIG_KEY),
    browser.storage.local.get(SETTINGS_KEY),
  ])

  const writes: Promise<void>[] = []
  const localKeysToRemove: string[] = []

  // 各 key 独立判断：sync 无数据且 local 有旧数据时才迁移
  if (!syncBackups[CONFIG_KEY] && localBackups[CONFIG_KEY]) {
    writes.push(browser.storage.sync.set({ [CONFIG_KEY]: localBackups[CONFIG_KEY] }))
    localKeysToRemove.push(CONFIG_KEY)
  }

  if (!syncSettings[SETTINGS_KEY] && localSettings[SETTINGS_KEY]) {
    const old = localSettings[SETTINGS_KEY]
    const { background, ...otherSettings } = old
    const { localData, ...backgroundWithoutLocalData } = background || {}
    writes.push(browser.storage.sync.set({ [SETTINGS_KEY]: { ...otherSettings, background: backgroundWithoutLocalData } }))
    if (localData) {
      writes.push(browser.storage.local.set({ [LOCAL_SETTINGS_KEY]: { localData } }))
    }
    localKeysToRemove.push(SETTINGS_KEY)
  }

  if (writes.length === 0) return

  await Promise.all(writes)
  await browser.storage.local.remove(localKeysToRemove)
  console.log('[Storage] 迁移完成：配置已从 local 迁移到 sync', localKeysToRemove)
}
