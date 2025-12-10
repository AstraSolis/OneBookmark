import { useTranslation } from 'react-i18next'
import type { DiffResult, DiffItem } from '@/lib/bookmark/diff'
import { AnimatePresence, Overlay, ScaleIn, PressScale, motion, springPresets } from '@/lib/motion'
import { Portal } from './Portal'
import { CloseIcon } from './icons'

interface DiffPreviewModalProps {
  isOpen: boolean
  diff: DiffResult | null
  action: 'push' | 'pull' | null
  backupName?: string
  hasMoreBackups?: boolean
  onConfirm: () => void
  onSkip: () => void
  onCancelAll: () => void
}

export function DiffPreviewModal({
  isOpen,
  diff,
  action,
  backupName,
  hasMoreBackups,
  onConfirm,
  onSkip,
  onCancelAll,
}: DiffPreviewModalProps) {
  const { t } = useTranslation()

  const totalChanges = diff ? diff.added.length + diff.removed.length + diff.modified.length : 0
  const actionDesc = action === 'push' ? t('popup.uploadOverwrite') : t('popup.downloadOverwrite')

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && diff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <Overlay onClick={hasMoreBackups ? onSkip : onCancelAll} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-800">
                      {action === 'push' ? t('popup.confirmUpload') : t('popup.confirmDownload')}
                    </h3>
                    {backupName && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                        {backupName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{actionDesc}</p>
                </div>
                <button
                  onClick={hasMoreBackups ? onSkip : onCancelAll}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <CloseIcon />
                </button>
              </div>

              {/* 统计信息 */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                <span className="text-sm text-slate-600">{t('popup.totalChanges', { count: totalChanges })}:</span>
                {diff.added.length > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                    +{diff.added.length}
                  </span>
                )}
                {diff.removed.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">-{diff.removed.length}</span>
                )}
                {diff.modified.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                    ~{diff.modified.length}
                  </span>
                )}
              </div>

              {/* 差异列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {diff.added.map((item, i) => (
                  <DiffItemRow key={`add-${i}`} item={item} index={i} />
                ))}
                {diff.removed.map((item, i) => (
                  <DiffItemRow key={`rm-${i}`} item={item} index={diff.added.length + i} />
                ))}
                {diff.modified.map((item, i) => (
                  <DiffItemRow key={`mod-${i}`} item={item} index={diff.added.length + diff.removed.length + i} />
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                {hasMoreBackups ? (
                  <>
                    <PressScale
                      onClick={onCancelAll}
                      className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      {t('common.cancelAll')}
                    </PressScale>
                    <PressScale
                      onClick={onSkip}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {t('common.skip')}
                    </PressScale>
                  </>
                ) : (
                  <PressScale
                    onClick={onCancelAll}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    {t('common.cancel')}
                  </PressScale>
                )}
                <PressScale
                  onClick={onConfirm}
                  className={`px-4 py-2 text-white text-sm font-medium rounded-xl transition-colors shadow-lg ${
                    action === 'push'
                      ? 'bg-sky-400 hover:bg-sky-500 shadow-sky-200'
                      : 'bg-emerald-400 hover:bg-emerald-500 shadow-emerald-200'
                  }`}
                >
                  {action === 'push' ? t('popup.confirmUpload') : t('popup.confirmDownload')}
                </PressScale>
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

// 差异项行
function DiffItemRow({ item, index }: { item: DiffItem; index: number }) {
  const { t } = useTranslation()
  const bgColor = item.type === 'added' ? 'bg-emerald-50 border-emerald-200' :
                  item.type === 'removed' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
  const textColor = item.type === 'added' ? 'text-emerald-700' :
                    item.type === 'removed' ? 'text-red-700' :
                    'text-amber-700'
  const icon = item.type === 'added' ? '+' : item.type === 'removed' ? '-' : '~'

  function getDisplayTitle(title: string | undefined, url: string | undefined): string {
    if (title) return title
    if (url) {
      try {
        return new URL(url).hostname
      } catch {
        return t('dashboard.noTitle')
      }
    }
    return t('dashboard.noTitle')
  }

  const displayTitle = getDisplayTitle(item.title, item.url)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springPresets.gentle, delay: index * 0.03 }}
      className={`p-3 rounded-lg border ${bgColor}`}
    >
      <div className="flex items-start gap-2">
        <span className={`font-mono font-bold ${textColor}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 truncate">{displayTitle}</span>
            {item.path.length > 0 && (
              <span className="text-xs text-slate-400 truncate">({item.path.join(' / ')})</span>
            )}
          </div>
          {item.url && (
            <div className="text-xs text-slate-500 truncate mt-0.5">{item.url}</div>
          )}
          {item.type === 'modified' && item.oldTitle && (
            <div className="text-xs text-red-400 line-through truncate mt-0.5">{t('dashboard.originalTitle')}: {item.oldTitle || t('dashboard.noTitle')}</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
