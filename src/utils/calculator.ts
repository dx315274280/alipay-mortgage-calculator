/**
 * 房贷核心计算工具
 * 金额内部以「分」为单位运算，避免浮点精度问题
 */

/** 还款方式 */
export enum REPAYMENT_TYPE {
  /** 等额本息 */
  INTEREST = 'interest',
  /** 等额本金 */
  PRINCIPAL = 'principal',
}

/** 贷款计算入参 */
export interface LoanCalculationInput {
  /** 贷款总额（元） */
  totalLoanAmount: number
  /** 贷款年限 */
  loanYears: number
  /** 年利率（百分比，如 4.2 表示 4.2%） */
  annualInterestRate: number
  /** 还款方式 */
  repaymentType: REPAYMENT_TYPE
}

/** 按总月数计算的贷款入参 */
export interface LoanByMonthsInput {
  /** 贷款总额（元） */
  totalLoanAmount: number
  /** 贷款总月数 */
  totalMonths: number
  /** 年利率（%） */
  annualInterestRate: number
  /** 还款方式 */
  repaymentType: REPAYMENT_TYPE
}

/** 单期还款明细 */
export interface MonthlyPaymentItem {
  /** 期数（从 1 开始） */
  period: number
  /** 月供（元） */
  monthlyPayment: number
  /** 当期本金（元） */
  principal: number
  /** 当期利息（元） */
  interest: number
  /** 剩余本金（元） */
  remainingPrincipal: number
}

/** 贷款计算结果 */
export interface LoanCalculationResult {
  /** 总利息（元） */
  totalInterest: number
  /** 月供列表 */
  monthlyPayments: MonthlyPaymentItem[]
  /** 总还款额（元）= 贷款本金 + 总利息 */
  totalRepayment: number
}

/** 组合贷款计算入参（金额单位：元） */
export interface CombinedLoanInput {
  /** 商业贷款金额（元） */
  commercialLoanAmount: number
  /** 商业贷款年利率（%） */
  commercialAnnualInterestRate: number
  /** 公积金贷款金额（元） */
  fundLoanAmount: number
  /** 公积金贷款年利率（%） */
  fundAnnualInterestRate: number
  /** 贷款年限 */
  loanYears: number
  /** 还款方式 */
  repaymentType: REPAYMENT_TYPE
}

/** 输入校验错误 */
export class LoanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanValidationError'
  }
}

/** 元转分（四舍五入到整数分） */
function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100)
}

/** 分转元（保留 2 位小数） */
function fenToYuan(fen: number): number {
  return Math.round(fen) / 100
}

/** 根据年利率计算月利率（小数形式，如 0.0035） */
export function getMonthlyRate(annualInterestRate: number): number {
  return annualInterestRate / 100 / 12
}

/**
 * 校验贷款计算入参
 * @throws {LoanValidationError} 参数不合法时抛出
 */
export function validateLoanInput(input: LoanCalculationInput): void {
  const { totalLoanAmount, loanYears, annualInterestRate } = input

  if (!Number.isFinite(totalLoanAmount) || totalLoanAmount <= 0) {
    throw new LoanValidationError('贷款总额必须大于 0')
  }

  if (!Number.isFinite(loanYears) || loanYears <= 0 || !Number.isInteger(loanYears)) {
    throw new LoanValidationError('贷款年限必须为正整数')
  }

  if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0 || annualInterestRate > 100) {
    throw new LoanValidationError('年利率必须在 0 ~ 100 之间')
  }

  if (!Object.values(REPAYMENT_TYPE).includes(input.repaymentType)) {
    throw new LoanValidationError('还款方式无效')
  }
}

/**
 * 校验年利率
 */
function validateAnnualInterestRate(annualInterestRate: number, fieldLabel: string): void {
  if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0 || annualInterestRate > 100) {
    throw new LoanValidationError(`${fieldLabel}必须在 0 ~ 100 之间`)
  }
}

