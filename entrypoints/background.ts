import { getSettings, migrateToSync } from '@/utils/storage'

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
