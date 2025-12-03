import type { BookmarkNode, SyncData } from './types'

// 将浏览器书签树转换为 BookmarkNode
export function parseBookmarkTree(
  tree: chrome.bookmarks.BookmarkTreeNode[]
): BookmarkNode[] {
  return tree.map((node) => ({
    id: node.id,
    title: node.title,
    url: node.url,
    dateAdded: node.dateAdded,
    children: node.children ? parseBookmarkTree(node.children) : undefined,
  }))
}

// 生成书签数据的 checksum
export function generateChecksum(bookmarks: BookmarkNode[]): string {
  const str = JSON.stringify(bookmarks)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

// 创建同步数据
export function createSyncData(bookmarks: BookmarkNode[]): SyncData {
  return {
    version: 1,
    lastSync: Date.now(),
    bookmarks,
    checksum: generateChecksum(bookmarks),
  }
}

// 获取本地书签
export async function getLocalBookmarks(): Promise<BookmarkNode[]> {
  const tree = await browser.bookmarks.getTree()
  return parseBookmarkTree(tree)
}
