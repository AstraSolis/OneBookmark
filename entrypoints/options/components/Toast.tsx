import { createPortal } from 'react-dom'
import { AnimatePresence, motion, springPresets, CheckIcon, CrossIcon } from '@/lib/motion'

export interface ToastMessage {
  id: string
  type: 'success' | 'error'
  text: string
}

interface ToastProps {
  messages: ToastMessage[]
  onRemove?: (id: string) => void
}

export function Toast({ messages, onRemove }: ToastProps) {
  return createPortal(
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {messages.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 100 }}
            transition={springPresets.bouncy}
            onClick={() => onRemove?.(toast.id)}
            className={`pointer-events-auto cursor-pointer px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm backdrop-blur-sm ${
              toast.type === 'error'
                ? 'bg-red-50/95 text-red-600 border border-red-100'
                : 'bg-sky-50/95 text-sky-600 border border-sky-100'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckIcon className="w-4 h-4 flex-shrink-0" />
              ) : (
                <CrossIcon className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="whitespace-pre-line">{toast.text}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}

// 生成唯一 ID
let toastId = 0
export function createToastId() {
  return `toast-${++toastId}-${Date.now()}`
}
