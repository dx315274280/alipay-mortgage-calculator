import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { transformSync } from '@babel/core'

const require = createRequire(import.meta.url)
const { ALIPAY_ES5_BABEL_OPTIONS } = require('./alipay-es5-babel-options.cjs')

const distRoot = join(process.cwd(), 'dist')

/** 将 app-origin.acss 合并进 app.acss，避免支付宝无法解析 @import */
function mergeAppAcss() {
  const appPath = join(distRoot, 'app.acss')
  const originPath = join(distRoot, 'app-origin.acss')

  if (!existsSync(originPath)) {
    return
  }

  const originSource = readFileSync(originPath, 'utf8').trim()
  if (!originSource) {
    return
  }

  writeFileSync(appPath, `${originSource}\n`, 'utf8')
}

function collectJsFiles(dir) {
  const files = []

  for (const name of readdirSync(dir)) {
    const filePath = join(dir, name)
    if (statSync(filePath).isDirectory()) {
      files.push(...collectJsFiles(filePath))
      continue
    }
    if (name.endsWith('.js')) {
      files.push(filePath)
    }
  }

  return files
}

/** 写入 dist/mini.project.json（直接导入 dist 目录时使用，无需 miniprogramRoot） */
function writeDistMiniProject() {
  const content = `${JSON.stringify(
    {
      format: 2,
      compileType: 'mini',
      compileOptions: {
        component2: true,
        globalObjectMode: 'enable',
        transpile: {
          script: {
            ignore: ['**/node_modules/**'],
          },
        },
      },
    },
    null,
    2,
  )}\n`
  writeFileSync(join(distRoot, 'mini.project.json'), content, 'utf8')
}

/** 将 dist 下所有 JS 降级为 ES5（内联 helper，不引用 node_modules 绝对路径） */
function transpileDistToEs5() {
  const jsFiles = collectJsFiles(distRoot)

  for (const filePath of jsFiles) {
    const source = readFileSync(filePath, 'utf8')
    const result = transformSync(source, {
      ...ALIPAY_ES5_BABEL_OPTIONS,
      filename: filePath,
    })

    if (result.code) {
      writeFileSync(filePath, result.code, 'utf8')
    }
  }
}

mergeAppAcss()
transpileDistToEs5()
writeDistMiniProject()
console.log('[postbuild-alipay] 已修复 app.acss、转译 ES5，并写入 dist/mini.project.json')
