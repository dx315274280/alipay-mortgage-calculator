import {
  calculateCombinedLoan,
  calculateLoan,
  LoanCalculationResult,
  LoanValidationError,
  REPAYMENT_TYPE,
} from './calculator'
import {
  calculateCarLoan,
  CarAdditionalFeesInput,
  CarLoanResult,
  CarValidationError,
} from './carCalculator'
import {
  calculateEarlyRepayment,
  EARLY_REPAYMENT_MODE,
  EarlyRepaymentResult,
} from './earlyRepaymentCalculator'
import {
  calculateLprComparison,
  LPR_ADJUST_MODE,
  LprComparisonResult,
} from './lprCalculator'

/** 分享链接标记参数 */
export const SHARE_SOURCE_QUERY_KEY = 'src'
export const SHARE_SOURCE_QUERY_VALUE = '1'

/** 分享表单快照（短 key 便于控制 URL 长度） */
export interface ShareFormSnapshot {
  calculatorType: 'm' | 'c'
  repaymentType: 'i' | 'p'
  mortgageFeatureMode: 's' | 'l' | 'e'
  mortgageLoanType: 'c' | 'f' | 'b'
  commercialLoanWan: string
  commercialInterestRate: string
  fundLoanWan: string
  fundInterestRate: string
  mortgageYearIndex: number
  advancedBalanceWan: string
  advancedRemainingYearIndex: number
  advancedOriginalRate: string
  lprAdjustMode: 'n' | 'b'
  lprNewRate: string
  lprBasisPoints: string
  earlyPrepaymentWan: string
  earlyRepaymentMode: 's' | 'r'
  vehiclePriceWan: string
  downPaymentIndex: number
  carYearIndex: number
  carInterestRate: string
  carFeesEncoded: string
}

export type ShareCalculationState =
  | {
      type: 'm'
      feature: 's'
      result: LoanCalculationResult
    }
  | {
      type: 'm'
      feature: 'l'
      result: LprComparisonResult
    }
  | {
      type: 'm'
      feature: 'e'
      result: EarlyRepaymentResult
    }
  | { type: 'c'; result: CarLoanResult }

const DEFAULT_SHARE_TITLE = '省钱神器！2026最新房贷车贷/组合贷款/LPR降息测算器'
/** 支付宝分享 path 不能以 / 开头 */
const SHARE_PAGE_PATH =
  process.env.TARO_ENV === 'alipay' ? 'pages/mortgage/index' : '/pages/mortgage/index'

function parseInputNumber(value: string): number {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return Number.NaN
  }
  return Number(trimmedValue)
}

