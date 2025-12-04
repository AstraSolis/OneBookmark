import type { BookmarkNode } from './types'

// 差异类型
export type DiffType = 'added' | 'removed' | 'modified'

// 单个差异项
export interface DiffItem {
  type: DiffType
  path: string[]  // 书签路径（文件夹层级）
  title: string
  url?: string
  oldTitle?: string  // 仅 modified 时有值（标题变更）
}

// 差异结果
export interface DiffResult {
  added: DiffItem[]
  removed: DiffItem[]
  modified: DiffItem[]
  hasChanges: boolean
}

// 书签扁平项
interface FlatBookmark {
  url: string
  title: string
  path: string[]  // 文件夹路径（不含自身）
}

// 扁平化书签为 Map，key 为 URL（书签的唯一标识）
function flattenBookmarks(
  nodes: BookmarkNode[],
  path: string[] = []
): Map<string, FlatBookmark> {
  const map = new Map<string, FlatBookmark>()

  for (const node of nodes) {
    if (node.url) {
      // 有 URL 的是书签
      map.set(node.url, { url: node.url, title: node.title, path })
    }

    if (node.children) {
      // 有 children 的是文件夹，递归处理
      const childPath = [...path, node.title]
      const childMap = flattenBookmarks(node.children, childPath)
      childMap.forEach((v, k) => map.set(k, v))
    }
  }

  return map
}

// 计算两个书签树的差异
// source: 源数据（将被覆盖的）
// target: 目标数据（将应用的）
export function calculateDiff(source: BookmarkNode[], target: BookmarkNode[]): DiffResult {
  const sourceMap = flattenBookmarks(source)
  const targetMap = flattenBookmarks(target)

  const added: DiffItem[] = []
  const removed: DiffItem[] = []
  const modified: DiffItem[] = []

  // 查找新增和修改（标题或位置变更）
  targetMap.forEach((targetItem, url) => {
    const sourceItem = sourceMap.get(url)
    if (!sourceItem) {
      // 新增
      added.push({
        type: 'added',
        path: targetItem.path,
        title: targetItem.title,
        url: targetItem.url
      })
    } else {
      // 检查标题或路径是否变更
      const titleChanged = sourceItem.title !== targetItem.title
      const pathChanged = sourceItem.path.join('/') !== targetItem.path.join('/')
      if (titleChanged || pathChanged) {
        modified.push({
          type: 'modified',
          path: targetItem.path,
          title: targetItem.title,
          url: targetItem.url,
          oldTitle: titleChanged ? sourceItem.title : undefined
        })
      }
    }
  })

  // 查找删除
  sourceMap.forEach((sourceItem, url) => {
    if (!targetMap.has(url)) {
      removed.push({
        type: 'removed',
        path: sourceItem.path,
        title: sourceItem.title,
        url: sourceItem.url
      })
    }
  })

  return {
    added,
    removed,
    modified,
    hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0
  }
}
