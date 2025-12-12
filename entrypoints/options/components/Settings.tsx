import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getEnabledBackups, getSettings, updateSettings, type BackgroundSettings } from '@/utils/storage'
import { LanguageCards } from '@/lib/i18n/LanguageCards'
import { FadeInUp, HoverScale, Switch } from '@/lib/motion'
import { Toast, createToastId, type ToastMessage } from './Toast'

export function Settings() {
  const { t, i18n } = useTranslation()
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [diffPreviewEnabled, setDiffPreviewEnabled] = useState(false)
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

  async function loadConfig() {
    const backups = await getEnabledBackups()
    const times = backups.map(b => b.lastSyncTime).filter((t): t is number => t !== null)
    if (times.length > 0) {
      setLastSyncTime(new Date(Math.max(...times)).toLocaleString(i18n.language))
    }

    const settings = await getSettings()
    setDiffPreviewEnabled(settings.diffPreviewEnabled)
    setBackground(settings.background || { type: 'particles' })
    setBgUrlInput(settings.background?.remoteUrl || '')
  }

  async function handleToggleDiffPreview() {
    const newValue = !diffPreviewEnabled
    setDiffPreviewEnabled(newValue)
    await updateSettings({ diffPreviewEnabled: newValue })
    showMessage('success', t('settings.settingsSaved'))
  }

  async function handleBackgroundTypeChange(type: BackgroundSettings['type']) {
    const newBg: BackgroundSettings = { type, remoteUrl: background.remoteUrl, localData: background.localData }
    setBackground(newBg)
    await updateSettings({ background: newBg })
    showMessage('success', t('settings.backgroundChanged'))
  }

  async function handleApplyRemoteUrl() {
    const newBg: BackgroundSettings = { type: 'remote', remoteUrl: bgUrlInput, localData: background.localData }
    setBackground(newBg)
    await updateSettings({ background: newBg })
    showMessage('success', t('settings.backgroundApplied'))
  }

  function handleLocalImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target?.result as string
      const newBg: BackgroundSettings = { type: 'local', localData: base64, remoteUrl: background.remoteUrl }
      setBackground(newBg)
      await updateSettings({ background: newBg })
      showMessage('success', t('settings.backgroundApplied'))
    }
    reader.readAsDataURL(file)
  }

  async function handleClearLocalImage() {
    const newBg: BackgroundSettings = { type: 'local', localData: undefined, remoteUrl: background.remoteUrl }
    setBackground(newBg)
    await updateSettings({ background: newBg })
    showMessage('success', t('settings.backgroundCleared'))
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
