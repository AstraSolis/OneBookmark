import type { BookmarkNode } from './types'

// 写入结果
interface WriteResult {
  success: boolean
  changes: number
  errors: string[]
}

// 书签位置信息
interface BookmarkLocation {
  parentPath: string
  index: number
}

// 浏览器书签索引（用于增量对比）
interface BrowserBookmarkIndex {
  byUrl: Map<string, chrome.bookmarks.BookmarkTreeNode>
  byPath: Map<string, chrome.bookmarks.BookmarkTreeNode>
  urlLocation: Map<string, BookmarkLocation> // URL -> 位置信息（父路径 + 索引）
  all: Map<string, chrome.bookmarks.BookmarkTreeNode>
}

// 构建浏览器书签索引
async function buildBrowserIndex(): Promise<BrowserBookmarkIndex> {
  const tree = await browser.bookmarks.getTree()
  const index: BrowserBookmarkIndex = {
    byUrl: new Map(),
    byPath: new Map(),
    urlLocation: new Map(),
    all: new Map(),
  }

  function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      index.all.set(node.id, node)

      // 跳过没有标题的根节点（浏览器的虚拟根）
      if (!node.title && node.children) {
        traverse(node.children, '')
        continue
      }

      if (node.url) {
        // URL 书签：以 URL 为 key，同时记录位置信息
        index.byUrl.set(node.url, node)
        index.urlLocation.set(node.url, { parentPath, index: i })
      } else {
        // 文件夹：以路径为 key
        const path = `${parentPath}/${node.title}`
        index.byPath.set(path, node)
      }

      if (node.children) {
        const currentPath = node.url ? parentPath : `${parentPath}/${node.title}`
        traverse(node.children, currentPath)
      }
    }
  }

  traverse(tree, '')
  return index
}

// 查找或创建父文件夹
async function ensureParentFolder(
  parentPath: string,
  browserIndex: BrowserBookmarkIndex,
  rootFolders: Map<string, string>
): Promise<string | null> {
  if (!parentPath || parentPath === '/') {
    return null
  }

  // 检查是否是根文件夹（书签栏、其他书签等）
  const rootId = rootFolders.get(parentPath)
  if (rootId) {
    return rootId
  }

  // 检查文件夹是否已存在
  const existing = browserIndex.byPath.get(parentPath)
  if (existing) {
    return existing.id
  }

  // 需要创建文件夹，先确保父路径存在
  const lastSlash = parentPath.lastIndexOf('/')
  const parentOfParent = parentPath.substring(0, lastSlash) || '/'
  const folderTitle = parentPath.substring(lastSlash + 1)

  const parentId = await ensureParentFolder(parentOfParent, browserIndex, rootFolders)
  if (!parentId) {
    return null
  }

  // 创建文件夹
  const newFolder = await browser.bookmarks.create({
    parentId,
    title: folderTitle,
  })

  // 更新索引
  browserIndex.byPath.set(parentPath, newFolder as chrome.bookmarks.BookmarkTreeNode)
  browserIndex.all.set(newFolder.id, newFolder as chrome.bookmarks.BookmarkTreeNode)

  return newFolder.id
}

// 获取根文件夹映射
async function getRootFolders(): Promise<Map<string, string>> {
  const tree = await browser.bookmarks.getTree()
  const root = tree[0]
  const map = new Map<string, string>()

  if (root.children) {
    for (const folder of root.children) {
      map.set(`/${folder.title}`, folder.id)
    }
  }

  return map
}

// 变更类型
interface ComputedChanges {
  toCreate: Array<{ node: BookmarkNode; parentPath: string; index: number }>
  toDelete: string[]
  toUpdate: Array<{ node: BookmarkNode; browserId: string }>
  toMove: Array<{ node: BookmarkNode; browserId: string; newParentPath: string; newIndex: number }>
  toReorder: Array<{ node: BookmarkNode; browserId: string; parentPath: string; newIndex: number }>
}

