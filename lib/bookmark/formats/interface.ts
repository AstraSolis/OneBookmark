import type { BookmarkNode } from '../types'

// 书签格式接口
export interface BookmarkFormat {
  name: string
  extension: string
  mimeType: string
  parse(content: string): BookmarkNode[]
  serialize(bookmarks: BookmarkNode[]): string
}