/**
 * 校验贷款年限
 */
function validateLoanYears(loanYears: number): void {
  if (!Number.isFinite(loanYears) || loanYears <= 0 || !Number.isInteger(loanYears)) {
    throw new LoanValidationError('贷款年限必须为正整数')
  }
}

/**
 * 校验组合贷入参
 * @throws {LoanValidationError}
 */
export function validateCombinedLoanInput(input: CombinedLoanInput): void {
  const {
    commercialLoanAmount,
    commercialAnnualInterestRate,
    fundLoanAmount,
    fundAnnualInterestRate,
    loanYears,
    repaymentType,
  } = input

  validateLoanYears(loanYears)
  validateAnnualInterestRate(commercialAnnualInterestRate, '商业贷款年利率')
  validateAnnualInterestRate(fundAnnualInterestRate, '公积金贷款年利率')

  if (!Object.values(REPAYMENT_TYPE).includes(repaymentType)) {
    throw new LoanValidationError('还款方式无效')
  }

  if (!Number.isFinite(commercialLoanAmount) || commercialLoanAmount <= 0) {
    throw new LoanValidationError('商业贷款金额必须大于 0')
  }

  if (!Number.isFinite(fundLoanAmount) || fundLoanAmount <= 0) {
    throw new LoanValidationError('公积金贷款金额必须大于 0')
  }
}

/**
 * 等额本息：计算固定月供（分）
 * 公式：M = P × R × (1+R)^N / ((1+R)^N - 1)
 */
export function calculateEqualInterestMonthlyPaymentFen(
  principalFen: number,
  monthlyRate: number,
  totalMonths: number,
): number {
  if (monthlyRate === 0) {
    return Math.round(principalFen / totalMonths)
  }

  const compoundFactor = Math.pow(1 + monthlyRate, totalMonths)
  const monthlyPaymentFen = (principalFen * monthlyRate * compoundFactor) / (compoundFactor - 1)

  return Math.round(monthlyPaymentFen)
}

/**
 * 等额本息还款计划
 */
function buildEqualInterestSchedule(
  principalFen: number,
  monthlyRate: number,
  totalMonths: number,
): MonthlyPaymentItem[] {
  const fixedMonthlyPaymentFen = calculateEqualInterestMonthlyPaymentFen(
    principalFen,
    monthlyRate,
    totalMonths,
  )

  const schedule: MonthlyPaymentItem[] = []
  let remainingPrincipalFen = principalFen

  for (let period = 1; period <= totalMonths; period += 1) {
    const isLastPeriod = period === totalMonths

    // 当期利息 = 剩余本金 × 月利率，四舍五入到分
    const interestFen = Math.round(remainingPrincipalFen * monthlyRate)

    // 最后一期：本金还清剩余全部，月供 = 本金 + 利息
    const principalFenThisPeriod = isLastPeriod
      ? remainingPrincipalFen
      : fixedMonthlyPaymentFen - interestFen

    const monthlyPaymentFen = isLastPeriod
      ? principalFenThisPeriod + interestFen
      : fixedMonthlyPaymentFen

    remainingPrincipalFen -= principalFenThisPeriod

    schedule.push({
      period,
      monthlyPayment: fenToYuan(monthlyPaymentFen),
      principal: fenToYuan(principalFenThisPeriod),
      interest: fenToYuan(interestFen),
      remainingPrincipal: fenToYuan(Math.max(remainingPrincipalFen, 0)),
    })
  }

  return schedule
}

/**
 * 等额本金还款计划
 * 首月月供 M₁ = P/N + P×R，每月递减 d = (P/N) × R
 */
