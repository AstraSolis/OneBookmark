import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, Overlay, ScaleIn } from '@/lib/motion'
import { Portal } from './Portal'
import { CloseIcon, HomeIcon, FolderIcon } from './icons'

interface FolderPickerModalProps {
  isOpen: boolean
  currentPath: string | null
  onClose: () => void
  onSelect: (path: string | null) => void
}

export function FolderPickerModal({ isOpen, currentPath, onClose, onSelect }: FolderPickerModalProps) {
  const { t } = useTranslation()
  const [folders, setFolders] = useState<Array<{ path: string; title: string; depth: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadFolders()
    }
  }, [isOpen])

  async function loadFolders() {
    setLoading(true)
    try {
      const tree = await browser.bookmarks.getTree()
      const result: Array<{ path: string; title: string; depth: number }> = []

      function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string, depth: number) {
        for (const node of nodes) {
          if (!node.url && node.title) {
            const path = `${parentPath}/${node.title}`
            result.push({ path, title: node.title, depth })
            if (node.children) {
              traverse(node.children, path, depth + 1)
            }
          } else if (!node.title && node.children) {
            traverse(node.children, '', depth)
          }
        }
      }

      traverse(tree, '', 0)
      setFolders(result)
    } catch (err) {
      console.error('加载文件夹失败:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <Overlay onClick={onClose} />
            <ScaleIn className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">{t('dashboard.selectFolder')}</h3>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <CloseIcon />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                  <div className="p-4 text-center text-slate-400">{t('common.loading')}</div>
                ) : (
                  <>
                    <button
                      onClick={() => onSelect(null)}
                      className={`w-full p-3 rounded-lg text-left transition-colors flex items-center gap-3 ${
                        currentPath === null ? 'bg-sky-50 text-sky-700' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <HomeIcon />
                      <span className="font-medium">{t('dashboard.rootFolder')}</span>
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.path}
                        onClick={() => onSelect(folder.path)}
                        className={`w-full p-3 rounded-lg text-left transition-colors flex items-center gap-3 ${
                          currentPath === folder.path ? 'bg-sky-50 text-sky-700' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                        style={{ paddingLeft: `${12 + folder.depth * 16}px` }}
                      >
                        <FolderIcon />
                        <span className="truncate">{folder.title}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </ScaleIn>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
