import { useState, useEffect } from 'react'
import { LayoutGroup } from '@/lib/motion'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { Settings } from './components/Settings'
import { ParticlesBackground } from './components/ParticlesBackground'

type Page = 'dashboard' | 'settings'

// 解析 URL hash 参数
function parseHashParams(): { action?: 'push' | 'pull'; backupId?: string } {
  const hash = window.location.hash.slice(1)
  const params = new URLSearchParams(hash)
  const action = params.get('action')
  return {
    action: action === 'push' || action === 'pull' ? action : undefined,
    backupId: params.get('backupId') || undefined
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [initialAction, setInitialAction] = useState<{ action?: 'push' | 'pull'; backupId?: string }>({})

  useEffect(() => {
    const params = parseHashParams()
    if (params.action) {
      setInitialAction(params)
      // 清除 URL hash，避免刷新时重复触发
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  return (
    <LayoutGroup>
      <div className="flex h-screen bg-slate-50 relative overflow-hidden">
        <ParticlesBackground />
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        {currentPage === 'dashboard' ? (
          <Dashboard initialAction={initialAction} onActionHandled={() => setInitialAction({})} />
        ) : (
          <Settings />
        )}
      </div>
    </LayoutGroup>
  )
}

export default App
