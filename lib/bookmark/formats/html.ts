import type { BookmarkFormat } from './interface'
import type { BookmarkNode } from '../types'

// Netscape HTML 书签格式
// 所有主流浏览器都支持的导入/导出格式

export const htmlFormat: BookmarkFormat = {
  name: 'Netscape HTML',
  extension: '.html',
  mimeType: 'text/html',
  parse: parseNetscapeHtml,
  serialize: serializeToNetscapeHtml,
}

// 生成唯一 ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

// 解析 Netscape HTML 格式
function parseNetscapeHtml(content: string): BookmarkNode[] {
  const results: BookmarkNode[] = []
  const stack: BookmarkNode[][] = [results]

  // 正则匹配关键元素
  const dlOpenPattern = /<DL>/gi
  const dlClosePattern = /<\/DL>/gi
  const h3Pattern = /<H3[^>]*>([^<]*)<\/H3>/i
  const h3DatePattern = /ADD_DATE="(\d+)"/i
  const aPattern = /<A[^>]*HREF="([^"]*)"[^>]*>([^<]*)<\/A>/i
  const aDatePattern = /ADD_DATE="(\d+)"/i

  // 将内容按行处理，保持结构
  const lines = content.split('\n')
  let currentFolder: BookmarkNode | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // 检测 <DL> 开始（进入子层级）
    if (dlOpenPattern.test(trimmed)) {
      dlOpenPattern.lastIndex = 0
      if (currentFolder) {
        currentFolder.children = currentFolder.children || []
        stack.push(currentFolder.children)
        currentFolder = null
      }
      continue
    }

    // 检测 </DL> 结束（返回上层）
    if (dlClosePattern.test(trimmed)) {
      dlClosePattern.lastIndex = 0
      if (stack.length > 1) {
        stack.pop()
      }
      continue
    }

    // 检测文件夹 <H3>
    const h3Match = h3Pattern.exec(trimmed)
    if (h3Match) {
      const [, title] = h3Match
      const dateMatch = h3DatePattern.exec(trimmed)
      const addDate = dateMatch ? dateMatch[1] : null
      currentFolder = {
        id: generateId(),
        title: decodeHtmlEntities(title),
        dateAdded: addDate ? parseInt(addDate) * 1000 : undefined,
        children: [],
      }
      stack[stack.length - 1].push(currentFolder)
      continue
    }

    // 检测书签 <A>
    const aMatch = aPattern.exec(trimmed)
    if (aMatch) {
      const [, href, title] = aMatch
      const dateMatch = aDatePattern.exec(trimmed)
      const addDate = dateMatch ? dateMatch[1] : null
      const bookmark: BookmarkNode = {
        id: generateId(),
        title: decodeHtmlEntities(title),
        url: href,
        dateAdded: addDate ? parseInt(addDate) * 1000 : undefined,
      }
      stack[stack.length - 1].push(bookmark)
      currentFolder = null
      continue
    }
  }

  return results
}

// 解码 HTML 实体
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  }
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (match) => entities[match] || match)
}

// 编码 HTML 实体
function encodeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 序列化为 Netscape HTML 格式
function serializeToNetscapeHtml(bookmarks: BookmarkNode[]): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. -->',
    '<!-- It will be read and overwritten. -->',
    '<!-- DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]

  function serializeNode(node: BookmarkNode, indent: string): void {
    const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : Math.floor(Date.now() / 1000)

    if (node.url) {
      // 书签
      lines.push(`${indent}<DT><A HREF="${encodeHtmlEntities(node.url)}" ADD_DATE="${addDate}">${encodeHtmlEntities(node.title)}</A>`)
    } else if (node.children) {
      // 文件夹
      lines.push(`${indent}<DT><H3 ADD_DATE="${addDate}">${encodeHtmlEntities(node.title)}</H3>`)
      lines.push(`${indent}<DL><p>`)
      for (const child of node.children) {
        serializeNode(child, indent + '    ')
      }
      lines.push(`${indent}</DL><p>`)
    }
  }

  // 处理书签树
  for (const node of bookmarks) {
    // 跳过没有标题的虚拟根节点
    if (!node.title && node.children) {
      for (const child of node.children) {
        serializeNode(child, '    ')
      }
    } else {
      serializeNode(node, '    ')
    }
  }

  lines.push('</DL><p>')
  return lines.join('\n')
}

export default htmlFormat
