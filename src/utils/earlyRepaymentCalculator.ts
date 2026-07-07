import {
  buildLoanScheduleByMonths,
  calculateEqualInterestMonthlyPaymentFen,
  calculateLoanByMonths,
  getMonthlyRate,
  getRepresentativeMonthlyPayment,
  LoanValidationError,
  REPAYMENT_TYPE,
} from './calculator'

/** 提前还款优化模式 */
export enum EARLY_REPAYMENT_MODE {
  /** 保持月供不变，缩短还款年限 */
  SHORTEN_TERM = 'shorten_term',
  /** 保持年限不变，减少月供 */
  REDUCE_PAYMENT = 'reduce_payment',
}

/** 提前还款试算入参 */
export interface EarlyRepaymentInput {
  /** 当前贷款余额（元） */
  remainingLoanAmount: number
  /** 原贷款年利率（%） */
  originalAnnualInterestRate: number
  /** 剩余年限 */
  remainingYears: number
  /** 还款方式 */
  repaymentType: REPAYMENT_TYPE
  /** 准备提前还款金额（元） */
  prepaymentAmount: number
  /** 优化模式 */
  mode: EARLY_REPAYMENT_MODE
}

/** 提前还款试算结果 */
export interface EarlyRepaymentResult {
  /** 原剩余总利息 */
  originalTotalInterest: number
  /** 提前还款后剩余总利息 */
  newTotalInterest: number
  /** 可节省总利息 */
  interestSaved: number
  /** 原代表性月供 */
  originalMonthlyPayment: number
  /** 提前还款后代表性月供 */
  newMonthlyPayment: number
  /** 原剩余月数 */
  originalRemainingMonths: number
  /** 提前还款后剩余月数 */
  newRemainingMonths: number
  /** 提前还款后剩余年限（展示用，向上取整年） */
  newRemainingYears: number
  /** 提前还款后剩余本金 */
  newRemainingLoanAmount: number
  /** 优化模式 */
  mode: EARLY_REPAYMENT_MODE
}

function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100)
}

function fenToYuan(fen: number): number {
  return Math.round(fen) / 100
}

function sumScheduleInterest(schedule: ReturnType<typeof buildLoanScheduleByMonths>): number {
  return fenToYuan(schedule.reduce((sum, item) => sum + yuanToFen(item.interest), 0))
}

/**
 * 等额本息：在月供不变前提下，求缩短后的月数
 */
function findEqualInterestMonthsWithFixedPayment(
  principalFen: number,
  monthlyRate: number,
  targetPaymentFen: number,
  maxMonths: number,
): number {
  if (targetPaymentFen <= 0) {
    return maxMonths
  }

  if (monthlyRate === 0) {
    return Math.max(1, Math.ceil(principalFen / targetPaymentFen))
  }

  for (let month = 1; month <= maxMonths; month += 1) {
    const paymentFen = calculateEqualInterestMonthlyPaymentFen(principalFen, monthlyRate, month)
    if (paymentFen <= targetPaymentFen) {
      return month
    }
  }

  return maxMonths
}

/**
 * 等额本金：保持每月应还本金不变，求缩短后的月数
 */
function findEqualPrincipalMonthsWithFixedMonthlyPrincipal(
  newPrincipalFen: number,
  fixedMonthlyPrincipalFen: number,
): number {
  if (fixedMonthlyPrincipalFen <= 0) {
    return 1
  }

  return Math.max(1, Math.ceil(newPrincipalFen / fixedMonthlyPrincipalFen))
}

/**
 * 提前还款试算
 */
export function calculateEarlyRepayment(input: EarlyRepaymentInput): EarlyRepaymentResult {
  const {
    remainingLoanAmount,
    originalAnnualInterestRate,
    remainingYears,
    repaymentType,
    prepaymentAmount,
    mode,
  } = input

  if (!Number.isFinite(remainingLoanAmount) || remainingLoanAmount <= 0) {
    throw new LoanValidationError('当前贷款余额必须大于 0')
  }

  if (!Number.isFinite(remainingYears) || remainingYears <= 0 || !Number.isInteger(remainingYears)) {
    throw new LoanValidationError('剩余年限必须为正整数')
  }

  if (
    !Number.isFinite(originalAnnualInterestRate) ||
    originalAnnualInterestRate < 0 ||
    originalAnnualInterestRate > 100
  ) {
    throw new LoanValidationError('原贷款年利率必须在 0 ~ 100 之间')
  }

  if (!Number.isFinite(prepaymentAmount) || prepaymentAmount <= 0) {
    throw new LoanValidationError('提前还款金额必须大于 0')
  }

  if (prepaymentAmount >= remainingLoanAmount) {
    throw new LoanValidationError('提前还款金额不能大于或等于当前贷款余额')
  }

  const originalRemainingMonths = remainingYears * 12
  const originalSchedule = buildLoanScheduleByMonths(
    remainingLoanAmount,
    originalRemainingMonths,
    originalAnnualInterestRate,
    repaymentType,
  )
  const originalTotalInterest = sumScheduleInterest(originalSchedule)
  const originalMonthlyPayment = getRepresentativeMonthlyPayment(originalSchedule)

  const newRemainingLoanAmount = remainingLoanAmount - prepaymentAmount
  const newPrincipalFen = yuanToFen(newRemainingLoanAmount)
  const monthlyRate = getMonthlyRate(originalAnnualInterestRate)

  let newRemainingMonths = originalRemainingMonths
  let newSchedule = buildLoanScheduleByMonths(
    newRemainingLoanAmount,
    originalRemainingMonths,
    originalAnnualInterestRate,
    repaymentType,
  )

  if (mode === EARLY_REPAYMENT_MODE.SHORTEN_TERM) {
    if (repaymentType === REPAYMENT_TYPE.INTEREST) {
      const targetPaymentFen = yuanToFen(originalMonthlyPayment)
      newRemainingMonths = findEqualInterestMonthsWithFixedPayment(
        newPrincipalFen,
        monthlyRate,
        targetPaymentFen,
        originalRemainingMonths,
      )
    } else {
      const originalPrincipalFen = yuanToFen(remainingLoanAmount)
      const fixedMonthlyPrincipalFen = Math.floor(originalPrincipalFen / originalRemainingMonths)
      newRemainingMonths = findEqualPrincipalMonthsWithFixedMonthlyPrincipal(
        newPrincipalFen,
        fixedMonthlyPrincipalFen,
      )
    }

    newSchedule = buildLoanScheduleByMonths(
      newRemainingLoanAmount,
      newRemainingMonths,
      originalAnnualInterestRate,
      repaymentType,
    )
  }

  const newTotalInterest = sumScheduleInterest(newSchedule)
  const newMonthlyPayment = getRepresentativeMonthlyPayment(newSchedule)
  const interestSaved = Math.max(originalTotalInterest - newTotalInterest, 0)

  return {
    originalTotalInterest,
    newTotalInterest,
    interestSaved,
    originalMonthlyPayment,
    newMonthlyPayment,
    originalRemainingMonths,
    newRemainingMonths,
    newRemainingYears: Math.ceil(newRemainingMonths / 12),
    newRemainingLoanAmount,
    mode,
  }
}
