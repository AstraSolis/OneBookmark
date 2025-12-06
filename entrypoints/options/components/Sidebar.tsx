import { useTranslation } from 'react-i18next'
import { DashboardIcon, SettingsIcon } from './Icons'

interface SidebarProps {
  currentPage: 'dashboard' | 'settings'
  onNavigate: (page: 'dashboard' | 'settings') => void
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  const navItems = [
    { id: 'dashboard' as const, label: t('dashboard.title'), icon: DashboardIcon },
    { id: 'settings' as const, label: t('settings.title'), icon: SettingsIcon },
  ]

  return (
    <aside className="w-56 bg-white/80 backdrop-blur-sm border-r border-gray-100 flex flex-col relative z-10">
      {/* Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <img src="/icon/48.png" alt="Logo" className="w-9 h-9 rounded-xl" />
          <span className="font-bold text-lg text-gray-800 tracking-tight">{t('common.appName')}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${currentPage === item.id
                  ? 'bg-sky-50 text-sky-600 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <item.icon active={currentPage === item.id} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Version */}
      <div className="px-5 py-4 border-t border-slate-100">
        <span className="text-xs text-gray-300 font-medium">v{__APP_VERSION__}</span>
      </div>
    </aside>
  )
}
