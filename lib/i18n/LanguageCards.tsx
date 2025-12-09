import { useLanguage } from './useLanguage'
import { motion } from '@/lib/motion'
import { springPresets } from '@/lib/motion'

export function LanguageCards() {
  const { currentLang, changeLang, languages } = useLanguage()

  return (
    <div className="flex gap-2">
      {languages.map((lang) => (
        <motion.button
          key={lang.code}
          onClick={() => changeLang(lang.code)}
          whileTap={{ scale: 0.97 }}
          transition={springPresets.snappy}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            currentLang === lang.code
              ? 'border-sky-200 bg-sky-50 text-sky-600'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          {lang.name}
        </motion.button>
      ))}
    </div>
  )
}
