import {
  calculateLoan,
  LoanCalculationResult,
  LoanValidationError,
  MonthlyPaymentItem,
  REPAYMENT_TYPE,
} from './calculator'

/** 附加费用默认估算值（元），供页面初始化使用 */
export const CAR_FEE_DEFAULTS = {
  /** 车船税（元/年） */
  vehicleTaxPerYear: 420,
  /** 交强险 + 商业险（元） */
  insurance: 5500,
  /** 上牌费（元） */
  licensePlate: 500,
} as const

/** 单项附加费用配置 */
export interface CarAdditionalFeeItem {
  /** 是否计入购车总花费 */
  enabled: boolean
  /** 金额（元）；车船税为单年金额，其余为一次性费用 */
  amount: number
}

/** 车贷附加费用入参 */
export interface CarAdditionalFeesInput {
  vehicleTax: CarAdditionalFeeItem
  insurance: CarAdditionalFeeItem
  licensePlate: CarAdditionalFeeItem
}

/** 车贷计算入参 */
export interface CarLoanInput {
  /** 车辆总价（元） */
  vehicleTotalAmount: number
  /** 首付比例（小数，如 0.3 表示 30%） */
  downPaymentRatio: number
  /** 贷款年限（1~5 年） */
  loanYears: number
  /** 年利率（百分比） */
  annualInterestRate: number
  /** 还款方式 */
  repaymentType: REPAYMENT_TYPE
  /** 附加费用（勾选 + 自定义金额） */
  additionalFees: CarAdditionalFeesInput
}

/** 附加费用明细 */
export interface CarFeeBreakdown {
  vehicleTax: number
  insurance: number
  licensePlate: number
}

/** 车贷计算结果 */
export interface CarLoanResult {
  /** 车辆总价（元） */
  vehicleTotalAmount: number
  /** 首付款（元） */
  downPayment: number
  /** 贷款本金（元）= 车辆总价 - 首付款 */
  loanAmount: number
  /** 总利息（元） */
  totalInterest: number
  /** 月供列表 */
  monthlyPayments: MonthlyPaymentItem[]
  /** 贷款总还款额（元）= 贷款本金 + 总利息 */
  totalRepayment: number
  /** 附加费用合计（元） */
  additionalFees: number
  /** 附加费用拆解 */
  feeBreakdown: CarFeeBreakdown
  /** 购车总花费（元）= 首付款 + 贷款总还款 + 附加费用 */
  totalPurchaseCost: number
}

/** 车贷校验错误 */
export class CarValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CarValidationError'
  }
}

/** 元转分 */
function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100)
}

/** 分转元 */
function fenToYuan(fen: number): number {
  return Math.round(fen) / 100
}

/**
 * 校验单项附加费用金额
 */
function validateFeeItem(label: string, item: CarAdditionalFeeItem): void {
  if (!item.enabled) {
    return
  }

  if (!Number.isFinite(item.amount) || item.amount < 0) {
    throw new CarValidationError(`${label}金额不能为负数`)
  }
}

/**
 * 校验车贷入参
 * @throws {CarValidationError | LoanValidationError}
 */
export function validateCarLoanInput(input: CarLoanInput): void {
  const { vehicleTotalAmount, downPaymentRatio, loanYears, annualInterestRate, additionalFees } =
    input

  if (!Number.isFinite(vehicleTotalAmount) || vehicleTotalAmount <= 0) {
    throw new CarValidationError('车辆总价必须大于 0')
  }

  if (!Number.isFinite(downPaymentRatio) || downPaymentRatio <= 0 || downPaymentRatio >= 1) {
    throw new CarValidationError('首付比例必须在 0% ~ 100% 之间')
  }

  if (!Number.isFinite(loanYears) || loanYears <= 0 || loanYears > 5 || !Number.isInteger(loanYears)) {
    throw new CarValidationError('车贷年限必须为 1~5 年的整数')
  }

  if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0 || annualInterestRate > 100) {
    throw new CarValidationError('年利率必须在 0 ~ 100 之间')
  }

  validateFeeItem('车船税', additionalFees.vehicleTax)
  validateFeeItem('强险/商业险', additionalFees.insurance)
  validateFeeItem('上牌费', additionalFees.licensePlate)

  const vehicleTotalFen = yuanToFen(vehicleTotalAmount)
  const downPaymentFen = Math.round(vehicleTotalFen * downPaymentRatio)
  const loanAmountFen = vehicleTotalFen - downPaymentFen

  if (loanAmountFen <= 0) {
    throw new CarValidationError('贷款金额必须大于 0，请调整首付比例')
  }
}

/**
 * 计算附加费用（仅累计已勾选且金额有效的项目）
 */
function calculateAdditionalFees(
  loanYears: number,
  fees: CarAdditionalFeesInput,
): { total: number; breakdown: CarFeeBreakdown } {
  const vehicleTaxPerYear = fees.vehicleTax.enabled ? fees.vehicleTax.amount : 0
  const insuranceAmount = fees.insurance.enabled ? fees.insurance.amount : 0
  const licensePlateAmount = fees.licensePlate.enabled ? fees.licensePlate.amount : 0

  const breakdown: CarFeeBreakdown = {
    // 车船税 = 用户输入的单年金额 × 贷款年限
    vehicleTax: vehicleTaxPerYear * loanYears,
    insurance: insuranceAmount,
    licensePlate: licensePlateAmount,
  }

  const totalFen =
    yuanToFen(breakdown.vehicleTax) +
    yuanToFen(breakdown.insurance) +
    yuanToFen(breakdown.licensePlate)

  return {
    total: fenToYuan(totalFen),
    breakdown,
  }
}

/**
 * 车贷核心计算入口
 * 贷款本金 = 车辆总价 - 首付款，再套用等额本息/本金公式
 */
export function calculateCarLoan(input: CarLoanInput): CarLoanResult {
  validateCarLoanInput(input)

  const {
    vehicleTotalAmount,
    downPaymentRatio,
    loanYears,
    annualInterestRate,
    repaymentType,
    additionalFees,
  } = input

  const vehicleTotalFen = yuanToFen(vehicleTotalAmount)
  const downPaymentFen = Math.round(vehicleTotalFen * downPaymentRatio)
  const loanAmountFen = vehicleTotalFen - downPaymentFen

  const downPayment = fenToYuan(downPaymentFen)
  const loanAmount = fenToYuan(loanAmountFen)

  const loanResult: LoanCalculationResult = calculateLoan({
    totalLoanAmount: loanAmount,
    loanYears,
    annualInterestRate,
    repaymentType,
  })

  const { total: additionalFeesTotal, breakdown: feeBreakdown } = calculateAdditionalFees(
    loanYears,
    additionalFees,
  )

  const totalPurchaseCostFen =
    downPaymentFen + yuanToFen(loanResult.totalRepayment) + yuanToFen(additionalFeesTotal)

  return {
    vehicleTotalAmount,
    downPayment,
    loanAmount,
    totalInterest: loanResult.totalInterest,
    monthlyPayments: loanResult.monthlyPayments,
    totalRepayment: loanResult.totalRepayment,
    additionalFees: additionalFeesTotal,
    feeBreakdown,
    totalPurchaseCost: fenToYuan(totalPurchaseCostFen),
  }
}