// 计算需要的变更（增量 diff）
function computeChanges(
  remoteBookmarks: BookmarkNode[],
  browserIndex: BrowserBookmarkIndex,
  _rootFolders: Map<string, string>
): ComputedChanges {
  const toCreate: Array<{ node: BookmarkNode; parentPath: string; index: number }> = []
  const toDelete: string[] = []
  const toUpdate: Array<{ node: BookmarkNode; browserId: string }> = []
  const toMove: Array<{ node: BookmarkNode; browserId: string; newParentPath: string; newIndex: number }> = []
  const toReorder: Array<{ node: BookmarkNode; browserId: string; parentPath: string; newIndex: number }> = []
  const remoteUrls = new Set<string>()
  const remotePaths = new Set<string>()

  // 遍历书签树，统一处理所有层级
  function traverseRemote(nodes: BookmarkNode[], parentPath: string) {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]
      if (node.url) {
        // URL 书签
        remoteUrls.add(node.url)
        const existing = browserIndex.byUrl.get(node.url)
        const currentLocation = browserIndex.urlLocation.get(node.url)

        if (!existing) {
          // 新书签
          toCreate.push({ node, parentPath, index })
        } else {
          const currentParentPath = currentLocation?.parentPath
          const currentIndex = currentLocation?.index

          // 检查是否需要跨文件夹移动
          if (currentParentPath !== parentPath) {
            toMove.push({ node, browserId: existing.id, newParentPath: parentPath, newIndex: index })
          } else if (currentIndex !== index) {
            // 同文件夹内顺序变化
            toReorder.push({ node, browserId: existing.id, parentPath, newIndex: index })
          }

          // 检查是否需要更新标题
          if (existing.title !== node.title) {
            toUpdate.push({ node, browserId: existing.id })
          }
        }
      } else if (node.children) {
        // 文件夹：先记录路径，再递归
        const currentPath = `${parentPath}/${node.title}`
        remotePaths.add(currentPath)
        traverseRemote(node.children, currentPath)
      }
    }
  }

  // 处理书签树结构
  function processBookmarkTree(bookmarks: BookmarkNode[]) {
    for (let index = 0; index < bookmarks.length; index++) {
      const node = bookmarks[index]
      // 跳过没有标题的根节点（浏览器的虚拟根）
      if (!node.title && node.children) {
        processBookmarkTree(node.children)
        continue
      }

      // 处理根文件夹（书签栏、其他书签等）
      if (!node.url && node.children) {
        const folderPath = `/${node.title}`
        remotePaths.add(folderPath)
        traverseRemote(node.children, folderPath)
      } else if (node.url) {
        // 根级别的书签（少见但可能存在）
        remoteUrls.add(node.url)
        const existing = browserIndex.byUrl.get(node.url)
        const currentLocation = browserIndex.urlLocation.get(node.url)
        if (!existing) {
          toCreate.push({ node, parentPath: '', index })
        } else {
          const currentParentPath = currentLocation?.parentPath
          const currentIndex = currentLocation?.index
          if (currentParentPath !== '') {
            toMove.push({ node, browserId: existing.id, newParentPath: '', newIndex: index })
          } else if (currentIndex !== index) {
            toReorder.push({ node, browserId: existing.id, parentPath: '', newIndex: index })
          }
          if (existing.title !== node.title) {
            toUpdate.push({ node, browserId: existing.id })
          }
        }
      }
    }
  }

  processBookmarkTree(remoteBookmarks)

  // 找出需要删除的书签（本地有但远端没有）
  for (const [url, node] of browserIndex.byUrl) {
    if (!remoteUrls.has(url)) {
      toDelete.push(node.id)
    }
  }

  return { toCreate, toDelete, toUpdate, toMove, toReorder }
}