function formatShareCurrency(amount: number): string {
  const [integerPart, decimalPart] = amount.toFixed(2).split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${formattedInteger}.${decimalPart}`
}

function encodeOptionalQueryValue(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  const text = String(value).trim()
  return text ? encodeURIComponent(text) : undefined
}

function decodeCarFees(encoded: string | undefined): CarAdditionalFeesInput {
  const defaultFees: CarAdditionalFeesInput = {
    vehicleTax: { enabled: false, amount: 420 },
    insurance: { enabled: false, amount: 5500 },
    licensePlate: { enabled: false, amount: 500 },
  }

  if (!encoded) {
    return defaultFees
  }

  const segments = encoded.split('|')
  const keys: Array<keyof CarAdditionalFeesInput> = ['vehicleTax', 'insurance', 'licensePlate']

  keys.forEach((key, index) => {
    const segment = segments[index]
    if (!segment) {
      return
    }
    const [enabledFlag, amountText] = segment.split('-')
    const enabled = enabledFlag === '1'
    const amount = parseInputNumber(amountText)
    defaultFees[key] = {
      enabled,
      amount: Number.isFinite(amount) ? amount : 0,
    }
  })

  return defaultFees
}

function encodeCarFees(feesEncoded: string): string {
  return encodeURIComponent(feesEncoded)
}

function parseIntegerQuery(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function toRepaymentType(code: 'i' | 'p'): REPAYMENT_TYPE {
  return code === 'p' ? REPAYMENT_TYPE.PRINCIPAL : REPAYMENT_TYPE.INTEREST
}

function toMortgageFeatureMode(code: 's' | 'l' | 'e'): 'standard' | 'lpr' | 'early_repayment' {
  if (code === 'l') {
    return 'lpr'
  }
  if (code === 'e') {
    return 'early_repayment'
  }
  return 'standard'
}

function toMortgageLoanType(code: 'c' | 'f' | 'b'): 'commercial' | 'fund' | 'combined' {
  if (code === 'f') {
    return 'fund'
  }
  if (code === 'b') {
    return 'combined'
  }
  return 'commercial'
}

function toLprAdjustMode(code: 'n' | 'b'): LPR_ADJUST_MODE {
  return code === 'n' ? LPR_ADJUST_MODE.NEW_RATE : LPR_ADJUST_MODE.BASIS_POINTS
}

function toEarlyRepaymentMode(code: 's' | 'r'): EARLY_REPAYMENT_MODE {
  return code === 'r'
    ? EARLY_REPAYMENT_MODE.REDUCE_PAYMENT
    : EARLY_REPAYMENT_MODE.SHORTEN_TERM
}

/** 是否为好友分享链接（带 src=1 标记） */
export function hasShareQueryParams(query: Record<string, string | undefined>): boolean {
  return query[SHARE_SOURCE_QUERY_KEY] === SHARE_SOURCE_QUERY_VALUE
}

/** 将当前表单快照序列化为 Query 字符串 */
export function buildShareQuery(snapshot: ShareFormSnapshot): string {
  const entries: Array<[string, string | undefined]> = [
    [SHARE_SOURCE_QUERY_KEY, SHARE_SOURCE_QUERY_VALUE],
    ['ct', snapshot.calculatorType],
    ['rt', snapshot.repaymentType],
    ['mf', snapshot.mortgageFeatureMode],
    ['ml', snapshot.mortgageLoanType],
    ['cl', encodeOptionalQueryValue(snapshot.commercialLoanWan)],
    ['crr', encodeOptionalQueryValue(snapshot.commercialInterestRate)],
    ['fl', encodeOptionalQueryValue(snapshot.fundLoanWan)],
    ['fr', encodeOptionalQueryValue(snapshot.fundInterestRate)],
    ['my', encodeOptionalQueryValue(snapshot.mortgageYearIndex)],
    ['ab', encodeOptionalQueryValue(snapshot.advancedBalanceWan)],
    ['ary', encodeOptionalQueryValue(snapshot.advancedRemainingYearIndex)],
    ['aor', encodeOptionalQueryValue(snapshot.advancedOriginalRate)],
    ['lam', snapshot.lprAdjustMode],
    ['lnr', encodeOptionalQueryValue(snapshot.lprNewRate)],
    ['lbp', encodeOptionalQueryValue(snapshot.lprBasisPoints)],
    ['epw', encodeOptionalQueryValue(snapshot.earlyPrepaymentWan)],
    ['erm', snapshot.earlyRepaymentMode],
    ['vp', encodeOptionalQueryValue(snapshot.vehiclePriceWan)],
    ['dpi', encodeOptionalQueryValue(snapshot.downPaymentIndex)],
    ['cyi', encodeOptionalQueryValue(snapshot.carYearIndex)],
    ['car', encodeOptionalQueryValue(snapshot.carInterestRate)],
    ['fee', encodeCarFees(snapshot.carFeesEncoded)],
  ]

  return entries
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

/** 解析分享链接 Query 为表单快照 */
export function parseShareQuery(
  query: Record<string, string | undefined>,
): ShareFormSnapshot | null {
  if (!hasShareQueryParams(query)) {
    return null
  }

  const calculatorType = query.ct === 'c' ? 'c' : query.ct === 'm' ? 'm' : null
  const repaymentType = query.rt === 'p' ? 'p' : query.rt === 'i' ? 'i' : null
  const mortgageFeatureMode =
    query.mf === 'l' ? 'l' : query.mf === 'e' ? 'e' : query.mf === 's' ? 's' : null
  const mortgageLoanType =
    query.ml === 'f' ? 'f' : query.ml === 'b' ? 'b' : query.ml === 'c' ? 'c' : null

  if (!calculatorType || !repaymentType || !mortgageFeatureMode || !mortgageLoanType) {
    return null
  }

  const lprAdjustMode = query.lam === 'n' ? 'n' : query.lam === 'b' ? 'b' : 'b'
  const earlyRepaymentMode = query.erm === 'r' ? 'r' : query.erm === 's' ? 's' : 's'

  let carFeesEncoded = '0-420|0-5500|0-500'
  if (query.fee) {
    try {
      carFeesEncoded = decodeURIComponent(query.fee)
    } catch {
      carFeesEncoded = query.fee
    }
  }

  return {
    calculatorType,
    repaymentType,
    mortgageFeatureMode,
    mortgageLoanType,
    commercialLoanWan: query.cl ?? '',
    commercialInterestRate: query.crr ?? '3.55',
    fundLoanWan: query.fl ?? '',
    fundInterestRate: query.fr ?? '2.85',
    mortgageYearIndex: parseIntegerQuery(query.my, 29),
    advancedBalanceWan: query.ab ?? '',
    advancedRemainingYearIndex: parseIntegerQuery(query.ary, 19),
    advancedOriginalRate: query.aor ?? '4.2',
    lprAdjustMode,
    lprNewRate: query.lnr ?? '3.95',
    lprBasisPoints: query.lbp ?? '25',
    earlyPrepaymentWan: query.epw ?? '',
    earlyRepaymentMode,
    vehiclePriceWan: query.vp ?? '',
    downPaymentIndex: parseIntegerQuery(query.dpi, 2),
    carYearIndex: parseIntegerQuery(query.cyi, 2),
    carInterestRate: query.car ?? '5.88',
    carFeesEncoded,
  }
}

/** 根据分享快照直接计算结果（接流后自动出结果） */
export function calculateFromShareSnapshot(
  snapshot: ShareFormSnapshot,
): ShareCalculationState | null {
  const repaymentType = toRepaymentType(snapshot.repaymentType)

  try {
    if (snapshot.calculatorType === 'c') {
      const vehicleTotalYuan = parseInputNumber(snapshot.vehiclePriceWan) * 10000
      const interestRate = parseInputNumber(snapshot.carInterestRate)
      const downPaymentRatios = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
      const downPaymentRatio = downPaymentRatios[snapshot.downPaymentIndex] ?? 0.3
      const loanYears = snapshot.carYearIndex + 1

      if (!Number.isFinite(vehicleTotalYuan) || !Number.isFinite(interestRate)) {
        return null
      }

      const result = calculateCarLoan({
        vehicleTotalAmount: vehicleTotalYuan,
        downPaymentRatio,
        loanYears,
        annualInterestRate: interestRate,
        repaymentType,
        additionalFees: decodeCarFees(snapshot.carFeesEncoded),
      })

      return { type: 'c', result }
    }

    const mortgageFeature = toMortgageFeatureMode(snapshot.mortgageFeatureMode)
    const loanYears = snapshot.mortgageYearIndex + 1
    const advancedRemainingYears = snapshot.advancedRemainingYearIndex + 1

    if (mortgageFeature === 'lpr') {
      const adjustMode = toLprAdjustMode(snapshot.lprAdjustMode)
      const result = calculateLprComparison({
        remainingLoanAmount: parseInputNumber(snapshot.advancedBalanceWan) * 10000,
        remainingYears: advancedRemainingYears,
        originalAnnualInterestRate: parseInputNumber(snapshot.advancedOriginalRate),
        repaymentType,
        adjustMode,
        newAnnualInterestRate:
          adjustMode === LPR_ADJUST_MODE.NEW_RATE
            ? parseInputNumber(snapshot.lprNewRate)
            : undefined,
        rateCutBasisPoints:
          adjustMode === LPR_ADJUST_MODE.BASIS_POINTS
            ? parseInputNumber(snapshot.lprBasisPoints)
            : undefined,
      })
      return { type: 'm', feature: 'l', result }
    }

    if (mortgageFeature === 'early_repayment') {
      const result = calculateEarlyRepayment({
        remainingLoanAmount: parseInputNumber(snapshot.advancedBalanceWan) * 10000,
        originalAnnualInterestRate: parseInputNumber(snapshot.advancedOriginalRate),
        remainingYears: advancedRemainingYears,
        repaymentType,
        prepaymentAmount: parseInputNumber(snapshot.earlyPrepaymentWan) * 10000,
        mode: toEarlyRepaymentMode(snapshot.earlyRepaymentMode),
      })
      return { type: 'm', feature: 'e', result }
    }

    const mortgageLoanType = toMortgageLoanType(snapshot.mortgageLoanType)
    const commercialAmountYuan = parseInputNumber(snapshot.commercialLoanWan) * 10000
    const commercialRate = parseInputNumber(snapshot.commercialInterestRate)
    const fundAmountYuan = parseInputNumber(snapshot.fundLoanWan) * 10000
    const fundRate = parseInputNumber(snapshot.fundInterestRate)

    if (mortgageLoanType === 'commercial') {
      const result = calculateLoan({
        totalLoanAmount: commercialAmountYuan,
        loanYears,
        annualInterestRate: commercialRate,
        repaymentType,
      })
      return { type: 'm', feature: 's', result }
    }

    if (mortgageLoanType === 'fund') {
      const result = calculateLoan({
        totalLoanAmount: fundAmountYuan,
        loanYears,
        annualInterestRate: fundRate,
        repaymentType,
      })
      return { type: 'm', feature: 's', result }
    }

    const result = calculateCombinedLoan({
      commercialLoanAmount: commercialAmountYuan,
      commercialAnnualInterestRate: commercialRate,
      fundLoanAmount: fundAmountYuan,
      fundAnnualInterestRate: fundRate,
      loanYears,
      repaymentType,
    })
    return { type: 'm', feature: 's', result }
  } catch (error) {
    if (error instanceof LoanValidationError || error instanceof CarValidationError) {
      return null
    }
    return null
  }
}

interface ShareTitleOptions {
  calculationState: ShareCalculationState | null
  downPaymentPercentLabel: string
}

/** 构建分享标题（有结果时动态定制，否则默认文案） */
export function buildShareTitle(options: ShareTitleOptions): string {
  const { calculationState, downPaymentPercentLabel } = options

  if (!calculationState) {
    return DEFAULT_SHARE_TITLE
  }

  if (calculationState.type === 'c') {
    return `🚗 我的新车贷款方案算好了！首付${downPaymentPercentLabel}，快帮我看看这个利息和车险划不划算？`
  }

  if (calculationState.feature === 'l') {
    const monthlyPayment = formatShareCurrency(calculationState.result.after.monthlyPayment)
    return `🏠 我刚用这个神器算了一笔房贷，每月月供是 ${monthlyPayment} 元，利息省了好多，你也来算算！`
  }

  if (calculationState.feature === 'e') {
    const monthlyPayment = formatShareCurrency(calculationState.result.newMonthlyPayment)
    return `🏠 我刚用这个神器算了一笔房贷，每月月供是 ${monthlyPayment} 元，利息省了好多，你也来算算！`
  }

  const monthlyPayment = formatShareCurrency(
    calculationState.result.monthlyPayments[0].monthlyPayment,
  )
  return `🏠 我刚用这个神器算了一笔房贷，每月月供是 ${monthlyPayment} 元，利息省了好多，你也来算算！`
}

/** 构建转发 path（含 Query） */
export function buildShareAppPath(snapshot: ShareFormSnapshot): string {
  return `${SHARE_PAGE_PATH}?${buildShareQuery(snapshot)}`
}

export function encodeCarFeesForm(fees: {
  vehicleTax: { enabled: boolean; amount: string }
  insurance: { enabled: boolean; amount: string }
  licensePlate: { enabled: boolean; amount: string }
}): string {
  const encodeItem = (item: { enabled: boolean; amount: string }) =>
    `${item.enabled ? 1 : 0}-${item.amount.trim() || '0'}`
  return [
    encodeItem(fees.vehicleTax),
    encodeItem(fees.insurance),
    encodeItem(fees.licensePlate),
  ].join('|')
}

/** 解码车贷附加费用到表单结构 */
export function decodeCarFeesForm(encoded: string): {
  vehicleTax: { enabled: boolean; amount: string }
  insurance: { enabled: boolean; amount: string }
  licensePlate: { enabled: boolean; amount: string }
} {
  const decoded = decodeCarFees(encoded)
  return {
    vehicleTax: {
      enabled: decoded.vehicleTax.enabled,
      amount: String(decoded.vehicleTax.amount),
    },
    insurance: {
      enabled: decoded.insurance.enabled,
      amount: String(decoded.insurance.amount),
    },
    licensePlate: {
      enabled: decoded.licensePlate.enabled,
      amount: String(decoded.licensePlate.amount),
    },
  }
}
