import Taro from '@tarojs/taro'
import { THEME_COLORS } from '../config/theme'
import { LoanCalculationResult } from './calculator'
import { CarLoanResult } from './carCalculator'
import { EarlyRepaymentResult } from './earlyRepaymentCalculator'
import { LprComparisonResult } from './lprCalculator'

/** 海报 Canvas 节点 id（与页面 Canvas type="2d" 的 id 一致） */
export const POSTER_CANVAS_ID = 'calcPosterCanvas'

/** 海报逻辑宽度（CSS px） */
export const POSTER_LOGICAL_WIDTH = 375

/** 海报最小逻辑高度（CSS px） */
export const POSTER_MIN_LOGICAL_HEIGHT = 680

/** 海报单行参数 */
export interface PosterParamRow {
  label: string
  value: string
}

/** 海报绘制数据 */
export interface PosterData {
  badgeText: string
  heroLabel: string
  heroValue: string
  heroSubLabel: string
  heroSubValue: string
  paramRows: PosterParamRow[]
  footerTitle: string
  footerHint: string
  timestamp: string
}

/** 构建海报所需的表单上下文 */
export interface PosterFormContext {
  isEqualInterest: boolean
  mortgageFeatureMode: 'standard' | 'lpr' | 'early_repayment'
  mortgageLoanType: 'commercial' | 'fund' | 'combined'
  commercialLoanWan: string
  commercialInterestRate: string
  fundLoanWan: string
  fundInterestRate: string
  mortgageYearIndex: number
  advancedBalanceWan: string
  advancedRemainingYearIndex: number
  advancedOriginalRate: string
  lprAdjustMode: 'new_rate' | 'basis_points'
  lprNewRate: string
  lprBasisPoints: string
  earlyPrepaymentWan: string
  earlyRepaymentMode: 'shorten_term' | 'reduce_payment'
  vehiclePriceWan: string
  downPaymentIndex: number
  carYearIndex: number
  carInterestRate: string
}

export type PosterCalculationState =
  | { type: 'mortgage_standard'; result: LoanCalculationResult }
  | { type: 'mortgage_lpr'; result: LprComparisonResult }
  | { type: 'mortgage_early'; result: EarlyRepaymentResult }
  | { type: 'car'; result: CarLoanResult }

interface PosterCanvasContext {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  devicePixelRatio: number
  logicalWidth: number
  logicalHeight: number
}

interface PosterLayoutMetrics {
  logicalWidth: number
  logicalHeight: number
  paddingX: number
  contentWidth: number
  heroHeight: number
  cardX: number
  cardY: number
  cardWidth: number
  cardHeight: number
  footerTop: number
  qrSize: number
}