// 增量写入书签（推荐方式）
export async function writeBookmarksIncremental(bookmarks: BookmarkNode[]): Promise<WriteResult> {
  const errors: string[] = []
  let changes = 0

  try {
    const browserIndex = await buildBrowserIndex()
    const rootFolders = await getRootFolders()
    const { toCreate, toDelete, toUpdate, toMove, toReorder } = computeChanges(
      bookmarks,
      browserIndex,
      rootFolders
    )

    console.log('[Writer] 增量变更:', {
      create: toCreate.length,
      delete: toDelete.length,
      update: toUpdate.length,
      move: toMove.length,
      reorder: toReorder.length,
    })

    // 1. 先删除
    for (const id of toDelete) {
      try {
        await browser.bookmarks.remove(id)
        changes++
      } catch (err) {
        errors.push(`删除失败 ${id}: ${err}`)
      }
    }

    // 2. 再更新标题
    for (const { node, browserId } of toUpdate) {
      try {
        await browser.bookmarks.update(browserId, { title: node.title })
        changes++
      } catch (err) {
        errors.push(`更新失败 ${node.title}: ${err}`)
      }
    }

    // 3. 执行跨文件夹移动
    for (const { node, browserId, newParentPath, newIndex } of toMove) {
      try {
        const newParentId = await ensureParentFolder(newParentPath, browserIndex, rootFolders)
        if (newParentId) {
          await browser.bookmarks.move(browserId, { parentId: newParentId, index: newIndex })
          changes++
          console.log(`[Writer] 移动书签: ${node.title} -> ${newParentPath}[${newIndex}]`)
        }
      } catch (err) {
        errors.push(`移动失败 ${node.title}: ${err}`)
      }
    }

    // 4. 执行同文件夹内重排序
    // 按父文件夹分组，然后批量处理每个文件夹内的重排序
    const reorderByParent = new Map<string, typeof toReorder>()
    for (const item of toReorder) {
      const group = reorderByParent.get(item.parentPath) || []
      group.push(item)
      reorderByParent.set(item.parentPath, group)
    }

    for (const [parentPath, items] of reorderByParent) {
      try {
        const parentId = await ensureParentFolder(parentPath, browserIndex, rootFolders)
        if (!parentId) continue

        // 获取当前文件夹内所有子节点的实际顺序
        const parent = await browser.bookmarks.getSubTree(parentId)
        if (!parent[0]?.children) continue

        const currentChildren = parent[0].children

        // 构建目标顺序：将需要重排的节点按目标索引排序
        // 使用稳定排序：先按目标索引，未指定的保持原位
        const sortedItems = [...items].sort((a, b) => a.newIndex - b.newIndex)

        // 从最小目标索引开始，依次移动到正确位置
        for (const { node, browserId, newIndex } of sortedItems) {
          // 每次移动前重新获取当前位置，因为之前的移动可能改变了索引
          const currentNode = currentChildren.find((c) => c.id === browserId)
          if (!currentNode) continue

          const currentIndex = currentChildren.indexOf(currentNode)
          if (currentIndex !== newIndex) {
            await browser.bookmarks.move(browserId, { index: newIndex })
            // 更新内存中的顺序以反映变化
            currentChildren.splice(currentIndex, 1)
            currentChildren.splice(newIndex, 0, currentNode)
            changes++
            console.log(`[Writer] 重排序书签: ${node.title} -> index ${newIndex}`)
          }
        }
      } catch (err) {
        errors.push(`重排序失败 ${parentPath}: ${err}`)
      }
    }

    // 5. 最后创建（按索引顺序创建）
    const sortedCreate = [...toCreate].sort((a, b) => a.index - b.index)
    for (const { node, parentPath, index } of sortedCreate) {
      try {
        const parentId = await ensureParentFolder(parentPath, browserIndex, rootFolders)
        if (parentId) {
          await browser.bookmarks.create({
            parentId,
            title: node.title,
            url: node.url,
            index,
          })
          changes++
        }
      } catch (err) {
        errors.push(`创建失败 ${node.title}: ${err}`)
      }
    }

    return { success: errors.length === 0, changes, errors }
  } catch (err) {
    return {
      success: false,
      changes,
      errors: [...errors, `写入失败: ${err}`],
    }
  }
}

// 全量写入书签（备用方式，用于首次同步或修复）
export async function writeBookmarksFull(bookmarks: BookmarkNode[]): Promise<number> {
  try {
    // 获取书签栏的 ID
    const tree = await browser.bookmarks.getTree()
    const root = tree[0]

    if (!root.children || root.children.length === 0) {
      throw new Error('无法获取书签根目录')
    }

    // 清空现有书签
    await clearAllBookmarks()

    let count = 0

    // 遍历远端数据的根节点
    const remoteRoot = bookmarks[0]
    if (!remoteRoot?.children) {
      return 0
    }

    // 匹配本地根文件夹和远端根文件夹
    for (const remoteFolder of remoteRoot.children) {
      const localFolder = root.children.find(
        (f) => f.title === remoteFolder.title || f.id === remoteFolder.id
      )

      if (!localFolder || !remoteFolder.children) continue

      // 在本地文件夹中创建远端的书签
      for (const child of remoteFolder.children) {
        await createBookmarkNode(child, localFolder.id)
        count++
      }
    }

    return count
  } catch (err) {
    console.error('[Writer] 全量写入失败:', err)
    throw err
  }
}

// 清空所有书签（保留根节点）
async function clearAllBookmarks(): Promise<void> {
  const tree = await browser.bookmarks.getTree()
  const root = tree[0]

  if (!root.children) return

  for (const folder of root.children) {
    if (!folder.children) continue
    for (const child of folder.children) {
      await browser.bookmarks.removeTree(child.id)
    }
  }
}

// 递归创建书签节点
async function createBookmarkNode(
  node: BookmarkNode,
  parentId: string
): Promise<void> {
  if (node.url) {
    await browser.bookmarks.create({
      parentId,
      title: node.title,
      url: node.url,
    })
  } else if (node.children) {
    const folder = await browser.bookmarks.create({
      parentId,
      title: node.title,
    })
    for (const child of node.children) {
      await createBookmarkNode(child, folder.id)
    }
  }
}

// 默认导出增量写入
export async function writeBookmarks(bookmarks: BookmarkNode[]): Promise<number> {
  const result = await writeBookmarksIncremental(bookmarks)
  if (!result.success && result.errors.length > 0) {
    console.warn('[Writer] 部分操作失败:', result.errors)
  }
  return result.changes
}
