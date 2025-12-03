// 配置存储 key
const CONFIG_KEY = 'onebookmark_config'

export interface Config {
  githubToken: string
  gistId: string | null
  lastSyncTime: number | null
}

const defaultConfig: Config = {
  githubToken: '',
  gistId: null,
  lastSyncTime: null,
}

// 获取配置
export async function getConfig(): Promise<Config> {
  const result = await browser.storage.local.get(CONFIG_KEY)
  return { ...defaultConfig, ...result[CONFIG_KEY] }
}

// 保存配置
export async function saveConfig(config: Partial<Config>): Promise<void> {
  const current = await getConfig()
  await browser.storage.local.set({
    [CONFIG_KEY]: { ...current, ...config },
  })
}
