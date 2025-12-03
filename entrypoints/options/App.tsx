import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { Settings } from './components/Settings'
import { ParticlesBackground } from './components/ParticlesBackground'

type Page = 'dashboard' | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  return (
    <div className="flex h-screen bg-slate-50 relative overflow-hidden">
      <ParticlesBackground />
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      {currentPage === 'dashboard' ? <Dashboard /> : <Settings />}
    </div>
  )
}

export default App
