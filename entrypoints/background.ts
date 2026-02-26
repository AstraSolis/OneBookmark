import { getSettings } from '@/utils/storage'

export default defineBackground(() => {
  console.log('OneBookmark background service started', { id: browser.runtime.id })

  // 标记是否正在同步（同步期间的书签变更不触发 badge）
  let isSyncing = false
  // 是否启用 badge 提醒
  let badgeEnabled = true

  // 初始化时读取设置
  getSettings().then(settings => {
    badgeEnabled = settings.badgeEnabled
  })

  // 监听来自 popup/options 的消息
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'sync-start') {
      isSyncing = true
      sendResponse(true)
    }
    if (msg.type === 'sync-end') {
      isSyncing = false
      // 同步完成后清除 badge
      browser.action.setBadgeText({ text: '' })
      sendResponse(true)
    }
    if (msg.type === 'settings-changed' && 'badgeEnabled' in msg) {
      badgeEnabled = msg.badgeEnabled
      // 关闭时立即清除已有 badge
      if (!badgeEnabled) {
        browser.action.setBadgeText({ text: '' })
      }
      sendResponse(true)
    }
    return true
  })

  // 书签变更时显示红点 badge
  function onBookmarkChanged() {
    if (isSyncing || !badgeEnabled) return
    browser.action.setBadgeText({ text: ' ' })
    browser.action.setBadgeBackgroundColor({ color: '#F44336' })
  }

  browser.bookmarks.onCreated.addListener(onBookmarkChanged)
  browser.bookmarks.onChanged.addListener(onBookmarkChanged)
  browser.bookmarks.onMoved.addListener(onBookmarkChanged)
  browser.bookmarks.onRemoved.addListener(onBookmarkChanged)
})
