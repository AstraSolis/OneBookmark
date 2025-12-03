// 同步锁（防止并发操作）

const SYNC_LOCK_KEY = 'onebookmark_sync_lock'
const LOCK_TIMEOUT_MS = 30000

interface LockInfo {
  holder: string
  acquiredAt: number
  operation: string
}

function generateLockId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

async function getLockInfo(): Promise<LockInfo | null> {
  const result = await browser.storage.local.get(SYNC_LOCK_KEY)
  return result[SYNC_LOCK_KEY] || null
}

function isLockExpired(lock: LockInfo): boolean {
  return Date.now() - lock.acquiredAt > LOCK_TIMEOUT_MS
}

export async function acquireLock(operation: string, timeoutMs = 10000): Promise<string | null> {
  const lockId = generateLockId()
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const currentLock = await getLockInfo()

    if (!currentLock || isLockExpired(currentLock)) {
      const newLock: LockInfo = {
        holder: lockId,
        acquiredAt: Date.now(),
        operation,
      }
      await browser.storage.local.set({ [SYNC_LOCK_KEY]: newLock })

      // 验证锁
      await new Promise((resolve) => setTimeout(resolve, 50))
      const verifyLock = await getLockInfo()
      if (verifyLock?.holder === lockId) {
        console.log(`[Lock] 获取锁成功: ${operation}`)
        return lockId
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  console.warn(`[Lock] 获取锁超时: ${operation}`)
  return null
}

export async function releaseLock(lockId: string): Promise<boolean> {
  const currentLock = await getLockInfo()
  if (currentLock?.holder === lockId) {
    await browser.storage.local.remove(SYNC_LOCK_KEY)
    console.log(`[Lock] 释放锁成功`)
    return true
  }
  return false
}

export async function forceReleaseLock(): Promise<void> {
  await browser.storage.local.remove(SYNC_LOCK_KEY)
  console.log('[Lock] 强制释放锁')
}

export async function isLocked(): Promise<boolean> {
  const lock = await getLockInfo()
  return lock !== null && !isLockExpired(lock)
}

export async function getLockStatus(): Promise<{ locked: boolean; elapsed?: number }> {
  const lock = await getLockInfo()
  if (!lock || isLockExpired(lock)) {
    return { locked: false }
  }
  return { locked: true, elapsed: Date.now() - lock.acquiredAt }
}

export async function withLock<T>(
  operation: string,
  fn: () => Promise<T>,
  timeoutMs = 10000
): Promise<T> {
  const lockId = await acquireLock(operation, timeoutMs)
  if (!lockId) {
    throw new Error('无法获取同步锁，可能有其他同步操作正在进行')
  }

  try {
    return await fn()
  } finally {
    await releaseLock(lockId)
  }
}
