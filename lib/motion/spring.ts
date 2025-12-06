/**
 * Spring 动画配置
 * 基于物理学的弹性动画参数
 */

import type { Transition } from 'motion/react'

// 预设 spring 配置
export const springPresets = {
  // 快速响应，适合小元素（开关、按钮）
  snappy: { type: 'spring', stiffness: 500, damping: 30 } as Transition,
  
  // 标准弹性，适合卡片、面板
  gentle: { type: 'spring', stiffness: 300, damping: 24 } as Transition,
  
  // 柔和弹性，适合页面切换、大面积动画
  soft: { type: 'spring', stiffness: 200, damping: 20 } as Transition,
  
  // 弹跳效果，适合强调动画
  bouncy: { type: 'spring', stiffness: 400, damping: 15 } as Transition,
  
  // 缓慢优雅，适合背景、装饰元素
  slow: { type: 'spring', stiffness: 100, damping: 20 } as Transition,
} as const

// 常用动画变体
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
}

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

export const slideUp = {
  initial: { opacity: 0, y: '100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
}

// 列表项交错动画
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
}

export const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
}
