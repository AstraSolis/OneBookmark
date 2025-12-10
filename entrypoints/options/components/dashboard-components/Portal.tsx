import { createPortal } from 'react-dom'

// Portal 包装组件，将内容渲染到 body
export function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}
