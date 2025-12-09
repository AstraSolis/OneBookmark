export type { BookmarkFormat } from './interface'
export { htmlFormat } from './html'

import { htmlFormat } from './html'
import type { BookmarkFormat } from './interface'

// 所有支持的格式
export const formats: Record<string, BookmarkFormat> = {
  html: htmlFormat,
}

// 根据文件扩展名获取格式
export function getFormatByExtension(filename: string): BookmarkFormat | null {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'html' || ext === 'htm') return htmlFormat
  return null
}

// 根据 MIME 类型获取格式
export function getFormatByMimeType(mimeType: string): BookmarkFormat | null {
  if (mimeType === 'text/html') return htmlFormat
  return null
}
