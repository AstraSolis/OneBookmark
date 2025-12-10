import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GistStorage } from '@/lib/storage/gist'
import { AnimatePresence, Overlay, ScaleIn, PressScale, motion, springPresets } from '@/lib/motion'
import { Portal } from './Portal'
import { FolderPickerModal } from './FolderPickerModal'
import { CloseIcon } from './icons'
import type { BackupConfig } from '@/utils/storage'
import type { BackupFormData } from './types'

interface BackupModalProps {
  isOpen: boolean
  editingBackup: BackupConfig | null
  onClose: () => void
  onSubmit: (data: BackupFormData) => void
}

export function BackupModal({ isOpen, editingBackup, onClose, onSubmit }: BackupModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [gistId, setGistId] = useState('')
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [testing, setTesting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTestResult(null)
      if (editingBackup) {
        setName(editingBackup.name || '')
        setToken(editingBackup.token || '')
        setGistId(editingBackup.gistId || '')
        setFolderPath(editingBackup.folderPath || null)
      } else {
        setName('')
        setToken('')
        setGistId('')
        setFolderPath(null)
      }
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, editingBackup])

  async function handleTest() {
    if (!token.trim()) {
      setTestResult({ success: false, message: t('dashboard.tokenRequired') })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const storage = new GistStorage(token.trim())
      const profile = await storage.getUserProfile()
      if (profile) {
        setTestResult({ success: true, message: t('dashboard.authSuccess', { name: profile.name }) })
      } else {
        setTestResult({ success: false, message: t('dashboard.tokenInvalid') })
      }
    } catch {
      setTestResult({ success: false, message: t('dashboard.connectionFailed') })
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit() {
    if (!token.trim()) {
      setTestResult({ success: false, message: t('dashboard.tokenRequired') })
      return
    }
    setCreating(true)
    try {
      const storage = new GistStorage(token.trim())
      const profile = await storage.getUserProfile()
      if (!profile) {
        setTestResult({ success: false, message: t('dashboard.tokenInvalid') })
        return
      }
      onSubmit({
        name: name.trim() || 'GitHub Gist',
        token: token.trim(),
        gistId: gistId.trim(),
        folderPath
      })
    } catch {
      setTestResult({ success: false, message: t('dashboard.verifyFailed') })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <Overlay onClick={onClose} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">
                  {editingBackup ? t('dashboard.editBackup') : t('dashboard.newBackup')}
                </h3>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <CloseIcon />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.backupName')}</label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="GitHub Gist"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.backupMethod')}</label>
                  <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-slate-800">GitHub Gist</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.token')} <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t('dashboard.tokenHint')}
                    <a href="https://github.com/settings/tokens/new?scopes=gist&description=OneBookmark" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline ml-1">{t('dashboard.createToken')}</a>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.gistId')}</label>
                  <input
                    type="text"
                    value={gistId}
                    onChange={(e) => setGistId(e.target.value)}
                    placeholder={t('dashboard.gistIdPlaceholder')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400 text-sm transition-all"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t('dashboard.gistIdHint')}
                    <a href="https://gist.github.com/" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline ml-1">{t('dashboard.viewMyGist')}</a>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('dashboard.folderPath')}</label>
                  <button
                    type="button"
                    onClick={() => setShowFolderPicker(true)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-left text-sm transition-all hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400"
                  >
                    {folderPath ? (
                      <span className="text-slate-800">{folderPath}</span>
                    ) : (
                      <span className="text-slate-400">{t('dashboard.rootFolder')}</span>
                    )}
                  </button>
                  <p className="mt-1.5 text-xs text-slate-400">{t('dashboard.folderPathHint')}</p>
                </div>
                <AnimatePresence>
                  {testResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={springPresets.snappy}
                      className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'}`}
                    >
                      {testResult.message}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                <PressScale onClick={handleTest} disabled={testing} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50">
                  {testing ? t('dashboard.testing') : t('dashboard.testConnection')}
                </PressScale>
                <div className="flex gap-3">
                  <PressScale onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">{t('common.cancel')}</PressScale>
                  <PressScale onClick={handleSubmit} disabled={creating || !token.trim()} className="px-4 py-2 bg-sky-400 text-white text-sm font-medium rounded-xl hover:bg-sky-500 transition-colors shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
                    {creating ? t('dashboard.saving') : (editingBackup ? t('common.save') : t('dashboard.create'))}
                  </PressScale>
                </div>
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
      <FolderPickerModal
        isOpen={showFolderPicker}
        currentPath={folderPath}
        onClose={() => setShowFolderPicker(false)}
        onSelect={(path) => {
          setFolderPath(path)
          setShowFolderPicker(false)
        }}
      />
    </Portal>
  )
}
