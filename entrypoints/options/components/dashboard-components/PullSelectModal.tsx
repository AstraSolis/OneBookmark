import { useTranslation } from 'react-i18next'
import { AnimatePresence, Overlay, ScaleIn, motion, springPresets } from '@/lib/motion'
import { Portal } from './Portal'
import { CloseIcon, DownloadIcon } from './icons'
import type { BackupWithProfile } from './types'

interface PullSelectModalProps {
  isOpen: boolean
  backups: BackupWithProfile[]
  onClose: () => void
  onSelect: (backup: BackupWithProfile) => void
}

export function PullSelectModal({ isOpen, backups, onClose, onSelect }: PullSelectModalProps) {
  const { t } = useTranslation()

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <Overlay onClick={onClose} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">{t('dashboard.selectSource')}</h3>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <CloseIcon />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {backups.map((backup, index) => (
                  <motion.button
                    key={backup.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springPresets.gentle, delay: index * 0.05 }}
                    onClick={() => onSelect(backup)}
                    className="w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-left transition-colors flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-sky-100 flex-shrink-0">
                      {backup.avatarUrl ? (
                        <img src={backup.avatarUrl} alt={backup.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sky-500 font-bold">G</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{backup.name}</div>
                      <div className="text-xs text-slate-400">
                        {backup.lastSyncTime
                          ? `${t('dashboard.lastSync')}: ${new Date(backup.lastSyncTime).toLocaleString()}`
                          : t('popup.neverSynced')}
                      </div>
                    </div>
                    <DownloadIcon />
                  </motion.button>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                <p className="text-xs text-slate-400 text-center">{t('dashboard.selectSourceHint')}</p>
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