function buildEqualPrincipalSchedule(
  principalFen: number,
  monthlyRate: number,
  totalMonths: number,
): MonthlyPaymentItem[] {
  const schedule: MonthlyPaymentItem[] = []
  let remainingPrincipalFen = principalFen

  // 每月应还本金（分），除不尽时末月补齐差额
  const baseMonthlyPrincipalFen = Math.floor(principalFen / totalMonths)

  for (let period = 1; period <= totalMonths; period += 1) {
    const isLastPeriod = period === totalMonths

    const principalFenThisPeriod = isLastPeriod
      ? remainingPrincipalFen
      : baseMonthlyPrincipalFen

    const interestFen = Math.round(remainingPrincipalFen * monthlyRate)
    const monthlyPaymentFen = principalFenThisPeriod + interestFen

    remainingPrincipalFen -= principalFenThisPeriod

    schedule.push({
      period,
      monthlyPayment: fenToYuan(monthlyPaymentFen),
      principal: fenToYuan(principalFenThisPeriod),
      interest: fenToYuan(interestFen),
      remainingPrincipal: fenToYuan(Math.max(remainingPrincipalFen, 0)),
    })
  }

  return schedule
}

/**
 * 根据还款计划汇总总利息与总还款额
 */
function summarizeSchedule(
  principalFen: number,
  schedule: MonthlyPaymentItem[],
): Pick<LoanCalculationResult, 'totalInterest' | 'totalRepayment'> {
  const totalInterestFen = schedule.reduce(
    (sum, item) => sum + yuanToFen(item.interest),
    0,
  )

  return {
    totalInterest: fenToYuan(totalInterestFen),
    totalRepayment: fenToYuan(principalFen + totalInterestFen),
  }
}

/**
 * 构建单笔贷款还款计划（按总月数）
 */
export function buildLoanScheduleByMonths(
  totalLoanAmount: number,
  totalMonths: number,
  annualInterestRate: number,
  repaymentType: REPAYMENT_TYPE,
): MonthlyPaymentItem[] {
  const principalFen = yuanToFen(totalLoanAmount)
  const monthlyRate = getMonthlyRate(annualInterestRate)

  return repaymentType === REPAYMENT_TYPE.INTEREST
    ? buildEqualInterestSchedule(principalFen, monthlyRate, totalMonths)
    : buildEqualPrincipalSchedule(principalFen, monthlyRate, totalMonths)
}

/**
 * 获取代表性月供（等额本息为固定月供，等额本金为首月月供）
 */
export function getRepresentativeMonthlyPayment(
  monthlyPayments: MonthlyPaymentItem[],
): number {
  return monthlyPayments[0]?.monthlyPayment ?? 0
}

/**
 * 构建单笔贷款还款计划
 */
function buildLoanSchedule(
  totalLoanAmount: number,
  loanYears: number,
  annualInterestRate: number,
  repaymentType: REPAYMENT_TYPE,
): MonthlyPaymentItem[] {
  const principalFen = yuanToFen(totalLoanAmount)
  const totalMonths = loanYears * 12
  const monthlyRate = getMonthlyRate(annualInterestRate)

  return repaymentType === REPAYMENT_TYPE.INTEREST
    ? buildEqualInterestSchedule(principalFen, monthlyRate, totalMonths)
    : buildEqualPrincipalSchedule(principalFen, monthlyRate, totalMonths)
}

/**
 * 合并多笔贷款还款计划（按期数逐字段相加，以「分」保证精度）
 */
function mergeMonthlySchedules(schedules: MonthlyPaymentItem[][]): MonthlyPaymentItem[] {
  if (schedules.length === 0) {
    return []
  }

  const totalMonths = schedules[0].length

  return Array.from({ length: totalMonths }, (_, index) => {
    const period = index + 1
    let monthlyPaymentFen = 0
    let principalFen = 0
    let interestFen = 0
    let remainingPrincipalFen = 0

    schedules.forEach((schedule) => {
      const item = schedule[index]
      monthlyPaymentFen += yuanToFen(item.monthlyPayment)
      principalFen += yuanToFen(item.principal)
      interestFen += yuanToFen(item.interest)
      remainingPrincipalFen += yuanToFen(item.remainingPrincipal)
    })

    return {
      period,
      monthlyPayment: fenToYuan(monthlyPaymentFen),
      principal: fenToYuan(principalFen),
      interest: fenToYuan(interestFen),
      remainingPrincipal: fenToYuan(remainingPrincipalFen),
    }
  })
}

