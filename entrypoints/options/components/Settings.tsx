import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getEnabledBackups, getSettings, updateSettings, type BackgroundSettings } from '@/utils/storage'
import { StorageQuotaError } from '@/lib/errors'
import { LanguageCards } from '@/lib/i18n/LanguageCards'
import { FadeInUp, HoverScale, Switch } from '@/lib/motion'
import { Toast, createToastId, type ToastMessage } from './Toast'

export function Settings() {
  const { t, i18n } = useTranslation()
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [diffPreviewEnabled, setDiffPreviewEnabled] = useState(false)
  const [badgeEnabled, setBadgeEnabled] = useState(true)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [autoSyncInterval, setAutoSyncInterval] = useState(60)
  const [intervalInputValue, setIntervalInputValue] = useState('60')
  const [background, setBackground] = useState<BackgroundSettings>({ type: 'particles' })
  const [bgUrlInput, setBgUrlInput] = useState('')
  const [messages, setMessages] = useState<ToastMessage[]>([])

  function showMessage(type: 'success' | 'error', text: string) {
    const id = createToastId()
    setMessages((prev) => [...prev, { id, type, text }])
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }, 3000)
  }

  function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  useEffect(() => {
    loadConfig()
  }, [i18n.language])

  useEffect(() => {
    setIntervalInputValue(String(autoSyncInterval))
  }, [autoSyncInterval])

  async function loadConfig() {
    const backups = await getEnabledBackups()
    const times = backups.map(b => b.lastSyncTime).filter((t): t is number => t !== null)
    if (times.length > 0) {
      setLastSyncTime(new Date(Math.max(...times)).toLocaleString(i18n.language))
    }

    const settings = await getSettings()
    setDiffPreviewEnabled(settings.diffPreviewEnabled)
    setBadgeEnabled(settings.badgeEnabled)
    setNotifyEnabled(settings.notifyEnabled)
    setAutoSyncEnabled(settings.autoSyncEnabled ?? false)
    setAutoSyncInterval(settings.autoSyncInterval ?? 60)
    setBackground(settings.background || { type: 'particles' })
    setBgUrlInput(settings.background?.remoteUrl || '')
  }

  async function handleToggleDiffPreview() {
    const newValue = !diffPreviewEnabled
    setDiffPreviewEnabled(newValue)
    try {
      await updateSettings({ diffPreviewEnabled: newValue })
      showMessage('success', t('settings.settingsSaved'))
    } catch (err) {
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  async function handleToggleBadge() {
    const newValue = !badgeEnabled
    setBadgeEnabled(newValue)
    try {
      await updateSettings({ badgeEnabled: newValue })
      // 通知 background service 更新设置
      try { await browser.runtime.sendMessage({ type: 'settings-changed', badgeEnabled: newValue }) } catch { /* ignore */ }
      showMessage('success', t('settings.settingsSaved'))
    } catch (err) {
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  async function handleToggleNotify() {
    const newValue = !notifyEnabled
    setNotifyEnabled(newValue)
    try {
      await updateSettings({ notifyEnabled: newValue })
      showMessage('success', t('settings.settingsSaved'))
    } catch (err) {
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  async function handleToggleAutoSync() {
    const newValue = !autoSyncEnabled
    setAutoSyncEnabled(newValue)
    try {
      await updateSettings({ autoSyncEnabled: newValue })
      try { await browser.runtime.sendMessage({ type: 'settings-changed', autoSyncEnabled: newValue }) } catch { /* ignore */ }
      showMessage('success', t('settings.settingsSaved'))
    } catch (err) {
      setAutoSyncEnabled(!newValue)
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  async function handleAutoSyncIntervalChange(minutes: number) {
    const previousValue = autoSyncInterval
    setAutoSyncInterval(minutes)
    try {
      await updateSettings({ autoSyncInterval: minutes })
      if (autoSyncEnabled) {
        try { await browser.runtime.sendMessage({ type: 'settings-changed', autoSyncEnabled: true }) } catch { /* ignore */ }
      }
      showMessage('success', t('settings.settingsSaved'))
    } catch (err) {
      setAutoSyncInterval(previousValue)
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  async function handleBackgroundTypeChange(type: BackgroundSettings['type']) {
    const newBg: BackgroundSettings = { type, remoteUrl: background.remoteUrl, localData: background.localData }
    setBackground(newBg)
    try {
      await updateSettings({ background: newBg })
      showMessage('success', t('settings.backgroundChanged'))
    } catch (err) {
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  async function handleApplyRemoteUrl() {
    const newBg: BackgroundSettings = { type: 'remote', remoteUrl: bgUrlInput, localData: background.localData }
    setBackground(newBg)
    try {
      await updateSettings({ background: newBg })
      showMessage('success', t('settings.backgroundApplied'))
    } catch (err) {
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  function handleLocalImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target?.result as string
      const newBg: BackgroundSettings = { type: 'local', localData: base64, remoteUrl: background.remoteUrl }
      setBackground(newBg)
      try {
        await updateSettings({ background: newBg })
        showMessage('success', t('settings.backgroundApplied'))
      } catch (err) {
        showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleClearLocalImage() {
    const newBg: BackgroundSettings = { type: 'local', localData: undefined, remoteUrl: background.remoteUrl }
    setBackground(newBg)
    try {
      await updateSettings({ background: newBg })
      showMessage('success', t('settings.backgroundCleared'))
    } catch (err) {
      showMessage('error', err instanceof StorageQuotaError ? t('error.storageQuota') : t('error.unknown'))
    }
  }

  return (
    <FadeInUp className="flex-1 p-8 overflow-auto relative z-10">
      <div className="w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 tracking-tight">{t('settings.title')}</h1>

        <Toast messages={messages} onRemove={removeMessage} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 同步信息 */}
          <FadeInUp delay={0.05}>
            <HoverScale className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-medium text-gray-800">{t('settings.syncInfo')}</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">{t('settings.syncMode')}</label>
                    <p className="text-xs text-slate-500 mt-0.5">{t('settings.syncModeDesc')}</p>
                  </div>
                  <span className="px-3 py-1 bg-sky-50 text-sky-600 text-xs rounded-full font-medium">{t('settings.manual')}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">{t('settings.diffPreview')}</label>
                    <p className="text-xs text-slate-500 mt-0.5">{t('settings.diffPreviewDesc')}</p>
                  </div>
                  <Switch enabled={diffPreviewEnabled} onChange={handleToggleDiffPreview} />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">{t('settings.badgeEnabled')}</label>
                    <p className="text-xs text-slate-500 mt-0.5">{t('settings.badgeEnabledDesc')}</p>
                  </div>
                  <Switch enabled={badgeEnabled} onChange={handleToggleBadge} />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">{t('settings.notifyEnabled')}</label>
                    <p className="text-xs text-slate-500 mt-0.5">{t('settings.notifyEnabledDesc')}</p>
                  </div>
                  <Switch enabled={notifyEnabled} onChange={handleToggleNotify} />
                </div>

                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">{t('settings.autoSync')}</label>
                      <p className="text-xs text-slate-500 mt-0.5">{t('settings.autoSyncDesc')}</p>
                    </div>
                    <Switch enabled={autoSyncEnabled} onChange={handleToggleAutoSync} />
                  </div>
                  {autoSyncEnabled && (
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-500">{t('settings.autoSyncInterval')}</label>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {[15, 30, 60, 120, 240].map((min) => (
                          <button
                            key={min}
                            onClick={() => handleAutoSyncIntervalChange(min)}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                              autoSyncInterval === min
                                ? 'bg-sky-50 border-sky-200 text-sky-600'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {min < 60 ? `${min}m` : `${min / 60}h`}
                          </button>
                        ))}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            value={intervalInputValue}
                            onChange={(e) => setIntervalInputValue(e.target.value)}
                            onBlur={() => {
                              const v = parseInt(intervalInputValue, 10)
                              if (!isNaN(v) && v >= 1 && v <= 1440) handleAutoSyncIntervalChange(v)
                              else setIntervalInputValue(String(autoSyncInterval))
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const v = parseInt(intervalInputValue, 10)
                                if (!isNaN(v) && v >= 1 && v <= 1440) handleAutoSyncIntervalChange(v)
                                else setIntervalInputValue(String(autoSyncInterval))
                              }
                            }}
                            className={`w-14 px-2 py-1 text-xs border rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 ${
                              ![15, 30, 60, 120, 240].includes(autoSyncInterval)
                                ? 'border-sky-200 bg-sky-50 text-sky-600'
                                : 'border-gray-200'
                            }`}
                          />
                          <span className="text-xs text-slate-400">{t('settings.autoSyncIntervalUnit')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {lastSyncTime && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-slate-500">
                      {t('popup.lastSync')}: {lastSyncTime}
                    </p>
                  </div>
                )}
              </div>
            </HoverScale>
          </FadeInUp>

          {/* 显示 */}
          <FadeInUp delay={0.1}>
            <HoverScale className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-medium text-gray-800">{t('settings.display')}</h2>
              </div>
              <div className="p-5 space-y-4">
                {/* 语言设置 */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">{t('settings.displayLanguage')}</label>
                    <p className="text-xs text-slate-500 mt-0.5">{t('settings.displayLanguageDesc')}</p>
                  </div>
                  <LanguageCards />
                </div>

                {/* 背景设置 */}
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">{t('settings.background')}</label>
                      <p className="text-xs text-slate-500 mt-0.5">{t('settings.backgroundType')}</p>
                    </div>
                    <div className="flex gap-2">
                      {(['particles', 'remote', 'local', 'none'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => handleBackgroundTypeChange(type)}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${background.type === type
                            ? 'bg-sky-50 border-sky-200 text-sky-600'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                          {t(`settings.background${type.charAt(0).toUpperCase() + type.slice(1)}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 远程图片 URL 输入 */}
                  {background.type === 'remote' && (
                    <div className="mt-3 space-y-2">
                      <input
                        type="url"
                        value={bgUrlInput}
                        onChange={(e) => setBgUrlInput(e.target.value)}
                        placeholder={t('settings.backgroundUrlPlaceholder')}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">{t('settings.backgroundUrlHint')}</p>
                        <button
                          onClick={handleApplyRemoteUrl}
                          disabled={!bgUrlInput}
                          className="px-4 py-1.5 text-xs bg-sky-400 text-white rounded-lg hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('settings.backgroundApply')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 本地图片选择 */}
                  {background.type === 'local' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="px-4 py-1.5 text-xs bg-sky-400 text-white rounded-lg hover:bg-sky-500 transition-colors cursor-pointer">
                          {t('settings.backgroundLocalSelect')}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLocalImageSelect}
                            className="hidden"
                          />
                        </label>
                        {background.localData && (
                          <button
                            onClick={handleClearLocalImage}
                            className="px-4 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:border-gray-300 transition-colors"
                          >
                            {t('settings.backgroundLocalClear')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{t('settings.backgroundLocalHint')}</p>
                      {background.localData && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                          <img src={background.localData} alt="Preview" className="w-full h-24 object-cover" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </HoverScale>
          </FadeInUp>

          {/* 关于 */}
          <FadeInUp delay={0.15} className="lg:col-span-2">
            <HoverScale className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-medium text-gray-800">{t('settings.about')}</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-600 mb-4">
                  {t('settings.aboutDesc')}
                </p>
                <div className="flex items-center gap-4">
                  <a
                    href="https://github.com/AstraSolis/OneBookmark"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-sky-500 hover:text-sky-600 hover:underline"
                  >
                    GitHub →
                  </a>
                  <button
                    onClick={() => {
                      const policyUrl = i18n.language === 'zh-CN'
                        ? 'https://github.com/AstraSolis/OneBookmark/blob/main/PRIVACY_POLICY.md'
                        : 'https://github.com/AstraSolis/OneBookmark/blob/main/PRIVACY_POLICY_EN.md'
                      window.open(policyUrl, '_blank')
                    }}
                    className="text-sm text-sky-500 hover:text-sky-600 hover:underline"
                  >
                    {t('settings.privacyPolicy')} →
                  </button>
                </div>
              </div>
            </HoverScale>
          </FadeInUp>
        </div>
      </div>
    </FadeInUp>
  )
}
