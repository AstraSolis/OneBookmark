import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isLocked, pushBookmarks, pullBookmarks, getBookmarksForBackup, getErrorI18nKey, type ErrorType } from '@/lib/sync'
import { htmlFormat } from '@/lib/bookmark/formats'
import { FadeInUp, HoverScale, AnimatePresence, Switch, motion, springPresets } from '@/lib/motion'
import { Spinner, UploadIcon, DownloadIcon, ExportIcon, EditIcon, DeleteIcon, MoreIcon, ExternalLinkIcon } from './icons'
import type { BackupWithProfile } from './types'

// 根据错误类型获取 i18n 消息
function getErrorMessage(t: (key: string) => string, errorType?: ErrorType, fallbackKey?: string): string {
  if (errorType) {
    return t(getErrorI18nKey(errorType))
  }
  return t(fallbackKey || 'error.unknown')
}

interface BackupCardProps {
  backup: BackupWithProfile
  index: number
  onEdit: () => void
  onDelete: () => void
  onToggleUpload: () => void
  onToggleDownload: () => void
  onUpdate: () => void
  onMessage: (type: 'success' | 'error', text: string) => void
}

export function BackupCard({ backup, index, onEdit, onDelete, onToggleUpload, onToggleDownload, onUpdate, onMessage }: BackupCardProps) {
  const { t } = useTranslation()
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
      onMessage('error', t('popup.operationLocked'))
      return
    }
    setSyncing(true)
    const result = await pushBookmarks(backup)
    if (result.success) {
      const { added = 0, removed = 0 } = result.diff || {}
      if (added === 0 && removed === 0) {
        onMessage('success', t('popup.uploadSuccessNoChanges'))
      } else {
        onMessage('success', t('popup.uploadSuccess', { name: backup.name, added, removed }))
      }
    } else {
      onMessage('error', getErrorMessage(t, result.errorType, 'popup.uploadFailed'))
    }
    onUpdate()
    setSyncing(false)
    setShowMenu(false)
  }

  async function handlePull() {
    if (await isLocked()) {
      onMessage('error', t('popup.operationLocked'))
      return
    }
    setRestoring(true)
    const result = await pullBookmarks(backup)
    if (result.success) {
      onMessage('success', t('popup.downloadSuccess'))
    } else {
      onMessage('error', getErrorMessage(t, result.errorType, 'popup.downloadFailed'))
    }
    onUpdate()
    setRestoring(false)
    setShowMenu(false)
  }

  async function handleExportHtml() {
    try {
      const bookmarks = await getBookmarksForBackup(backup)
      const html = htmlFormat.serialize(bookmarks)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bookmarks-${backup.name}-${new Date().toISOString().slice(0, 10)}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出失败:', err)
    } finally {
      setShowMenu(false)
    }
  }

  const lastSync = backup.lastSyncTime
    ? new Date(backup.lastSyncTime).toLocaleString()
    : null

  return (
    <FadeInUp delay={index * 0.05}>
      <HoverScale className={`bg-white rounded-2xl border shadow-sm ${backup.enabled ? 'border-gray-100' : 'border-gray-200 opacity-60'} ${showMenu ? 'z-50 relative' : ''}`}>
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
                <span className="font-semibold text-slate-800">{backup.name}</span>
                {backup.folderPath && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-md font-medium border border-amber-100" title={backup.folderPath}>
                    {backup.folderPath.split('/').pop()}
                  </span>
                )}
                {backup.uploadEnabled !== false && (
                  <span className="px-2 py-0.5 bg-sky-50 text-sky-600 text-xs rounded-md font-medium border border-sky-100">{t('popup.upload')}</span>
                )}
                {backup.downloadEnabled !== false && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-md font-medium border border-emerald-100">{t('popup.download')}</span>
                )}
              </div>
              {backup.gistUrl ? (
                <a href={backup.gistUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-500 hover:text-sky-600 hover:underline flex items-center gap-1">
                  {t('dashboard.viewGist')}
                  <ExternalLinkIcon />
                </a>
              ) : (
                <span className="text-sm text-slate-400">{t('dashboard.noGist')}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-400">{t('dashboard.lastSync')}</div>
              <div className="text-sm font-medium text-slate-700">{lastSync || t('dashboard.never')}</div>
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-slate-100">
              <button onClick={onEdit} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title={t('common.edit')}>
                <EditIcon />
              </button>
              <button onClick={onDelete} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title={t('common.delete')}>
                <DeleteIcon />
              </button>
              <div className="relative" ref={menuRef}>
                <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <MoreIcon />
                </button>
                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={springPresets.snappy}
                      className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50"
                    >
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                        <button onClick={handlePush} disabled={syncing} className="flex items-center gap-2 text-sm text-slate-700 disabled:opacity-50">
                          {syncing ? <Spinner /> : <UploadIcon />}
                          {syncing ? t('popup.uploading') : t('popup.upload')}
                        </button>
                        <Switch size="sm" enabled={backup.uploadEnabled !== false} onChange={onToggleUpload} />
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                        <button onClick={handlePull} disabled={restoring} className="flex items-center gap-2 text-sm text-slate-700 disabled:opacity-50">
                          {restoring ? <Spinner /> : <DownloadIcon />}
                          {restoring ? t('popup.downloading') : t('popup.download')}
                        </button>
                        <Switch size="sm" enabled={backup.downloadEnabled !== false} onChange={onToggleDownload} />
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <button onClick={handleExportHtml} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        <ExportIcon />
                        {t('dashboard.exportHtml')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </HoverScale>
    </FadeInUp>
  )
}
