/**
 * 流量主广告总开关
 * 累计用户满 1000 人开通流量主后，手动改为 true
 */
export const IS_AD_OPEN = false

/** 还款明细免费预览条数（超出部分需广告解锁） */
export const AD_UNLOCK_FREE_PREVIEW_COUNT = 5

/** 本地缓存：广告解锁记录（含日期 + 当日点击次数） */
export const AD_CLICK_COUNT_STORAGE_KEY = 'click_ad_count'

/** 当日广告解锁点击次数上限，达到后当天免锁 */
export const AD_DAILY_UNLOCK_LIMIT = 2
