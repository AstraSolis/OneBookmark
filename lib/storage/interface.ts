import type { SyncData } from '../bookmark/types'

// 存储后端接口
export interface StorageBackend {
  name: string

  // 连接测试
  test(): Promise<boolean>

  // 读写操作
  write(data: SyncData): Promise<void>
  read(): Promise<SyncData | null>

  // 元信息
  getLastModified(): Promise<number | null>
}