function formatPosterCurrency(amount: number): string {
  const [integerPart, decimalPart] = amount.toFixed(2).split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${formattedInteger}.${decimalPart}`
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

function getRepaymentTypeLabel(isEqualInterest: boolean): string {
  return isEqualInterest ? '等额本息' : '等额本金'
}

function getMortgageLoanTypeLabel(loanType: PosterFormContext['mortgageLoanType']): string {
  if (loanType === 'fund') {
    return '纯公积金贷'
  }
  if (loanType === 'combined') {
    return '组合贷款'
  }
  return '纯商业贷'
}

function getDownPaymentLabel(downPaymentIndex: number): string {
  const labels = ['10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%']
  return labels[downPaymentIndex] ?? '30%'
}

/** 根据测算结果与表单上下文构建海报数据 */
export function buildPosterData(
  calculation: PosterCalculationState,
  form: PosterFormContext,
): PosterData {
  const timestamp = formatTimestamp(new Date())
  const footerTitle = '多功能房贷车贷计算器'
  const footerHint = '智能避坑 · 省钱工具'

  if (calculation.type === 'car') {
    const { result } = calculation
    const monthlyPayment = result.monthlyPayments[0]?.monthlyPayment ?? 0
    return {
      badgeText: '车贷测算账单',
      heroLabel: '购车总花费',
      heroValue: formatPosterCurrency(result.totalPurchaseCost),
      heroSubLabel: form.isEqualInterest ? '每月供款' : '首月供款',
      heroSubValue: formatPosterCurrency(monthlyPayment),
      paramRows: [
        { label: '车辆总价', value: `${form.vehiclePriceWan || '-'} 万元` },
        { label: '首付比例', value: getDownPaymentLabel(form.downPaymentIndex) },
        { label: '贷款年限', value: `${form.carYearIndex + 1} 年` },
        { label: '年利率', value: `${form.carInterestRate}%` },
        { label: '还款方式', value: getRepaymentTypeLabel(form.isEqualInterest) },
        { label: '贷款金额', value: formatPosterCurrency(result.loanAmount) },
        { label: '总利息', value: formatPosterCurrency(result.totalInterest) },
      ],
      footerTitle,
      footerHint,
      timestamp,
    }
  }

  if (calculation.type === 'mortgage_lpr') {
    const { result } = calculation
    return {
      badgeText: 'LPR 降息对比账单',
      heroLabel: '每月可省',
      heroValue: formatPosterCurrency(result.savings.monthlyPayment),
      heroSubLabel: '总利息可省',
      heroSubValue: formatPosterCurrency(result.savings.totalInterest),
      paramRows: [
        { label: '贷款余额', value: `${form.advancedBalanceWan || '-'} 万元` },
        { label: '剩余年限', value: `${form.advancedRemainingYearIndex + 1} 年` },
        { label: '原贷款利率', value: `${form.advancedOriginalRate}%` },
        {
          label: '新贷款利率',
          value: `${result.appliedNewAnnualInterestRate.toFixed(2)}%`,
        },
        {
          label: 'LPR 调整',
          value:
            form.lprAdjustMode === 'basis_points'
              ? `下调 ${form.lprBasisPoints} BP`
              : `新利率 ${form.lprNewRate}%`,
        },
        { label: '还款方式', value: getRepaymentTypeLabel(form.isEqualInterest) },
        {
          label: '调整后月供',
          value: formatPosterCurrency(result.after.monthlyPayment),
        },
      ],
      footerTitle,
      footerHint,
      timestamp,
    }
  }

  if (calculation.type === 'mortgage_early') {
    const { result } = calculation
    return {
      badgeText: '提前还款试算账单',
      heroLabel: '本次可省总利息',
      heroValue: formatPosterCurrency(result.interestSaved),
      heroSubLabel: '新月供',
      heroSubValue: formatPosterCurrency(result.newMonthlyPayment),
      paramRows: [
        { label: '贷款余额', value: `${form.advancedBalanceWan || '-'} 万元` },
        { label: '剩余年限', value: `${form.advancedRemainingYearIndex + 1} 年` },
        { label: '原贷款利率', value: `${form.advancedOriginalRate}%` },
        { label: '提前还款', value: `${form.earlyPrepaymentWan || '-'} 万元` },
        {
          label: '优化模式',
          value:
            form.earlyRepaymentMode === 'shorten_term' ? '缩短期限' : '减少月供',
        },
        { label: '还款方式', value: getRepaymentTypeLabel(form.isEqualInterest) },
        {
          label: '原月供',
          value: formatPosterCurrency(result.originalMonthlyPayment),
        },
      ],
      footerTitle,
      footerHint,
      timestamp,
    }
  }

  const { result } = calculation
  const monthlyPayment = result.monthlyPayments[0]?.monthlyPayment ?? 0
  const paramRows: PosterParamRow[] = [
    { label: '贷款类型', value: getMortgageLoanTypeLabel(form.mortgageLoanType) },
    { label: '贷款年限', value: `${form.mortgageYearIndex + 1} 年` },
    { label: '还款方式', value: getRepaymentTypeLabel(form.isEqualInterest) },
  ]

  if (form.mortgageLoanType === 'commercial' || form.mortgageLoanType === 'combined') {
    paramRows.push(
      { label: '商贷金额', value: `${form.commercialLoanWan || '-'} 万元` },
      { label: '商贷利率', value: `${form.commercialInterestRate}%` },
    )
  }
  if (form.mortgageLoanType === 'fund' || form.mortgageLoanType === 'combined') {
    paramRows.push(
      { label: '公积金金额', value: `${form.fundLoanWan || '-'} 万元` },
      { label: '公积金利率', value: `${form.fundInterestRate}%` },
    )
  }
  paramRows.push(
    { label: '总利息', value: formatPosterCurrency(result.totalInterest) },
    { label: '总还款额', value: formatPosterCurrency(result.totalRepayment) },
  )

  return {
    badgeText: '房贷测算账单',
    heroLabel: form.isEqualInterest ? '每月供款' : '首月供款',
    heroValue: formatPosterCurrency(monthlyPayment),
    heroSubLabel: '总利息',
    heroSubValue: formatPosterCurrency(result.totalInterest),
    paramRows,
    footerTitle,
    footerHint,
    timestamp,
  }
}

function getDevicePixelRatio(): number {
  try {
    const systemInfo = Taro.getSystemInfoSync()
    if (systemInfo.pixelRatio > 0) {
      return systemInfo.pixelRatio
    }
  } catch {
    // fallback below
  }

  try {
    const windowInfo = Taro.getWindowInfo()
    if (windowInfo.pixelRatio > 0) {
      return windowInfo.pixelRatio
    }
  } catch {
    // fallback below
  }

  return 2
}

function calcPosterLogicalHeight(paramRowCount: number): number {
  const heroHeight = 280
  const cardHeaderHeight = 72
  const rowHeight = 28
  const cardPaddingBottom = 28
  const cardHeight = cardHeaderHeight + paramRowCount * rowHeight + cardPaddingBottom
  const footerHeight = 132
  const cardOverlap = 28
  return Math.max(
    POSTER_MIN_LOGICAL_HEIGHT,
    heroHeight + cardHeight + footerHeight - cardOverlap,
  )
}

function buildPosterLayout(posterData: PosterData): PosterLayoutMetrics {
  const logicalWidth = POSTER_LOGICAL_WIDTH
  const logicalHeight = calcPosterLogicalHeight(posterData.paramRows.length)
  const paddingX = logicalWidth * 0.064
  const contentWidth = logicalWidth - paddingX * 2
  const heroHeight = 280
  const cardX = paddingX * 0.625
  const cardY = heroHeight - 28
  const cardWidth = logicalWidth - cardX * 2
  const cardHeight =
    72 + posterData.paramRows.length * 28 + 28
  const footerTop = cardY + cardHeight + 24
  const qrSize = Math.min(contentWidth * 0.26, 96)

  return {
    logicalWidth,
    logicalHeight,
    paddingX,
    contentWidth,
    heroHeight,
    cardX,
    cardY,
    cardWidth,
    cardHeight,
    footerTop,
    qrSize,
  }
}

function drawRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.arc(x + width - r, y + r, r, -Math.PI / 2, 0)
  ctx.lineTo(x + width, y + height - r)
  ctx.arc(x + width - r, y + height - r, r, 0, Math.PI / 2)
  ctx.lineTo(x + r, y + height)
  ctx.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + r)
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient,
): void {
  ctx.fillStyle = fillStyle
  drawRoundRectPath(ctx, x, y, width, height, radius)
  ctx.fill()
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string,
  lineWidth: number,
): void {
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  drawRoundRectPath(ctx, x, y, width, height, radius)
  ctx.stroke()
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text
  }

  let truncatedText = text
  while (truncatedText.length > 1 && ctx.measureText(`${truncatedText}…`).width > maxWidth) {
    truncatedText = truncatedText.slice(0, -1)
  }
  return `${truncatedText}…`
}

function fitFontSizeToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number,
  fontWeight = '700',
): number {
  let fontSize = maxFontSize
  while (fontSize >= minFontSize) {
    ctx.font = `${fontWeight} ${fontSize}px sans-serif`
    if (ctx.measureText(text).width <= maxWidth) {
      return fontSize
    }
    fontSize -= 2
  }
  return minFontSize
}

function drawCenterText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  fillStyle: string,
  fontSize: number,
  fontWeight = '400',
  maxWidth?: number,
): void {
  ctx.fillStyle = fillStyle
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const displayText = maxWidth ? truncateTextToWidth(ctx, text, maxWidth) : text
  ctx.fillText(displayText, centerX, baselineY)
}

function drawLeftText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  fillStyle: string,
  fontSize: number,
  fontWeight = '400',
  maxWidth?: number,
): number {
  ctx.fillStyle = fillStyle
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const displayText = maxWidth ? truncateTextToWidth(ctx, text, maxWidth) : text
  ctx.fillText(displayText, x, baselineY)
  return fontSize + 4
}

function drawPosterContent(
  ctx: CanvasRenderingContext2D,
  posterData: PosterData,
  layout: PosterLayoutMetrics,
): void {
  const { logicalWidth, logicalHeight, paddingX, contentWidth, heroHeight } = layout
  const centerX = logicalWidth / 2

  ctx.clearRect(0, 0, logicalWidth, logicalHeight)

  const gradient = ctx.createLinearGradient(0, 0, 0, heroHeight)
  gradient.addColorStop(0, THEME_COLORS.primary)
  gradient.addColorStop(0.55, THEME_COLORS.primaryDark)
  gradient.addColorStop(1, THEME_COLORS.primaryDarker)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, logicalWidth, heroHeight)

  fillRoundRect(
    ctx,
    paddingX,
    28,
    contentWidth * 0.42,
    34,
    17,
    'rgba(255, 255, 255, 0.18)',
  )
  drawLeftText(ctx, '房贷车贷计算器', paddingX + 14, 51, '#ffffff', 14, '600')

  const badgeWidth = Math.min(contentWidth * 0.52, 168)
  strokeRoundRect(
    ctx,
    centerX - badgeWidth / 2,
    76,
    badgeWidth,
    30,
    15,
    'rgba(255, 255, 255, 0.85)',
    1,
  )
  drawCenterText(
    ctx,
    posterData.badgeText,
    centerX,
    96,
    '#ffffff',
    13,
    '500',
    badgeWidth - 16,
  )

  drawCenterText(ctx, posterData.heroLabel, centerX, 132, 'rgba(255, 255, 255, 0.88)', 14)

  const heroMaxWidth = contentWidth - 8
  const heroFontSize = fitFontSizeToWidth(
    ctx,
    posterData.heroValue,
    heroMaxWidth,
    44,
    24,
    '700',
  )
  drawCenterText(
    ctx,
    posterData.heroValue,
    centerX,
    182,
    '#ffffff',
    heroFontSize,
    '700',
    heroMaxWidth,
  )

  const heroSubText = `${posterData.heroSubLabel}  ${posterData.heroSubValue}`
  drawCenterText(
    ctx,
    heroSubText,
    centerX,
    218,
    'rgba(255, 255, 255, 0.88)',
    13,
    '400',
    heroMaxWidth,
  )

  ctx.fillStyle = '#f4f6f8'
  ctx.fillRect(0, heroHeight - 24, logicalWidth, logicalHeight - heroHeight + 24)

  ctx.save()
  ctx.shadowColor = 'rgba(7, 193, 96, 0.12)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  fillRoundRect(
    ctx,
    layout.cardX,
    layout.cardY,
    layout.cardWidth,
    layout.cardHeight,
    16,
    '#ffffff',
  )
  ctx.restore()

  const cardPadding = layout.cardWidth * 0.06
  drawLeftText(
    ctx,
    '核心测算参数',
    layout.cardX + cardPadding,
    layout.cardY + 34,
    '#1a1a1a',
    16,
    '600',
  )

  ctx.strokeStyle = '#ebebeb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(layout.cardX + cardPadding, layout.cardY + 50)
  ctx.lineTo(layout.cardX + layout.cardWidth - cardPadding, layout.cardY + 50)
  ctx.stroke()

  const labelMaxWidth = layout.cardWidth * 0.34
  const valueMaxWidth = layout.cardWidth * 0.48
  let rowBaselineY = layout.cardY + 76

  posterData.paramRows.forEach((row) => {
    drawLeftText(
      ctx,
      row.label,
      layout.cardX + cardPadding,
      rowBaselineY,
      '#8c8c8c',
      13,
      '400',
      labelMaxWidth,
    )

    ctx.fillStyle = '#1a1a1a'
    ctx.font = '600 14px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    const valueText = truncateTextToWidth(ctx, row.value, valueMaxWidth)
    ctx.fillText(valueText, layout.cardX + layout.cardWidth - cardPadding, rowBaselineY)
    rowBaselineY += 28
  })

  ctx.setLineDash([6, 6])
  ctx.strokeStyle = '#d8d8d8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(paddingX, layout.footerTop)
  ctx.lineTo(logicalWidth - paddingX, layout.footerTop)
  ctx.stroke()
  ctx.setLineDash([])

  const footerTextMaxWidth = contentWidth - layout.qrSize - 20
  drawLeftText(
    ctx,
    posterData.footerTitle,
    paddingX,
    layout.footerTop + 34,
    '#1a1a1a',
    15,
    '600',
    footerTextMaxWidth,
  )
  drawLeftText(
    ctx,
    posterData.footerHint,
    paddingX,
    layout.footerTop + 56,
    '#8c8c8c',
    12,
    '400',
    footerTextMaxWidth,
  )
  drawLeftText(
    ctx,
    posterData.timestamp,
    paddingX,
    layout.footerTop + 78,
    '#8c8c8c',
    12,
    '400',
    footerTextMaxWidth,
  )

  const qrX = logicalWidth - paddingX - layout.qrSize
  const qrY = layout.footerTop + 18
  fillRoundRect(ctx, qrX, qrY, layout.qrSize, layout.qrSize, 8, '#ffffff')
  strokeRoundRect(ctx, qrX, qrY, layout.qrSize, layout.qrSize, 8, THEME_COLORS.primary, 2)

  ctx.fillStyle = THEME_COLORS.primary
  const moduleSize = Math.max(6, Math.floor((layout.qrSize - 28) / 7))
  const qrPadding = 14
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      if ((row + col) % 2 === 0 || row === 0 || col === 0 || row === 6 || col === 6) {
        ctx.fillRect(
          qrX + qrPadding + col * moduleSize,
          qrY + qrPadding + row * moduleSize,
          moduleSize - 1,
          moduleSize - 1,
        )
      }
    }
  }

  drawCenterText(
    ctx,
    '扫码测算',
    qrX + layout.qrSize / 2,
    qrY + layout.qrSize + 16,
    THEME_COLORS.primaryDark,
    11,
    '500',
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function initPosterCanvas(logicalHeight: number): Promise<PosterCanvasContext> {
  const devicePixelRatio = getDevicePixelRatio()
  const physicalWidth = Math.round(POSTER_LOGICAL_WIDTH * devicePixelRatio)
  const physicalHeight = Math.round(logicalHeight * devicePixelRatio)

  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${POSTER_CANVAS_ID}`)
      .fields({ node: true, size: true })
      .exec((queryResult) => {
        const canvasNode = queryResult?.[0]?.node as HTMLCanvasElement | undefined
        if (!canvasNode) {
          reject(new Error('canvas node not found'))
          return
        }

        const ctx = canvasNode.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 2d context not found'))
          return
        }

        canvasNode.width = physicalWidth
        canvasNode.height = physicalHeight
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(devicePixelRatio, devicePixelRatio)

        resolve({
          canvas: canvasNode,
          ctx,
          devicePixelRatio,
          logicalWidth: POSTER_LOGICAL_WIDTH,
          logicalHeight,
        })
      })
  })
}

