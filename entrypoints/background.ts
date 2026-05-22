import { getSettings, getUploadEnabledBackups, migrateToSync } from '@/utils/storage'
import { pushBookmarks, calculateSyncDiff } from '@/lib/sync/operations'
import { isLocked } from '@/lib/sync/lock'

export default defineBackground(() => {
  console.log('OneBookmark background service started', { id: browser.runtime.id })

  // 启动时迁移旧版 local 数据到 sync
  migrateToSync().catch(err => console.warn('[Storage] 迁移失败:', err))

  // isSyncing 存入 session storage，跨 service worker 重启保留
  const SESSION_KEY = 'ob_is_syncing'

  async function getIsSyncing(): Promise<boolean> {
    const result = await browser.storage.session.get(SESSION_KEY)
    return result[SESSION_KEY] === true
  }

  async function setIsSyncing(value: boolean): Promise<void> {
    await browser.storage.session.set({ [SESSION_KEY]: value })
  }

  // ── 定时自动同步 ──────────────────────────────────────────
  const ALARM_NAME = 'ob-auto-sync'

  /** 根据当前设置注册或清除 alarm */
  async function setupAutoSync() {
    await browser.alarms.clear(ALARM_NAME)
    const settings = await getSettings()
    if (settings.autoSyncEnabled && settings.autoSyncInterval > 0) {
      browser.alarms.create(ALARM_NAME, {
        delayInMinutes: settings.autoSyncInterval,
        periodInMinutes: settings.autoSyncInterval,
      })
      console.log('[AutoSync] 已设置定时同步，间隔:', settings.autoSyncInterval, '分钟')
    }
  }

  /** 执行一次自动同步 */
  async function runAutoSync() {
    const [settings, backups, syncing, locked] = await Promise.all([getSettings(), getUploadEnabledBackups(), getIsSyncing(), isLocked()])
    if (!settings.autoSyncEnabled || backups.length === 0 || syncing || locked) return

    console.log('[AutoSync] 开始自动同步，备份数:', backups.length)
    await setIsSyncing(true)

    const lang = browser.i18n.getUILanguage()
    const isZh = lang.startsWith('zh')

    let totalAdded = 0
    let totalRemoved = 0
    let hasPendingChanges = false
    const failedNames: string[] = []

    try {
      for (const backup of backups) {
        try {
          if (settings.diffPreviewEnabled) {
            // diff preview 模式：只检测变更，不自动推送
            const diff = await calculateSyncDiff(backup, 'push')
            if (diff?.hasChanges) hasPendingChanges = true
          } else {
            const result = await pushBookmarks(backup)
            await setIsSyncing(true)
            if (!result.success) {
              failedNames.push(backup.name)
            } else if (result.diff && (result.diff.added > 0 || result.diff.removed > 0)) {
              totalAdded += result.diff.added
              totalRemoved += result.diff.removed
            }
          }
        } catch (err) {
          console.error('[AutoSync] 备份处理失败:', backup.name, err)
          failedNames.push(backup.name)
        }
      }
    } finally {
      await setIsSyncing(false)
      browser.action.setBadgeText({ text: '' })
    }

    // 无需通知时静默
    if (!settings.notifyEnabled) return

    const notifId = `ob-autosync-${Date.now()}`

    if (failedNames.length > 0) {
      browser.notifications.create(notifId, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: isZh ? '自动同步' : 'Auto Sync',
        message: isZh
          ? `同步失败：${failedNames.join('、')}`
          : `Sync failed: ${failedNames.join(', ')}`,
      }).catch(() => {})
    } else if (hasPendingChanges) {
      // diff preview 开启时，检测到变更提醒用户手动同步
      browser.notifications.create(notifId, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: isZh ? '自动同步' : 'Auto Sync',
        message: isZh
          ? '检测到书签变更，请前往手动同步'
          : 'Bookmark changes detected, please sync manually',
      }).catch(() => {})
    } else if (totalAdded > 0 || totalRemoved > 0) {
      browser.notifications.create(notifId, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: isZh ? '自动同步完成' : 'Auto Sync Complete',
        message: isZh
          ? `新增 ${totalAdded} 个，删除 ${totalRemoved} 个`
          : `${totalAdded} added, ${totalRemoved} removed`,
      }).catch(() => {})
    }
    // 无变更 → 静默
  }

  // 初始化 alarm
  setupAutoSync().catch(err => console.warn('[AutoSync] 初始化失败:', err))

  // alarm 触发
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      runAutoSync().catch(err => console.error('[AutoSync] 执行失败:', err))
    }
  })
  // ─────────────────────────────────────────────────────────

  // 监听来自 popup/options 的消息
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'sync-start') {
      setIsSyncing(true).then(() => sendResponse(true))
    }
    if (msg.type === 'sync-end') {
      setIsSyncing(false).then(() => {
        // 同步完成后清除 badge
        browser.action.setBadgeText({ text: '' })
        sendResponse(true)
      })
    }
    if (msg.type === 'settings-changed' && 'badgeEnabled' in msg) {
      // 关闭时立即清除已有 badge，无需缓存，onBookmarkChanged 直接读 storage
      if (!msg.badgeEnabled) {
        browser.action.setBadgeText({ text: '' })
      }
      sendResponse(true)
    }
    if (msg.type === 'settings-changed' && 'autoSyncEnabled' in msg) {
      // 自动同步设置变更，重新注册 alarm
      setupAutoSync()
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false))
    }
    if (msg.type === 'notify') {
      const notifId = `ob-${Date.now()}`
      browser.notifications.create(notifId, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: msg.title || 'OneBookmark',
        message: msg.message,
      }).catch(() => { })
      sendResponse(true)
    }
    return true
  })

  // 书签变更时显示红点 badge（直接读 storage，避免 SW 重启后内存状态归零）
  async function onBookmarkChanged() {
    const [syncing, settings] = await Promise.all([getIsSyncing(), getSettings()])
    if (syncing || !settings.badgeEnabled) return
    browser.action.setBadgeText({ text: ' ' })
    browser.action.setBadgeBackgroundColor({ color: '#F44336' })
  }

  browser.bookmarks.onCreated.addListener(onBookmarkChanged)
  browser.bookmarks.onChanged.addListener(onBookmarkChanged)
  browser.bookmarks.onMoved.addListener(onBookmarkChanged)
  browser.bookmarks.onRemoved.addListener(onBookmarkChanged)
})
