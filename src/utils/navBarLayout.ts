import Taro from '@tarojs/taro'
import { IS_ALIPAY } from './platform'

/** 导航栏 CSS 变量（挂载到页面根节点，供 SCSS 消费） */
export type NavBarCssVars = Record<
  '--status-bar-height' | '--nav-bar-height' | '--navbar-total-height',
  string
>

const FALLBACK_STATUS_BAR_HEIGHT = 20
const FALLBACK_NAV_BAR_HEIGHT = 44

interface ExtendedSystemInfo extends ReturnType<typeof Taro.getSystemInfoSync> {
  titleBarHeight?: number
}

export interface NavBarMetrics {
  cssVars: NavBarCssVars
  /** 状态栏 + 导航栏内容区总高度（px），用于 fixed 定位 inline style */
  totalHeightPx: number
}

/**
 * 同步计算导航栏尺寸（首屏即可用，不依赖 useEffect 时序）
 * - 状态栏：Taro.getSystemInfoSync().statusBarHeight
 * - 微信：按胶囊按钮垂直对齐计算内容区高度
 * - 支付宝：使用 titleBarHeight（无胶囊概念）
 */
export function getNavBarMetrics(): NavBarMetrics {
  let statusBarHeight = FALLBACK_STATUS_BAR_HEIGHT
  let navBarHeight = FALLBACK_NAV_BAR_HEIGHT

  try {
    const systemInfo = Taro.getSystemInfoSync() as ExtendedSystemInfo
    if (Number.isFinite(systemInfo.statusBarHeight) && systemInfo.statusBarHeight > 0) {
      statusBarHeight = systemInfo.statusBarHeight
    }

    if (IS_ALIPAY) {
      if (Number.isFinite(systemInfo.titleBarHeight) && systemInfo.titleBarHeight > 0) {
        navBarHeight = systemInfo.titleBarHeight
      }
    } else {
      const menuButton = Taro.getMenuButtonBoundingClientRect()
      if (menuButton.top > 0 && menuButton.height > 0) {
        const capsuleGap = Math.max(menuButton.top - statusBarHeight, 0)
        navBarHeight = capsuleGap * 2 + menuButton.height
      }
    }
  } catch {
    // 保留 fallback
  }

  const totalHeightPx = statusBarHeight + navBarHeight

  return {
    cssVars: {
      '--status-bar-height': `${statusBarHeight}px`,
      '--nav-bar-height': `${navBarHeight}px`,
      '--navbar-total-height': `${totalHeightPx}px`,
    },
    totalHeightPx,
  }
}

export function getNavBarCssVars(): NavBarCssVars {
  return getNavBarMetrics().cssVars
}