/**
 * 房贷核心计算入口
 *
 * @param input 贷款总额（元）、年限、年利率（%）、还款方式
 * @returns 总利息、月供列表、总还款额
 *
 * @example
 * const result = calculateLoan({
 *   totalLoanAmount: 1_000_000,
 *   loanYears: 30,
 *   annualInterestRate: 4.2,
 *   repaymentType: REPAYMENT_TYPE.INTEREST,
 * })
 */
export function calculateLoan(input: LoanCalculationInput): LoanCalculationResult {
  validateLoanInput(input)

  const { totalLoanAmount, loanYears, annualInterestRate, repaymentType } = input
  const principalFen = yuanToFen(totalLoanAmount)
  const monthlyPayments = buildLoanSchedule(
    totalLoanAmount,
    loanYears,
    annualInterestRate,
    repaymentType,
  )

  const { totalInterest, totalRepayment } = summarizeSchedule(principalFen, monthlyPayments)

  return {
    totalInterest,
    monthlyPayments,
    totalRepayment,
  }
}

/**
 * 按总月数计算贷款（提前还款、LPR 等场景）
 */
export function calculateLoanByMonths(input: LoanByMonthsInput): LoanCalculationResult {
  const { totalLoanAmount, totalMonths, annualInterestRate, repaymentType } = input

  if (!Number.isFinite(totalLoanAmount) || totalLoanAmount <= 0) {
    throw new LoanValidationError('贷款金额必须大于 0')
  }

  if (!Number.isFinite(totalMonths) || totalMonths <= 0 || !Number.isInteger(totalMonths)) {
    throw new LoanValidationError('贷款月数必须为正整数')
  }

  validateAnnualInterestRate(annualInterestRate, '年利率')

  if (!Object.values(REPAYMENT_TYPE).includes(repaymentType)) {
    throw new LoanValidationError('还款方式无效')
  }

  const principalFen = yuanToFen(totalLoanAmount)
  const monthlyPayments = buildLoanScheduleByMonths(
    totalLoanAmount,
    totalMonths,
    annualInterestRate,
    repaymentType,
  )
  const { totalInterest, totalRepayment } = summarizeSchedule(principalFen, monthlyPayments)

  return {
    totalInterest,
    monthlyPayments,
    totalRepayment,
  }
}

/**
 * 组合贷款计算入口
 * 分别计算商贷与公积金贷明细，再按期合并
 */
export function calculateCombinedLoan(input: CombinedLoanInput): LoanCalculationResult {
  validateCombinedLoanInput(input)

  const {
    commercialLoanAmount,
    commercialAnnualInterestRate,
    fundLoanAmount,
    fundAnnualInterestRate,
    loanYears,
    repaymentType,
  } = input

  const commercialSchedule = buildLoanSchedule(
    commercialLoanAmount,
    loanYears,
    commercialAnnualInterestRate,
    repaymentType,
  )
  const fundSchedule = buildLoanSchedule(
    fundLoanAmount,
    loanYears,
    fundAnnualInterestRate,
    repaymentType,
  )

  const monthlyPayments = mergeMonthlySchedules([commercialSchedule, fundSchedule])
  const totalPrincipalFen = yuanToFen(commercialLoanAmount) + yuanToFen(fundLoanAmount)
  const { totalInterest, totalRepayment } = summarizeSchedule(totalPrincipalFen, monthlyPayments)

  return {
    totalInterest,
    monthlyPayments,
    totalRepayment,
  }
}
