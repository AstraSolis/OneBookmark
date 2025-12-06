import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const LANGUAGE_KEY = 'onebookmark_language'

export const supportedLanguages = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en', name: 'English' },
] as const

export type LanguageCode = (typeof supportedLanguages)[number]['code']

// 获取存储的语言设置
async function getStoredLanguage(): Promise<LanguageCode | null> {
  try {
    const result = await browser.storage.local.get(LANGUAGE_KEY)
    return result[LANGUAGE_KEY] || null
  } catch {
    return null
  }
}

// 保存语言设置
export async function setLanguage(lang: LanguageCode): Promise<void> {
  await browser.storage.local.set({ [LANGUAGE_KEY]: lang })
  await i18n.changeLanguage(lang)
}

// 获取当前语言
export function getCurrentLanguage(): LanguageCode {
  return i18n.language as LanguageCode
}

// 检测浏览器语言
function detectBrowserLanguage(): LanguageCode {
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) return 'zh-CN'
  return 'en'
}

// 初始化 i18n
export async function initI18n(): Promise<void> {
  const storedLang = await getStoredLanguage()
  const defaultLang = storedLang || detectBrowserLanguage()

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    lng: defaultLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })
}

export default i18n
