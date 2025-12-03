import { useState, useEffect, useRef } from 'react'
import { getConfig, saveConfig } from '@/utils/storage'
import { GistStorage } from '@/lib/storage/gist'
import { SyncEngine, isLocked } from '@/lib/sync'

interface BackupInfo {
  gistId: string | null
  lastSync: string | null
  username: string
  avatarUrl?: string
  gistUrl?: string
}

export function Dashboard() {
  const [backup, setBackup] = useState<BackupInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadBackup()
  }, [])

  async function loadBackup() {
    setLoading(true)
    const config = await getConfig()

    if (config.githubToken) {
      try {
        const storage = new GistStorage(config.githubToken, config.gistId)
        const profile = await storage.getUserProfile()

        setBackup({
          gistId: config.gistId,
          lastSync: config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleString('zh-CN') : null,
          username: profile?.name || 'GitHub User',
          avatarUrl: profile?.avatar_url,
          gistUrl: config.gistId ? `https://gist.github.com/${config.gistId}` : undefined
        })
      } catch {
        setBackup(null)
      }
    } else {
      setBackup(null)
    }
    setLoading(false)
  }

  function handleNewBackup() {
    setEditMode(false)
    setShowModal(true)
  }

  function handleEditBackup() {
    setEditMode(true)
    setShowModal(true)
  }

  async function handleDeleteBackup() {
    if (!confirm('确定要删除此备份配置吗？')) return

    try {
      await saveConfig({ githubToken: '', gistId: null, lastSyncTime: null })
      setBackup(null)
      setMessage({ type: 'success', text: '备份配置已删除' })
    } catch {
      setMessage({ type: 'error', text: '删除失败' })
    }
  }

  async function handleModalSubmit(pat: string, gistId: string) {
    try {
      await saveConfig({ githubToken: pat, gistId: gistId || null })
      await loadBackup()
      setShowModal(false)
      setMessage({ type: 'success', text: editMode ? '备份配置已更新' : '备份配置已添加' })
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    }
  }

  return (
    <div className="flex-1 p-8 overflow-auto animate-fade-in relative z-10">
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">备份列表</h1>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
              {backup ? '1 个备份' : '0 个备份'}
            </span>
          </div>
          <button
            onClick={handleNewBackup}
            className="flex items-center gap-2 px-4 py-2 bg-sky-400 text-white text-sm font-medium rounded-xl hover:bg-sky-500 transition-all shadow-lg shadow-sky-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'}`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
        ) : backup ? (
          <BackupCard backup={backup} onEdit={handleEditBackup} onDelete={handleDeleteBackup} onUpdate={loadBackup} />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm hover:shadow-md transition-all duration-300 animate-slide-up">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-50 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">暂无备份配置</p>
            <p className="text-sm text-slate-400 mt-1">点击「新建」按钮创建你的第一个备份</p>
          </div>
        )}
      </div>
      <NewBackupModal isOpen={showModal} editMode={editMode} onClose={() => setShowModal(false)} onSubmit={handleModalSubmit} />
    </div>
  )
}

interface BackupCardProps {
  backup: BackupInfo
  onEdit: () => void
  onDelete: () => void
  onUpdate: () => void
}

