/** 支付宝 dist JS 转 ES5：内联 helper，禁止引用 @babel/runtime 绝对路径 */
module.exports = {
  ALIPAY_ES5_BABEL_OPTIONS: {
    configFile: false,
    babelrc: false,
    presets: [
      [
        '@babel/preset-env',
        {
          targets: {
            ios: '9',
            android: '5',
          },
          modules: false,
          // loose: true 会把 new Set([...arr, ...setVar]) 错误编译为
          // new Set([].concat(arr, setVar))，Set 无法被 concat 展开，导致 Taro API 初始化崩溃、页面无法注册
          loose: false,
        },
      ],
    ],
    compact: true,
    minified: true,
    comments: false,
  },
}
