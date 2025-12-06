import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { setLanguage, supportedLanguages, type LanguageCode } from './index'

export function useLanguage() {
  const { i18n } = useTranslation()
  const [currentLang, setCurrentLang] = useState<LanguageCode>(i18n.language as LanguageCode)

  useEffect(() => {
    const handleChange = (lng: string) => {
      setCurrentLang(lng as LanguageCode)
    }
    i18n.on('languageChanged', handleChange)
    return () => {
      i18n.off('languageChanged', handleChange)
    }
  }, [i18n])

  const changeLang = useCallback(async (lang: LanguageCode) => {
    await setLanguage(lang)
  }, [])

  return {
    currentLang,
    changeLang,
    languages: supportedLanguages,
  }
}
