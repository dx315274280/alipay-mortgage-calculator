import Taro from '@tarojs/taro'
import { FAVORITE_GUIDE_DISMISSED_DATE_KEY } from '../config/retention'
import { getTodayDateString } from './adUnlock'
import { getNavBarCssVars } from './navBarLayout'
import { IS_ALIPAY } from './platform'

/** 今日是否应展示收藏引导 */
export function shouldShowFavoriteGuide(): boolean {
  try {
    const dismissedDate = Taro.getStorageSync(FAVORITE_GUIDE_DISMISSED_DATE_KEY)
    if (dismissedDate === '' || dismissedDate === undefined || dismissedDate === null) {
      return true
    }
    return String(dismissedDate) !== getTodayDateString()
  } catch {
    return true
  }
}

/** 记录用户今日已关闭收藏引导，当天不再展示 */
export function dismissFavoriteGuideForToday(): void {
  try {
    Taro.setStorageSync(FAVORITE_GUIDE_DISMISSED_DATE_KEY, getTodayDateString())
  } catch (error) {
    console.error('写入收藏引导关闭记录失败', error)
  }
}

/** 获取右上角菜单下方悬浮框的 top 偏移（px） */
export function getFavoriteGuideTopOffset(extraGapPx = 8): number {
  if (IS_ALIPAY) {
    const navBarCssVars = getNavBarCssVars()
    const totalHeight = Number.parseFloat(navBarCssVars['--navbar-total-height'])
    if (Number.isFinite(totalHeight) && totalHeight > 0) {
      return totalHeight + extraGapPx
    }
    return 88
  }

  try {
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    if (menuButton.bottom > 0) {
      return menuButton.bottom + extraGapPx
    }
  } catch {
    // 降级到常见导航栏高度
  }
  return 88
}
