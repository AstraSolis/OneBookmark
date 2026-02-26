import type { StorageBackend } from './interface'
import type { SyncData } from '../bookmark/types'
import { SyncError, classifyHttpError, classifyFetchError } from '../errors'

const GIST_FILENAME = 'onebookmark.json'

export class GistStorage implements StorageBackend {
  name = 'GitHub Gist'
  private token: string
  private gistId: string | null

  constructor(token: string, gistId: string | null = null) {
    this.token = token
    this.gistId = gistId
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  // 处理 API 响应错误
  private async handleResponseError(res: Response, action: string): Promise<never> {
    const errorBody = await res.json().catch(() => ({}))
    const message = errorBody.message || res.statusText
    console.error(`[GistStorage] ${action} 失败:`, res.status, message)
    throw classifyHttpError(res.status, message)
  }

  async test(): Promise<boolean> {
    try {
      const res = await fetch('https://api.github.com/user', { headers: this.headers })
      return res.ok
    } catch {
      return false
    }
  }

  async write(data: SyncData): Promise<void> {
    const files: Record<string, { content: string }> = {
      [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) },
    }

    const body = { description: 'OneBookmark 书签同步数据', public: false, files }

    try {
      if (this.gistId) {
        const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          await this.handleResponseError(res, '更新 Gist')
        }
      } else {
        const res = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          await this.handleResponseError(res, '创建 Gist')
        }
        const gist = await res.json()
        this.gistId = gist.id
      }
    } catch (err) {
      throw classifyFetchError(err)
    }
  }

  async read(): Promise<SyncData | null> {
    if (!this.gistId) return null

    try {
      const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
        headers: this.headers,
      })

      if (!res.ok) {
        // 404 返回 null 而不是抛错，表示 Gist 不存在
        if (res.status === 404) return null
        await this.handleResponseError(res, '读取 Gist')
      }

      const gist = await res.json()
      const dataFile = gist.files?.[GIST_FILENAME]
      if (!dataFile) return null

      // 处理大文件截断：通过 raw_url 获取完整内容
      let content: string
      if (dataFile.truncated && dataFile.raw_url) {
        const rawRes = await fetch(dataFile.raw_url)
        if (!rawRes.ok) {
          throw classifyHttpError(rawRes.status, '获取完整 Gist 内容失败')
        }
        content = await rawRes.text()
      } else {
        content = dataFile.content
      }

      return content ? JSON.parse(content) : null
    } catch (err) {
      // 如果是 SyncError 则重新抛出
      if (err instanceof SyncError) throw err
      throw classifyFetchError(err)
    }
  }

  async getLastModified(): Promise<number | null> {
    if (!this.gistId) return null
    try {
      const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
        headers: this.headers,
      })
      if (!res.ok) return null
      const gist = await res.json()
      return new Date(gist.updated_at).getTime()
    } catch {
      return null
    }
  }

  async getUserProfile(): Promise<{ name: string; avatar_url: string; email: string } | null> {
    try {
      const res = await fetch('https://api.github.com/user', { headers: this.headers })
      if (!res.ok) return null
      const user = await res.json()
      return { name: user.name || user.login, avatar_url: user.avatar_url, email: user.email }
    } catch {
      return null
    }
  }

  getGistId(): string | null {
    return this.gistId
  }
}
