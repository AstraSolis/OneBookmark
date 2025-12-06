import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getEnabledBackups, getSettings, updateSettings } from '@/utils/storage'
import { LanguageCards } from '@/lib/i18n/LanguageCards'

export function Settings() {
  const { t, i18n } = useTranslation()
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [diffPreviewEnabled, setDiffPreviewEnabled] = useState(false)

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
  }

  async function handleToggleDiffPreview() {
    const newValue = !diffPreviewEnabled
    setDiffPreviewEnabled(newValue)
    await updateSettings({ diffPreviewEnabled: newValue })
  }

  return (
    <div className="flex-1 p-8 overflow-auto animate-fade-in relative z-10">
      <div className="w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 tracking-tight">{t('settings.title')}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 同步信息 */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden animate-slide-up" style={{ animationDelay: '0.1s' }}>
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
                <button
                  onClick={handleToggleDiffPreview}
                  className={`relative w-11 h-6 rounded-full transition-colors ${diffPreviewEnabled ? 'bg-sky-400' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${diffPreviewEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {lastSyncTime && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-slate-500">
                    {t('popup.lastSync')}: {lastSyncTime}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* 语言 */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-medium text-gray-800">{t('settings.language')}</h2>
            </div>
            <div className="p-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">{t('settings.displayLanguage')}</label>
                <p className="text-xs text-slate-500 mt-0.5">{t('settings.displayLanguageDesc')}</p>
              </div>
              <LanguageCards />
            </div>
          </section>

          {/* 关于 */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden animate-slide-up lg:col-span-2" style={{ animationDelay: '0.2s' }}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-medium text-gray-800">{t('settings.about')}</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 mb-4">
                {t('settings.aboutDesc')}
              </p>
              <a
                href="https://github.com/AstraSolis/OneBookmark"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-500 hover:text-sky-600 hover:underline"
              >
                GitHub →
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