async function initPosterCanvasWithRetry(logicalHeight: number): Promise<PosterCanvasContext> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await initPosterCanvas(logicalHeight)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('canvas init failed')
      await wait(120)
    }
  }

  throw lastError ?? new Error('canvas init failed')
}

function exportPosterCanvasToTempFile(
  canvas: HTMLCanvasElement,
  devicePixelRatio: number,
  logicalHeight: number,
): Promise<string> {
  const physicalWidth = Math.round(POSTER_LOGICAL_WIDTH * devicePixelRatio)
  const physicalHeight = Math.round(logicalHeight * devicePixelRatio)

  return new Promise((resolve, reject) => {
    Taro.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: physicalWidth,
      height: physicalHeight,
      destWidth: physicalWidth,
      destHeight: physicalHeight,
      fileType: 'png',
      quality: 1,
      success: (result) => {
        if (result.tempFilePath) {
          resolve(result.tempFilePath)
          return
        }
        reject(new Error('empty temp file path'))
      },
      fail: (error) => reject(error),
    })
  })
}

/** 绘制海报并导出为本地临时图片路径（Canvas 2d + DPR 适配） */
export async function generatePosterImage(posterData: PosterData): Promise<string> {
  const layout = buildPosterLayout(posterData)
  const posterCanvas = await initPosterCanvasWithRetry(layout.logicalHeight)

  drawPosterContent(posterCanvas.ctx, posterData, layout)

  await wait(80)

  return exportPosterCanvasToTempFile(
    posterCanvas.canvas,
    posterCanvas.devicePixelRatio,
    layout.logicalHeight,
  )
}

