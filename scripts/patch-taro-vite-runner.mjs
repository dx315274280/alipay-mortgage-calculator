import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const emitPath = join(dirname(require.resolve('@tarojs/vite-runner/package.json')), 'dist/mini/emit.js')

const originalSnippet = `                                    const chunk = bundle[p];
                                    if (chunk.type === 'asset') {`

const patchedSnippet = `                                    const chunk = bundle[p];
                                    if (!chunk) {
                                        return true;
                                    }
                                    if (chunk.type === 'asset') {`

const source = readFileSync(emitPath, 'utf8')

if (source.includes('if (!chunk) {')) {
  process.exit(0)
}

if (!source.includes(originalSnippet)) {
  console.warn('[patch-taro-vite-runner] 未找到预期代码片段，跳过补丁')
  process.exit(0)
}

writeFileSync(emitPath, source.replace(originalSnippet, patchedSnippet), 'utf8')
console.log('[patch-taro-vite-runner] 已修复支付宝小程序编译 emit 问题')