function BackupCard({ backup, onEdit, onDelete, onUpdate }: BackupCardProps) {
  const [syncing, setSyncing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handlePush() {
    if (await isLocked()) {
      console.warn('有其他操作正在进行')
      return
    }
    setSyncing(true)
    try {
      const config = await getConfig()
      const storage = new GistStorage(config.githubToken, config.gistId)
      const engine = new SyncEngine(storage)
      const result = await engine.push()
      if (!result.success) console.error('上传失败:', result.error)
      const gistId = storage.getGistId()
      if (gistId && gistId !== config.gistId) await saveConfig({ gistId })
      onUpdate()
    } catch (err) {
      console.error('上传失败:', err)
    } finally {
      setSyncing(false)
      setShowMenu(false)
    }
  }

  async function handlePull() {
    if (await isLocked()) {
      console.warn('有其他操作正在进行')
      return
    }
    setRestoring(true)
    try {
      const config = await getConfig()
      const storage = new GistStorage(config.githubToken, config.gistId)
      const engine = new SyncEngine(storage)
      const result = await engine.pull()
      if (!result.success) console.error('下载失败:', result.error)
      onUpdate()
    } catch (err) {
      console.error('下载失败:', err)
    } finally {
      setRestoring(false)
      setShowMenu(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group animate-slide-up">
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-sky-100 flex-shrink-0 border-2 border-white shadow-sm">
            {backup.avatarUrl ? (
              <img src={backup.avatarUrl} alt={backup.username} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sky-500 font-bold text-lg">G</div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-slate-800">GitHub Gist</span>
              <span className="px-2 py-0.5 bg-sky-50 text-sky-600 text-xs rounded-md font-medium border border-sky-100">当前</span>
            </div>
            {backup.gistUrl ? (
              <a href={backup.gistUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-500 hover:text-sky-600 hover:underline flex items-center gap-1">
                查看 Gist
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              <span className="text-sm text-slate-400">未关联 Gist</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-400">上次使用</div>
            <div className="text-sm font-medium text-slate-700">{backup.lastSync || '从未'}</div>
          </div>
          <div className="flex items-center gap-2 pl-4 border-l border-slate-100">
            <button onClick={onEdit} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="编辑">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={onDelete} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="删除">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                  <button onClick={handlePush} disabled={syncing} className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
                    {syncing ? <Spinner /> : <UploadIcon />}
                    {syncing ? '上传中...' : '上传'}
                  </button>
                  <button onClick={handlePull} disabled={restoring} className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
                    {restoring ? <Spinner /> : <DownloadIcon />}
                    {restoring ? '下载中...' : '下载'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

interface NewBackupModalProps {
  isOpen: boolean
  editMode: boolean
  onClose: () => void
  onSubmit: (pat: string, gistId: string) => void
}

function NewBackupModal({ isOpen, editMode, onClose, onSubmit }: NewBackupModalProps) {
  const [pat, setPat] = useState('')
  const [gistId, setGistId] = useState('')
  const [testing, setTesting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false)
      setTestResult(null)
      if (editMode) {
        getConfig().then(config => {
          setPat(config.githubToken || '')
          setGistId(config.gistId || '')
        })
      } else {
        setPat('')
        setGistId('')
      }
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, editMode])

  function handleClose() {
    setIsClosing(true)
    setTimeout(() => onClose(), 200)
  }

  async function handleTest() {
    if (!pat.trim()) {
      setTestResult({ success: false, message: '请输入 GitHub PAT' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const storage = new GistStorage(pat.trim())
      const profile = await storage.getUserProfile()
      if (profile) {
        setTestResult({ success: true, message: `认证成功 (用户: ${profile.name})` })
      } else {
        setTestResult({ success: false, message: 'Token 无效或已过期' })
      }
    } catch {
      setTestResult({ success: false, message: '连接失败，请检查网络' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit() {
    if (!pat.trim()) {
      setTestResult({ success: false, message: '请输入 GitHub PAT' })
      return
    }
    setCreating(true)
    try {
      const storage = new GistStorage(pat.trim())
      const profile = await storage.getUserProfile()
      if (!profile) {
        setTestResult({ success: false, message: 'Token 无效或已过期' })
        return
      }
      onSubmit(pat.trim(), gistId.trim())
    } catch {
      setTestResult({ success: false, message: '验证失败' })
    } finally {
      setCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className={`absolute inset-0 bg-black/50 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`} onClick={handleClose} />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 ${isClosing ? 'animate-zoom-out' : 'animate-zoom-in'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">{editMode ? '编辑备份' : '新建备份'}</h3>
          <button onClick={handleClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">备份方法</label>
            <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-slate-800">GitHub Gist</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Personal Access Token <span className="text-red-500">*</span></label>
            <input ref={inputRef} type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="ghp_..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all" />
            <p className="mt-1.5 text-xs text-slate-400">
              需要 gist 权限。
              <a href="https://github.com/settings/tokens/new?scopes=gist&description=OneBookmark" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline ml-1">创建 Token →</a>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Gist ID</label>
            <input type="text" value={gistId} onChange={(e) => setGistId(e.target.value)} placeholder="留空则自动创建新 Gist" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all" />
            <p className="mt-1.5 text-xs text-slate-400">
              可选，留空将在首次上传时自动创建。
              <a href="https://gist.github.com/" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline ml-1">查看我的 Gist →</a>
            </p>
          </div>
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'}`}>{testResult.message}</div>
          )}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={handleTest} disabled={testing} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50">
            {testing ? '测试中...' : '测试连接'}
          </button>
          <div className="flex gap-3">
            <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">取消</button>
            <button onClick={handleSubmit} disabled={creating || !pat.trim()} className="px-4 py-2 bg-sky-400 text-white text-sm font-medium rounded-xl hover:bg-sky-500 transition-all shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
              {creating ? '保存中...' : (editMode ? '保存' : '创建')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
