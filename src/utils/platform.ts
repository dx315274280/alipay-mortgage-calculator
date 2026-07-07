/** 当前编译目标是否为微信小程序 */
export const IS_WEAPP = process.env.TARO_ENV === 'weapp'

/** 当前编译目标是否为支付宝小程序 */
export const IS_ALIPAY = process.env.TARO_ENV === 'alipay'

/** 收藏引导文案（各平台右上角菜单表述不同） */
export const FAVORITE_GUIDE_TEXT = IS_ALIPAY
  ? '点击右上角☆收藏到首页，下次找我不迷路⭐️'
  : '点击右上角「...」添加到我的小程序，下次找我不迷路 ⭐️'

/** 广告占位文案 */
export const AD_PLACEHOLDER_TEXT = IS_ALIPAY
  ? '广告位招商 / 支付宝原生广告预留'
  : '广告位招商 / 微信原生广告预留'
