import type { StorageBackend } from './interface'
import type { SyncData } from '../bookmark/types'

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

    if (this.gistId) {
      const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(`更新 Gist 失败: ${error.message || res.statusText}`)
      }
    } else {
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(`创建 Gist 失败: ${error.message || res.statusText}`)
      }
      const gist = await res.json()
      this.gistId = gist.id
    }
  }

  async read(): Promise<SyncData | null> {
    if (!this.gistId) return null

    try {
      const res = await fetch(`https://api.github.com/gists/${this.gistId}`, {
        headers: this.headers,
      })

      if (!res.ok) return null

      const gist = await res.json()
      const dataFile = gist.files?.[GIST_FILENAME]

      return dataFile?.content ? JSON.parse(dataFile.content) : null
    } catch {
      return null
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
