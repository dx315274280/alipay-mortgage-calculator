import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { transformSync } from '@babel/core'
import type { IPluginContext } from '@tarojs/service'

const { ALIPAY_ES5_BABEL_OPTIONS } = require('../scripts/alipay-es5-babel-options.cjs') as {
  ALIPAY_ES5_BABEL_OPTIONS: Record<string, unknown>
}

const distRoot = join(process.cwd(), 'dist')

function mergeAppAcss(): void {
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

function collectJsFiles(dir: string): string[] {
  const files: string[] = []

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

function transpileDistToEs5(): void {
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

/** 支付宝构建后修复：ACSS 合并 + JS 转 ES5 */
export default function alipayPostBuildPlugin(ctx: IPluginContext): void {
  ctx.onBuildFinish(() => {
    if (process.env.TARO_ENV !== 'alipay') {
      return
    }

    mergeAppAcss()
    transpileDistToEs5()
    writeDistMiniProject()
  })
}

function writeDistMiniProject(): void {
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