/** 根据参数行数计算海报逻辑高度（供页面 Canvas 样式同步） */
export function calcPosterDisplayHeight(paramRowCount: number): number {
  return calcPosterLogicalHeight(paramRowCount)
}

/** 预览 / 分享海报图片 */
export async function previewPosterImage(tempFilePath: string): Promise<void> {
  if (typeof Taro.showShareImageMenu === 'function') {
    try {
      await Taro.showShareImageMenu({ path: tempFilePath })
      return
    } catch {
      // 降级为全屏预览
    }
  }

  await Taro.previewImage({
    urls: [tempFilePath],
    current: tempFilePath,
  })
}

/** 将页面 CalculationState 映射为海报计算态 */
export function mapToPosterCalculationState(
  type: 'mortgage' | 'car',
  feature: 'standard' | 'lpr' | 'early_repayment',
  result: LoanCalculationResult | LprComparisonResult | EarlyRepaymentResult | CarLoanResult,
): PosterCalculationState | null {
  if (type === 'car') {
    return { type: 'car', result: result as CarLoanResult }
  }
  if (feature === 'lpr') {
    return { type: 'mortgage_lpr', result: result as LprComparisonResult }
  }
  if (feature === 'early_repayment') {
    return { type: 'mortgage_early', result: result as EarlyRepaymentResult }
  }
  return { type: 'mortgage_standard', result: result as LoanCalculationResult }
}

