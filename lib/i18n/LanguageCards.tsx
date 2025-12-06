import { useLanguage } from './useLanguage'

export function LanguageCards() {
  const { currentLang, changeLang, languages } = useLanguage()

  return (
    <div className="flex gap-3 mt-6">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => changeLang(lang.code)}
          className={`px-6 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
            currentLang === lang.code
              ? 'border-sky-400 bg-sky-50 text-sky-600'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {lang.name}
        </button>
      ))}
    </div>
  )
}
