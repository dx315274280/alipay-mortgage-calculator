export default definePageConfig({
  navigationBarTitleText: '房贷计算器',
  navigationBarBackgroundColor: '#1677FF',
  navigationBarTextStyle: 'white',
  enableShareAppMessage: true,
  // 朋友圈分享仅微信小程序支持
  enableShareTimeline: process.env.TARO_ENV === 'weapp',
  // 微信：自定义导航栏；支付宝：透传系统标题栏（不支持 navigationStyle: custom）
  ...(process.env.TARO_ENV === 'alipay'
    ? {}
    : {
        navigationStyle: 'custom',
        disableScroll: false,
      }),
})