/** 构建海报表单上下文 */
export function buildPosterFormContext(input: {
  isEqualInterest: boolean
  mortgageFeatureMode: string
  mortgageLoanType: string
  commercialLoanWan: string
  commercialInterestRate: string
  fundLoanWan: string
  fundInterestRate: string
  mortgageYearIndex: number
  advancedBalanceWan: string
  advancedRemainingYearIndex: number
  advancedOriginalRate: string
  lprAdjustMode: string
  lprNewRate: string
  lprBasisPoints: string
  earlyPrepaymentWan: string
  earlyRepaymentMode: string
  vehiclePriceWan: string
  downPaymentIndex: number
  carYearIndex: number
  carInterestRate: string
}): PosterFormContext {
  return {
    isEqualInterest: input.isEqualInterest,
    mortgageFeatureMode:
      input.mortgageFeatureMode === 'lpr'
        ? 'lpr'
        : input.mortgageFeatureMode === 'early_repayment'
          ? 'early_repayment'
          : 'standard',
    mortgageLoanType:
      input.mortgageLoanType === 'fund'
        ? 'fund'
        : input.mortgageLoanType === 'combined'
          ? 'combined'
          : 'commercial',
    commercialLoanWan: input.commercialLoanWan,
    commercialInterestRate: input.commercialInterestRate,
    fundLoanWan: input.fundLoanWan,
    fundInterestRate: input.fundInterestRate,
    mortgageYearIndex: input.mortgageYearIndex,
    advancedBalanceWan: input.advancedBalanceWan,
    advancedRemainingYearIndex: input.advancedRemainingYearIndex,
    advancedOriginalRate: input.advancedOriginalRate,
    lprAdjustMode: input.lprAdjustMode === 'new_rate' ? 'new_rate' : 'basis_points',
    lprNewRate: input.lprNewRate,
    lprBasisPoints: input.lprBasisPoints,
    earlyPrepaymentWan: input.earlyPrepaymentWan,
    earlyRepaymentMode:
      input.earlyRepaymentMode === 'reduce_payment' ? 'reduce_payment' : 'shorten_term',
    vehiclePriceWan: input.vehiclePriceWan,
    downPaymentIndex: input.downPaymentIndex,
    carYearIndex: input.carYearIndex,
    carInterestRate: input.carInterestRate,
  }
}
