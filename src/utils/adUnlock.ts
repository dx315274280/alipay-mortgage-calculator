import Taro from '@tarojs/taro'
import {
  AD_CLICK_COUNT_STORAGE_KEY,
  AD_DAILY_UNLOCK_LIMIT,
} from '../config/ad'

/** 本地缓存结构：按自然日记录点击次数 */
export interface AdUnlockStorageRecord {
  /** 日期，格式 YYYY-MM-DD */
  date: string
  /** 当日已成功点击广告解锁的次数 */
  count: number
}

/** 获取当前自然日字符串（本地时区） */
export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 解析本地广告解锁记录
 * - 跨自然日自动归零
 * - 兼容旧版仅存储 number 的数据
 */
export function getAdUnlockRecord(): AdUnlockStorageRecord {
  const today = getTodayDateString()

  try {
    const storedValue = Taro.getStorageSync(AD_CLICK_COUNT_STORAGE_KEY)

    if (storedValue === '' || storedValue === undefined || storedValue === null) {
      return { date: today, count: 0 }
    }

    // 兼容旧版：click_ad_count 直接存 number
    if (typeof storedValue === 'number') {
      return { date: today, count: 0 }
    }

    if (typeof storedValue !== 'object') {
      return { date: today, count: 0 }
    }

    const record = storedValue as Partial<AdUnlockStorageRecord>
    const storedDate = typeof record.date === 'string' ? record.date : today
    const storedCount = Number(record.count)

    if (storedDate !== today) {
      return { date: today, count: 0 }
    }

    if (!Number.isFinite(storedCount) || storedCount < 0) {
      return { date: today, count: 0 }
    }

    return { date: today, count: Math.floor(storedCount) }
  } catch {
    return { date: today, count: 0 }
  }
}

/**
 * 读取当日广告点击次数
 */
export function getAdClickCountToday(): number {
  return getAdUnlockRecord().count
}

/**
 * 持久化广告解锁记录
 */
function saveAdUnlockRecord(record: AdUnlockStorageRecord): void {
  try {
    Taro.setStorageSync(AD_CLICK_COUNT_STORAGE_KEY, record)
  } catch (error) {
    console.error('写入广告解锁记录失败', error)
  }
}

/**
 * 广告解锁成功：当日计数 +1 并持久化，返回最新计数
 */
export function incrementAdClickCount(): number {
  const today = getTodayDateString()
  const currentCount = getAdUnlockRecord().count
  const nextCount = currentCount + 1

  saveAdUnlockRecord({ date: today, count: nextCount })

  return nextCount
}

/**
 * 当日是否已达成免锁（当日点击 >= 上限）
 * 次日自动失效，需重新累计
 */
export function isAdLockBypassedToday(): boolean {
  return getAdClickCountToday() >= AD_DAILY_UNLOCK_LIMIT
}
