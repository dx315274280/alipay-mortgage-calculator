module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        compiler: 'vite',
        targets: {
          ios: '9',
          android: '5',
        },
      },
    ],
  ],
}
