import {
  calculateLoan,
  getRepresentativeMonthlyPayment,
  LoanValidationError,
  REPAYMENT_TYPE,
} from './calculator'

/** LPR 利率调整方式 */
export enum LPR_ADJUST_MODE {
  /** 直接输入新利率 */
  NEW_RATE = 'new_rate',
  /** 输入下调基点（1 基点 = 0.01%） */
  BASIS_POINTS = 'basis_points',
}

/** LPR 对比测算入参 */
export interface LprComparisonInput {
  /** 当前贷款余额（元） */
  remainingLoanAmount: number
  /** 剩余年限 */
  remainingYears: number
  /** 原贷款年利率（%） */
  originalAnnualInterestRate: number
  /** 还款方式 */
  repaymentType: REPAYMENT_TYPE
  /** 调整方式 */
  adjustMode: LPR_ADJUST_MODE
  /** 新贷款年利率（%），adjustMode = NEW_RATE 时使用 */
  newAnnualInterestRate?: number
  /** 下调基点（正数表示下降），adjustMode = BASIS_POINTS 时使用 */
  rateCutBasisPoints?: number
}

/** 单组对比数据 */
export interface LprComparisonSnapshot {
  /** 代表性月供（等额本息为固定月供，等额本金为首月月供） */
  monthlyPayment: number
  /** 剩余期数内总利息 */
  totalInterest: number
  /** 剩余期数内总还款额 */
  totalRepayment: number
}

/** LPR 对比测算结果 */
export interface LprComparisonResult {
  /** 调整前 */
  before: LprComparisonSnapshot
  /** 调整后 */
  after: LprComparisonSnapshot
  /** 节省金额 */
  savings: {
    monthlyPayment: number
    totalInterest: number
  }
  /** 实际采用的新年利率（%） */
  appliedNewAnnualInterestRate: number
}

function validateRemainingYears(remainingYears: number): void {
  if (!Number.isFinite(remainingYears) || remainingYears <= 0 || !Number.isInteger(remainingYears)) {
    throw new LoanValidationError('剩余年限必须为正整数')
  }
}

function resolveNewAnnualInterestRate(input: LprComparisonInput): number {
  const { originalAnnualInterestRate, adjustMode, newAnnualInterestRate, rateCutBasisPoints } = input

  if (adjustMode === LPR_ADJUST_MODE.NEW_RATE) {
    if (!Number.isFinite(newAnnualInterestRate ?? Number.NaN)) {
      throw new LoanValidationError('请输入新贷款年利率')
    }
    if ((newAnnualInterestRate as number) < 0 || (newAnnualInterestRate as number) > 100) {
      throw new LoanValidationError('新贷款年利率必须在 0 ~ 100 之间')
    }
    return newAnnualInterestRate as number
  }

  if (!Number.isFinite(rateCutBasisPoints ?? Number.NaN) || (rateCutBasisPoints as number) < 0) {
    throw new LoanValidationError('下调基点必须大于等于 0')
  }

  const newRate = originalAnnualInterestRate - (rateCutBasisPoints as number) / 100
  if (newRate < 0) {
    throw new LoanValidationError('下调幅度过大，新利率不能小于 0')
  }

  return newRate
}

function buildSnapshot(
  remainingLoanAmount: number,
  remainingYears: number,
  annualInterestRate: number,
  repaymentType: REPAYMENT_TYPE,
): LprComparisonSnapshot {
  const result = calculateLoan({
    totalLoanAmount: remainingLoanAmount,
    loanYears: remainingYears,
    annualInterestRate,
    repaymentType,
  })

  return {
    monthlyPayment: getRepresentativeMonthlyPayment(result.monthlyPayments),
    totalInterest: result.totalInterest,
    totalRepayment: result.totalRepayment,
  }
}

/**
 * LPR 降息对比测算
 */
export function calculateLprComparison(input: LprComparisonInput): LprComparisonResult {
  const {
    remainingLoanAmount,
    remainingYears,
    originalAnnualInterestRate,
    repaymentType,
  } = input

  if (!Number.isFinite(remainingLoanAmount) || remainingLoanAmount <= 0) {
    throw new LoanValidationError('当前贷款余额必须大于 0')
  }

  validateRemainingYears(remainingYears)

  if (
    !Number.isFinite(originalAnnualInterestRate) ||
    originalAnnualInterestRate < 0 ||
    originalAnnualInterestRate > 100
  ) {
    throw new LoanValidationError('原贷款年利率必须在 0 ~ 100 之间')
  }

  const appliedNewAnnualInterestRate = resolveNewAnnualInterestRate(input)

  const before = buildSnapshot(
    remainingLoanAmount,
    remainingYears,
    originalAnnualInterestRate,
    repaymentType,
  )
  const after = buildSnapshot(
    remainingLoanAmount,
    remainingYears,
    appliedNewAnnualInterestRate,
    repaymentType,
  )

  return {
    before,
    after,
    savings: {
      monthlyPayment: Math.max(before.monthlyPayment - after.monthlyPayment, 0),
      totalInterest: Math.max(before.totalInterest - after.totalInterest, 0),
    },
    appliedNewAnnualInterestRate,
  }
}
