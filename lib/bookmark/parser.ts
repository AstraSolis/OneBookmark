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

// 根据路径查找文件夹节点
export async function findFolderByPath(path: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  if (!path || path === '/') return null

  const tree = await browser.bookmarks.getTree()
  const parts = path.split('/').filter(Boolean)

  function findInChildren(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    remainingParts: string[]
  ): chrome.bookmarks.BookmarkTreeNode | null {
    if (remainingParts.length === 0) return null

    const [current, ...rest] = remainingParts
    for (const node of nodes) {
      if (node.title === current && !node.url) {
        if (rest.length === 0) return node
        if (node.children) return findInChildren(node.children, rest)
      }
      // 递归搜索没有标题的根节点
      if (!node.title && node.children) {
        const found = findInChildren(node.children, remainingParts)
        if (found) return found
      }
    }
    return null
  }

  return findInChildren(tree, parts)
}

// 获取指定文件夹下的书签
export async function getBookmarksByFolder(folderPath: string | null): Promise<BookmarkNode[]> {
  if (!folderPath || folderPath === '/') {
    return getLocalBookmarks()
  }

  const folder = await findFolderByPath(folderPath)
  if (!folder) {
    throw new Error(`文件夹不存在: ${folderPath}`)
  }

  // 返回该文件夹的子节点，包装成与 getLocalBookmarks 相同的结构
  const subTree = await browser.bookmarks.getSubTree(folder.id)
  return parseBookmarkTree(subTree)
}
