import Taro from '@tarojs/taro'
import { REPAYMENT_TYPE } from './calculator'
import { EARLY_REPAYMENT_MODE } from './earlyRepaymentCalculator'
import { LPR_ADJUST_MODE } from './lprCalculator'
import { SAVED_CAR_PARAMS_KEY, SAVED_MORTGAGE_PARAMS_KEY } from '../config/retention'

/** 车贷附加费用表单项 */
interface CarFeeFormItem {
  enabled: boolean
  amount: string
}

/** 车贷附加费用表单状态 */
export type SavedCarFeesForm = Record<'vehicleTax' | 'insurance' | 'licensePlate', CarFeeFormItem>

/** 已保存的房贷常用参数 */
export interface SavedMortgageParams {
  repaymentType: REPAYMENT_TYPE
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
  lprAdjustMode: LPR_ADJUST_MODE
  lprNewRate: string
  lprBasisPoints: string
  earlyPrepaymentWan: string
  earlyRepaymentMode: EARLY_REPAYMENT_MODE
}

/** 已保存的车贷常用参数 */
export interface SavedCarParams {
  repaymentType: REPAYMENT_TYPE
  vehiclePriceWan: string
  downPaymentIndex: number
  carYearIndex: number
  carInterestRate: string
  carFeesForm: SavedCarFeesForm
}

function isRepaymentType(value: unknown): value is REPAYMENT_TYPE {
  return value === REPAYMENT_TYPE.INTEREST || value === REPAYMENT_TYPE.PRINCIPAL
}

function isLprAdjustMode(value: unknown): value is LPR_ADJUST_MODE {
  return value === LPR_ADJUST_MODE.NEW_RATE || value === LPR_ADJUST_MODE.BASIS_POINTS
}

function isEarlyRepaymentMode(value: unknown): value is EARLY_REPAYMENT_MODE {
  return (
    value === EARLY_REPAYMENT_MODE.SHORTEN_TERM || value === EARLY_REPAYMENT_MODE.REDUCE_PAYMENT
  )
}

function parseCarFeesForm(value: unknown): SavedCarFeesForm | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const keys: Array<keyof SavedCarFeesForm> = ['vehicleTax', 'insurance', 'licensePlate']
  const form = value as Partial<SavedCarFeesForm>
  const result = {} as SavedCarFeesForm

  for (const key of keys) {
    const item = form[key]
    if (typeof item !== 'object' || item === null) {
      return null
    }
    const enabled = (item as CarFeeFormItem).enabled
    const amount = (item as CarFeeFormItem).amount
    if (typeof enabled !== 'boolean' || typeof amount !== 'string') {
      return null
    }
    result[key] = { enabled, amount }
  }

  return result
}

function parseMortgageParams(value: unknown): SavedMortgageParams | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const params = value as Partial<SavedMortgageParams>

  if (!isRepaymentType(params.repaymentType)) {
    return null
  }
  if (typeof params.mortgageFeatureMode !== 'string') {
    return null
  }
  if (typeof params.mortgageLoanType !== 'string') {
    return null
  }
  if (typeof params.commercialLoanWan !== 'string') {
    return null
  }
  if (typeof params.commercialInterestRate !== 'string') {
    return null
  }
  if (typeof params.fundLoanWan !== 'string') {
    return null
  }
  if (typeof params.fundInterestRate !== 'string') {
    return null
  }
  if (!Number.isInteger(params.mortgageYearIndex) || params.mortgageYearIndex < 0) {
    return null
  }
  if (typeof params.advancedBalanceWan !== 'string') {
    return null
  }
  if (!Number.isInteger(params.advancedRemainingYearIndex) || params.advancedRemainingYearIndex < 0) {
    return null
  }
  if (typeof params.advancedOriginalRate !== 'string') {
    return null
  }
  if (!isLprAdjustMode(params.lprAdjustMode)) {
    return null
  }
  if (typeof params.lprNewRate !== 'string') {
    return null
  }
  if (typeof params.lprBasisPoints !== 'string') {
    return null
  }
  if (typeof params.earlyPrepaymentWan !== 'string') {
    return null
  }
  if (!isEarlyRepaymentMode(params.earlyRepaymentMode)) {
    return null
  }

  return params as SavedMortgageParams
}

function parseCarParams(value: unknown): SavedCarParams | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const params = value as Partial<SavedCarParams>

  if (!isRepaymentType(params.repaymentType)) {
    return null
  }
  if (typeof params.vehiclePriceWan !== 'string') {
    return null
  }
  if (!Number.isInteger(params.downPaymentIndex) || params.downPaymentIndex < 0) {
    return null
  }
  if (!Number.isInteger(params.carYearIndex) || params.carYearIndex < 0) {
    return null
  }
  if (typeof params.carInterestRate !== 'string') {
    return null
  }

  const carFeesForm = parseCarFeesForm(params.carFeesForm)
  if (!carFeesForm) {
    return null
  }

  return {
    repaymentType: params.repaymentType,
    vehiclePriceWan: params.vehiclePriceWan,
    downPaymentIndex: params.downPaymentIndex,
    carYearIndex: params.carYearIndex,
    carInterestRate: params.carInterestRate,
    carFeesForm,
  }
}

/** 读取已保存的房贷常用参数 */
export function loadSavedMortgageParams(): SavedMortgageParams | null {
  try {
    const storedValue = Taro.getStorageSync(SAVED_MORTGAGE_PARAMS_KEY)
    if (storedValue === '' || storedValue === undefined || storedValue === null) {
      return null
    }
    return parseMortgageParams(storedValue)
  } catch {
    return null
  }
}

/** 读取已保存的车贷常用参数 */
export function loadSavedCarParams(): SavedCarParams | null {
  try {
    const storedValue = Taro.getStorageSync(SAVED_CAR_PARAMS_KEY)
    if (storedValue === '' || storedValue === undefined || storedValue === null) {
      return null
    }
    return parseCarParams(storedValue)
  } catch {
    return null
  }
}

/** 持久化房贷常用参数 */
export function saveMortgageParams(params: SavedMortgageParams): void {
  Taro.setStorageSync(SAVED_MORTGAGE_PARAMS_KEY, params)
}

/** 持久化车贷常用参数 */
export function saveCarParams(params: SavedCarParams): void {
  Taro.setStorageSync(SAVED_CAR_PARAMS_KEY, params)
}
