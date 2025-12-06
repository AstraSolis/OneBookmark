import { useLanguage } from './useLanguage'
import { motion } from '@/lib/motion'
import { springPresets } from '@/lib/motion'

export function LanguageCards() {
  const { currentLang, changeLang, languages } = useLanguage()

  return (
    <div className="flex gap-3 mt-6">
      {languages.map((lang) => (
        <motion.button
          key={lang.code}
          onClick={() => changeLang(lang.code)}
          whileTap={{ scale: 0.97 }}
          transition={springPresets.snappy}
          className={`px-6 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
            currentLang === lang.code
              ? 'border-sky-400 bg-sky-50 text-sky-600'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {lang.name}
        </motion.button>
      ))}
    </div>
  )
}
