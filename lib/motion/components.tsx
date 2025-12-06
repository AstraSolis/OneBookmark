/**
 * Motion 动画组件
 * 封装常用动画模式，提供声明式 API
 */

import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react'
import type { HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
import { springPresets, fadeInUp, fadeIn, scaleIn, slideUp, staggerContainer, staggerItem } from './spring'

// 无障碍：减少动画 hook
export { useReducedMotion }

// 淡入上移动画容器
export function FadeInUp({ 
  children, 
  delay = 0,
  className,
  ...props 
}: { 
  children: ReactNode
  delay?: number
  className?: string
} & Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'transition'>) {
  const shouldReduceMotion = useReducedMotion()
  
  return (
    <motion.div
      {...(shouldReduceMotion ? fadeIn : fadeInUp)}
      transition={{ ...springPresets.gentle, delay: shouldReduceMotion ? 0 : delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// 缩放淡入动画（适合弹窗）
export function ScaleIn({ 
  children, 
  className,
  ...props 
}: { 
  children: ReactNode
  className?: string
} & Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'>) {
  return (
    <motion.div
      {...scaleIn}
      transition={springPresets.snappy}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// 底部滑入动画（适合移动端弹窗）
export function SlideUp({ 
  children, 
  className,
  ...props 
}: { 
  children: ReactNode
  className?: string
} & Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'>) {
  return (
    <motion.div
      {...slideUp}
      transition={springPresets.gentle}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// 弹窗遮罩
export function Overlay({ 
  onClick,
  className = '',
}: { 
  onClick?: () => void
  className?: string
}) {
  return (
    <motion.div
      {...fadeIn}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`absolute inset-0 bg-black/50 ${className}`}
    />
  )
}

// 弹窗容器（包含遮罩 + 内容动画）
export function Modal({ 
  isOpen, 
  onClose, 
  children,
  variant = 'center',
}: { 
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  variant?: 'center' | 'bottom'
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <Overlay onClick={onClose} />
          {variant === 'center' ? (
            <ScaleIn className="relative">{children}</ScaleIn>
          ) : (
            <div className="absolute inset-x-0 bottom-0">
              <SlideUp>{children}</SlideUp>
            </div>
          )}
        </div>
      )}
    </AnimatePresence>
  )
}

// 底部弹窗（适合 popup 等小窗口场景）
export function BottomSheet({
  isOpen,
  onClose,
  children,
  className = '',
}: {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-50 flex items-end">
          <Overlay onClick={onClose} className="absolute" />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springPresets.gentle}
            className={`relative w-full bg-white rounded-t-2xl ${className}`}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// 列表容器（支持交错动画）
export function StaggerList({ 
  children, 
  className,
}: { 
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={className}
    >
      {children}
    </motion.div>
  )
}

// 列表项
export function StaggerItem({ 
  children, 
  className,
  ...props
}: { 
  children: ReactNode
  className?: string
} & Omit<HTMLMotionProps<'div'>, 'variants' | 'transition'>) {
  return (
    <motion.div
      variants={staggerItem}
      transition={springPresets.gentle}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// 开关动画组件
export function Switch({ 
  enabled, 
  onChange,
  size = 'md',
}: { 
  enabled: boolean
  onChange: () => void
  size?: 'sm' | 'md'
}) {
  const sizes = {
    sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 14, top: 'top-0.5' },
    md: { track: 'w-11 h-6', thumb: 'w-4 h-4', translate: 20, top: 'top-1' },
  }
  const s = sizes[size]
  
  return (
    <button
      onClick={onChange}
      className={`relative ${s.track} rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-sky-400' : 'bg-gray-300'}`}
    >
      <motion.span
        animate={{ x: enabled ? s.translate : 0 }}
        transition={springPresets.snappy}
        className={`absolute ${s.top} left-0.5 ${s.thumb} bg-white rounded-full shadow`}
      />
    </button>
  )
}

// 悬停缩放效果
export function HoverScale({ 
  children, 
  scale = 1.02,
  y = -4,
  className,
  ...props
}: { 
  children: ReactNode
  scale?: number
  y?: number
  className?: string
} & Omit<HTMLMotionProps<'div'>, 'whileHover' | 'transition'>) {
  const shouldReduceMotion = useReducedMotion()
  
  return (
    <motion.div
      whileHover={shouldReduceMotion ? undefined : { scale, y }}
      transition={springPresets.snappy}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// 按钮点击+悬停效果
export function PressScale({ 
  children, 
  className,
  onClick,
  disabled,
  hoverScale = 1.05,
  hoverY = -3,
  ...props
}: { 
  children: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  hoverScale?: number
  hoverY?: number
} & Omit<HTMLMotionProps<'button'>, 'whileTap' | 'whileHover' | 'transition'>) {
  const shouldReduceMotion = useReducedMotion()
  
  return (
    <motion.button
      whileHover={disabled || shouldReduceMotion ? undefined : { scale: hoverScale, y: hoverY }}
      whileTap={disabled || shouldReduceMotion ? undefined : { scale: 0.95 }}
      transition={springPresets.bouncy}
      onClick={onClick}
      disabled={disabled}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  )
}

// 数字滚动动画
export function AnimatedNumber({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springPresets.snappy}
      className={className}
    >
      {value}
    </motion.span>
  )
}

// 成功打勾动画
export function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springPresets.bouncy}
    >
      <motion.path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      />
    </motion.svg>
  )
}

// 错误叉号动画
export function CrossIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      initial={{ scale: 0, opacity: 0, rotate: -90 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={springPresets.bouncy}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </motion.svg>
  )
}

// 加载骨架屏
export function Skeleton({
  className = '',
  variant = 'rect',
}: {
  className?: string
  variant?: 'rect' | 'circle' | 'text'
}) {
  const variantClass = {
    rect: 'rounded-lg',
    circle: 'rounded-full',
    text: 'rounded h-4',
  }

  return (
    <motion.div
      className={`bg-gray-200 ${variantClass[variant]} ${className}`}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

// 页面切换容器
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={springPresets.gentle}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// 导出 motion 相关组件供外部使用
export { AnimatePresence, LayoutGroup, motion }
