import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Canvas, Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import {
  AD_DAILY_UNLOCK_LIMIT,
  AD_UNLOCK_FREE_PREVIEW_COUNT,
  IS_AD_OPEN,
} from '../../config/ad'
import {
  incrementAdClickCount,
  isAdLockBypassedToday,
} from '../../utils/adUnlock'
import {
  dismissFavoriteGuideForToday,
  shouldShowFavoriteGuide,
} from '../../utils/favoriteGuide'
import { getNavBarMetrics, NavBarMetrics } from '../../utils/navBarLayout'
import { AD_PLACEHOLDER_TEXT, FAVORITE_GUIDE_TEXT, IS_ALIPAY, IS_WEAPP } from '../../utils/platform'
import {
  loadSavedCarParams,
  loadSavedMortgageParams,
  saveCarParams,
  saveMortgageParams,
  SavedCarParams,
  SavedMortgageParams,
} from '../../utils/savedParams'
import {
  buildShareAppPath,
  buildShareQuery,
  buildShareTitle,
  calculateFromShareSnapshot,
  decodeCarFeesForm,
  encodeCarFeesForm,
  hasShareQueryParams,
  parseShareQuery,
  ShareCalculationState,
  ShareFormSnapshot,
} from '../../utils/shareParams'
import {
  buildPosterData,
  buildPosterFormContext,
  generatePosterImage,
  mapToPosterCalculationState,
  POSTER_CANVAS_ID,
  POSTER_LOGICAL_WIDTH,
  POSTER_MIN_LOGICAL_HEIGHT,
  previewPosterImage,
} from '../../utils/posterCanvas'
import {
  calculateCombinedLoan,
  calculateLoan,
  LoanCalculationResult,
  LoanValidationError,
  MonthlyPaymentItem,
  REPAYMENT_TYPE,
} from '../../utils/calculator'
import {
  calculateCarLoan,
  CAR_FEE_DEFAULTS,
  CarAdditionalFeesInput,
  CarLoanResult,
  CarValidationError,
} from '../../utils/carCalculator'
import {
  calculateEarlyRepayment,
  EARLY_REPAYMENT_MODE,
  EarlyRepaymentResult,
} from '../../utils/earlyRepaymentCalculator'
import {
  calculateLprComparison,
  LPR_ADJUST_MODE,
  LprComparisonResult,
} from '../../utils/lprCalculator'
import './index.scss'

/** 计算器大分类 */
enum CALCULATOR_TYPE {
  MORTGAGE = 'mortgage',
  CAR = 'car',
}

/** 房贷功能模块 */
enum MORTGAGE_FEATURE_MODE {
  STANDARD = 'standard',
  LPR = 'lpr',
  EARLY_REPAYMENT = 'early_repayment',
}

const MORTGAGE_FEATURE_OPTIONS: Array<{ mode: MORTGAGE_FEATURE_MODE; label: string }> = [
  { mode: MORTGAGE_FEATURE_MODE.STANDARD, label: '常规测算' },
  { mode: MORTGAGE_FEATURE_MODE.LPR, label: 'LPR实时测算' },
  { mode: MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT, label: '提前还款试算' },
]

const EARLY_REPAYMENT_MODE_OPTIONS: Array<{ mode: EARLY_REPAYMENT_MODE; label: string }> = [
  { mode: EARLY_REPAYMENT_MODE.SHORTEN_TERM, label: '缩短期限' },
  { mode: EARLY_REPAYMENT_MODE.REDUCE_PAYMENT, label: '减少月供' },
]

const LPR_ADJUST_MODE_OPTIONS: Array<{ mode: LPR_ADJUST_MODE; label: string }> = [
  { mode: LPR_ADJUST_MODE.NEW_RATE, label: '输入新利率' },
  { mode: LPR_ADJUST_MODE.BASIS_POINTS, label: '输入下调基点' },
]

/** 房贷子类型 */
enum MORTGAGE_LOAN_TYPE {
  COMMERCIAL = 'commercial',
  FUND = 'fund',
  COMBINED = 'combined',
}

const MORTGAGE_LOAN_TYPE_OPTIONS: Array<{ type: MORTGAGE_LOAN_TYPE; label: string }> = [
  { type: MORTGAGE_LOAN_TYPE.COMMERCIAL, label: '纯商业贷' },
  { type: MORTGAGE_LOAN_TYPE.FUND, label: '纯公积金贷' },
  { type: MORTGAGE_LOAN_TYPE.COMBINED, label: '组合贷款' },
]

/** 房贷年限：1 ~ 30 年 */
const MORTGAGE_YEAR_OPTIONS = Array.from({ length: 30 }, (_, index) => `${index + 1}年`)

/** 房贷默认 30 年（Picker index = 29） */
const DEFAULT_MORTGAGE_YEAR_INDEX = MORTGAGE_YEAR_OPTIONS.length - 1

/** 导航栏标题映射 */
const NAVIGATION_TITLE_MAP: Record<CALCULATOR_TYPE, string> = {
  [CALCULATOR_TYPE.MORTGAGE]: '房贷计算器',
  [CALCULATOR_TYPE.CAR]: '车贷计算器',
}

/** 车贷年限：1 ~ 5 年 */
const CAR_YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => `${index + 1}年`)

/** 首付比例选项：10% ~ 90% */
const DOWN_PAYMENT_OPTIONS = [
  { label: '10%', ratio: 0.1 },
  { label: '20%', ratio: 0.2 },
  { label: '30%', ratio: 0.3 },
  { label: '40%', ratio: 0.4 },
  { label: '50%', ratio: 0.5 },
  { label: '60%', ratio: 0.6 },
  { label: '70%', ratio: 0.7 },
  { label: '80%', ratio: 0.8 },
  { label: '90%', ratio: 0.9 },
]

const DOWN_PAYMENT_LABELS = DOWN_PAYMENT_OPTIONS.map((item) => item.label)

/** 首付默认 30%（index = 2） */
const DEFAULT_DOWN_PAYMENT_INDEX = DOWN_PAYMENT_OPTIONS.findIndex((item) => item.ratio === 0.3)

/** 附加费用表单字段 key */
type CarFeeKey = keyof CarAdditionalFeesInput

/** 附加费用表单单项 */
interface CarFeeFormItem {
  enabled: boolean
  amount: string
}

type CarFeesFormState = Record<CarFeeKey, CarFeeFormItem>

/** 附加费用表单项配置 */
const ADDITIONAL_FEE_OPTIONS: Array<{
  key: CarFeeKey
  label: string
  unit: string
  defaultAmount: number
}> = [
  {
    key: 'vehicleTax',
    label: '车船税',
    unit: '元/年',
    defaultAmount: CAR_FEE_DEFAULTS.vehicleTaxPerYear,
  },
  {
    key: 'insurance',
    label: '强险/商业险',
    unit: '元',
    defaultAmount: CAR_FEE_DEFAULTS.insurance,
  },
  {
    key: 'licensePlate',
    label: '上牌费',
    unit: '元',
    defaultAmount: CAR_FEE_DEFAULTS.licensePlate,
  },
]

const DEFAULT_CAR_FEES_FORM: CarFeesFormState = {
  vehicleTax: { enabled: false, amount: String(CAR_FEE_DEFAULTS.vehicleTaxPerYear) },
  insurance: { enabled: false, amount: String(CAR_FEE_DEFAULTS.insurance) },
  licensePlate: { enabled: false, amount: String(CAR_FEE_DEFAULTS.licensePlate) },
}

/** 金额格式化为千分位 + 两位小数 */
function formatCurrency(amount: number): string {
  const [integerPart, decimalPart] = amount.toFixed(2).split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${formattedInteger}.${decimalPart}`
}

/** 解析用户输入的数字 */
function parseInputNumber(value: string): number {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return Number.NaN
  }
  return Number(trimmedValue)
}

type CalculationState =
  | {
      type: CALCULATOR_TYPE.MORTGAGE
      feature: MORTGAGE_FEATURE_MODE.STANDARD
      result: LoanCalculationResult
    }
  | {
      type: CALCULATOR_TYPE.MORTGAGE
      feature: MORTGAGE_FEATURE_MODE.LPR
      result: LprComparisonResult
    }
  | {
      type: CALCULATOR_TYPE.MORTGAGE
      feature: MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT
      result: EarlyRepaymentResult
    }
  | { type: CALCULATOR_TYPE.CAR; result: CarLoanResult }

/** 将分享计算结果映射为页面 CalculationState */
function mapShareResultToCalculationState(shareResult: ShareCalculationState): CalculationState {
  if (shareResult.type === 'c') {
    return { type: CALCULATOR_TYPE.CAR, result: shareResult.result }
  }
  if (shareResult.feature === 'l') {
    return {
      type: CALCULATOR_TYPE.MORTGAGE,
      feature: MORTGAGE_FEATURE_MODE.LPR,
      result: shareResult.result,
    }
  }
  if (shareResult.feature === 'e') {
    return {
      type: CALCULATOR_TYPE.MORTGAGE,
      feature: MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT,
      result: shareResult.result,
    }
  }
  return {
    type: CALCULATOR_TYPE.MORTGAGE,
    feature: MORTGAGE_FEATURE_MODE.STANDARD,
    result: shareResult.result,
  }
}

/** 将页面 CalculationState 转为分享标题用的计算态 */
function mapCalculationStateToShareState(
  state: CalculationState | null,
): ShareCalculationState | null {
  if (!state) {
    return null
  }
  if (state.type === CALCULATOR_TYPE.CAR) {
    return { type: 'c', result: state.result }
  }
  if (state.feature === MORTGAGE_FEATURE_MODE.LPR) {
    return { type: 'm', feature: 'l', result: state.result }
  }
  if (state.feature === MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT) {
    return { type: 'm', feature: 'e', result: state.result }
  }
  return { type: 'm', feature: 's', result: state.result }
}

export default function MortgagePage() {
  const [calculatorType, setCalculatorType] = useState<CALCULATOR_TYPE>(CALCULATOR_TYPE.MORTGAGE)
  const [repaymentType, setRepaymentType] = useState<REPAYMENT_TYPE>(REPAYMENT_TYPE.INTEREST)
  const [mortgageLoanType, setMortgageLoanType] = useState<MORTGAGE_LOAN_TYPE>(
    MORTGAGE_LOAN_TYPE.COMMERCIAL,
  )
  const [mortgageFeatureMode, setMortgageFeatureMode] = useState<MORTGAGE_FEATURE_MODE>(
    MORTGAGE_FEATURE_MODE.STANDARD,
  )

  // 房贷字段
  const [commercialLoanWan, setCommercialLoanWan] = useState('')
  const [commercialInterestRate, setCommercialInterestRate] = useState('3.55')
  const [fundLoanWan, setFundLoanWan] = useState('')
  const [fundInterestRate, setFundInterestRate] = useState('2.85')
  const [mortgageYearIndex, setMortgageYearIndex] = useState(DEFAULT_MORTGAGE_YEAR_INDEX)

  // LPR / 提前还款共用字段
  const [advancedBalanceWan, setAdvancedBalanceWan] = useState('')
  const [advancedRemainingYearIndex, setAdvancedRemainingYearIndex] = useState(19)
  const [advancedOriginalRate, setAdvancedOriginalRate] = useState('4.2')
  const [lprAdjustMode, setLprAdjustMode] = useState<LPR_ADJUST_MODE>(LPR_ADJUST_MODE.BASIS_POINTS)
  const [lprNewRate, setLprNewRate] = useState('3.95')
  const [lprBasisPoints, setLprBasisPoints] = useState('25')
  const [earlyPrepaymentWan, setEarlyPrepaymentWan] = useState('')
  const [earlyRepaymentMode, setEarlyRepaymentMode] = useState<EARLY_REPAYMENT_MODE>(
    EARLY_REPAYMENT_MODE.SHORTEN_TERM,
  )

  // 车贷字段
  const [vehiclePriceWan, setVehiclePriceWan] = useState('')
  const [downPaymentIndex, setDownPaymentIndex] = useState(DEFAULT_DOWN_PAYMENT_INDEX)
  const [carYearIndex, setCarYearIndex] = useState(2)
  const [carInterestRate, setCarInterestRate] = useState('5.88')
  const [carFeesForm, setCarFeesForm] = useState<CarFeesFormState>(DEFAULT_CAR_FEES_FORM)

  const [calculationState, setCalculationState] = useState<CalculationState | null>(null)
  /** 每次计算成功后递增，用于重新触发结果区淡入动画 */
  const [resultAnimKey, setResultAnimKey] = useState(0)
  /** 当日免锁：同一天 click_ad_count >= 2，次日重置 */
  const [isDailyAdLockBypassed, setIsDailyAdLockBypassed] = useState(() => isAdLockBypassedToday())
  /** 本次计算是否已通过广告解锁明细 */
  const [isScheduleUnlocked, setIsScheduleUnlocked] = useState(() => isAdLockBypassedToday())
  /** 是否展示「添加到我的小程序」引导 */
  const [showFavoriteGuide, setShowFavoriteGuide] = useState(false)
  /** 导航栏 CSS 变量：useState 同步初始化，首屏即有正确占位高度 */
  const [navBarMetrics] = useState<NavBarMetrics>(() => getNavBarMetrics())
  const navBarCssVars = navBarMetrics.cssVars
  /** 防止分享接流 / 本地回显重复初始化 */
  const hasPageInitializedRef = useRef(false)
  /** 海报生成中 */
  const [isPosterGenerating, setIsPosterGenerating] = useState(false)

  const isMortgage = calculatorType === CALCULATOR_TYPE.MORTGAGE
  const isStandardMortgage = isMortgage && mortgageFeatureMode === MORTGAGE_FEATURE_MODE.STANDARD
  const isEqualInterest = repaymentType === REPAYMENT_TYPE.INTEREST
  const loanYears = isMortgage ? mortgageYearIndex + 1 : carYearIndex + 1
  const advancedRemainingYears = advancedRemainingYearIndex + 1

  const monthlyPayments =
    calculationState?.type === CALCULATOR_TYPE.MORTGAGE &&
    calculationState.feature === MORTGAGE_FEATURE_MODE.STANDARD
      ? calculationState.result.monthlyPayments
      : []

  const isAdvancedMortgageResult =
    calculationState?.type === CALCULATOR_TYPE.MORTGAGE &&
    (calculationState.feature === MORTGAGE_FEATURE_MODE.LPR ||
      calculationState.feature === MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT)

  /** 高阶功能结果是否被广告锁遮挡 */
  const isAdvancedResultLocked = useMemo(() => {
    if (!IS_AD_OPEN || !isAdvancedMortgageResult) {
      return false
    }
    return !isDailyAdLockBypassed && !isScheduleUnlocked
  }, [
    isAdvancedMortgageResult,
    isDailyAdLockBypassed,
    isScheduleUnlocked,
  ])

  /** 等额本金每月递减金额 */
  const monthlyDecrease = useMemo(() => {
    if (!calculationState || isEqualInterest) {
      return 0
    }

    const payments =
      calculationState.type === CALCULATOR_TYPE.CAR
        ? calculationState.result.monthlyPayments
        : calculationState.type === CALCULATOR_TYPE.MORTGAGE &&
            calculationState.feature === MORTGAGE_FEATURE_MODE.STANDARD
          ? calculationState.result.monthlyPayments
          : []

    if (payments.length < 2) {
      return 0
    }

    return payments[0].monthlyPayment - payments[1].monthlyPayment
  }, [calculationState, isEqualInterest])

  /** 从本地缓存同步当日广告解锁状态（跨天会自动失效） */
  const syncAdUnlockStateFromStorage = () => {
    const bypassedToday = isAdLockBypassedToday()
    setIsDailyAdLockBypassed(bypassedToday)
    if (bypassedToday) {
      setIsScheduleUnlocked(true)
    }
  }

  /** 是否对常规房贷明细列表启用「第 5 条后广告锁」 */
  const isScheduleLockActive = useMemo(() => {
    if (!IS_AD_OPEN) {
      return false
    }
    if (
      calculationState?.type !== CALCULATOR_TYPE.MORTGAGE ||
      calculationState.feature !== MORTGAGE_FEATURE_MODE.STANDARD
    ) {
      return false
    }
    if (isDailyAdLockBypassed || isScheduleUnlocked) {
      return false
    }
    return monthlyPayments.length > AD_UNLOCK_FREE_PREVIEW_COUNT
  }, [calculationState, isDailyAdLockBypassed, isScheduleUnlocked, monthlyPayments.length])

  /** 当前应展示的明细行（锁生效时仅前 5 条） */
  const visibleMonthlyPayments = useMemo(() => {
    if (!isScheduleLockActive) {
      return monthlyPayments
    }
    return monthlyPayments.slice(0, AD_UNLOCK_FREE_PREVIEW_COUNT)
  }, [isScheduleLockActive, monthlyPayments])

  /** 被锁隐藏的明细条数 */
  const lockedPaymentCount = isScheduleLockActive
    ? monthlyPayments.length - AD_UNLOCK_FREE_PREVIEW_COUNT
    : 0

  /** 高阶结果被广告锁遮挡时不展示分享操作 */
  const canShowResultShareActions = Boolean(calculationState) && !isAdvancedResultLocked

  /** 构建海报表单上下文 */
  const buildCurrentPosterFormContext = () =>
    buildPosterFormContext({
      isEqualInterest,
      mortgageFeatureMode,
      mortgageLoanType,
      commercialLoanWan,
      commercialInterestRate,
      fundLoanWan,
      fundInterestRate,
      mortgageYearIndex,
      advancedBalanceWan,
      advancedRemainingYearIndex,
      advancedOriginalRate,
      lprAdjustMode,
      lprNewRate,
      lprBasisPoints,
      earlyPrepaymentWan,
      earlyRepaymentMode,
      vehiclePriceWan,
      downPaymentIndex,
      carYearIndex,
      carInterestRate,
    })

  /** 生成测算账单海报并预览 / 分享 */
  const handleGeneratePoster = async () => {
    if (!calculationState || isPosterGenerating) {
      return
    }

    const posterCalculation = mapToPosterCalculationState(
      calculationState.type === CALCULATOR_TYPE.CAR ? 'car' : 'mortgage',
      calculationState.type === CALCULATOR_TYPE.MORTGAGE
        ? calculationState.feature
        : 'standard',
      calculationState.result,
    )

    if (!posterCalculation) {
      Taro.showToast({ title: '暂无可用测算结果', icon: 'none' })
      return
    }

    const posterData = buildPosterData(posterCalculation, buildCurrentPosterFormContext())

    setIsPosterGenerating(true)
    Taro.showLoading({ title: '海报生成中...' })

    try {
      const tempFilePath = await generatePosterImage(posterData)
      await previewPosterImage(tempFilePath)
    } catch {
      Taro.showToast({ title: '海报生成失败，请重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
      setIsPosterGenerating(false)
    }
  }

  /** 将分享链接参数写入表单 */
  const applyShareSnapshot = (snapshot: ShareFormSnapshot) => {
    setCalculatorType(
      snapshot.calculatorType === 'm' ? CALCULATOR_TYPE.MORTGAGE : CALCULATOR_TYPE.CAR,
    )
    setRepaymentType(
      snapshot.repaymentType === 'p' ? REPAYMENT_TYPE.PRINCIPAL : REPAYMENT_TYPE.INTEREST,
    )
    setMortgageFeatureMode(
      snapshot.mortgageFeatureMode === 'l'
        ? MORTGAGE_FEATURE_MODE.LPR
        : snapshot.mortgageFeatureMode === 'e'
          ? MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT
          : MORTGAGE_FEATURE_MODE.STANDARD,
    )
    setMortgageLoanType(
      snapshot.mortgageLoanType === 'f'
        ? MORTGAGE_LOAN_TYPE.FUND
        : snapshot.mortgageLoanType === 'b'
          ? MORTGAGE_LOAN_TYPE.COMBINED
          : MORTGAGE_LOAN_TYPE.COMMERCIAL,
    )
    setCommercialLoanWan(snapshot.commercialLoanWan)
    setCommercialInterestRate(snapshot.commercialInterestRate)
    setFundLoanWan(snapshot.fundLoanWan)
    setFundInterestRate(snapshot.fundInterestRate)
    setMortgageYearIndex(snapshot.mortgageYearIndex)
    setAdvancedBalanceWan(snapshot.advancedBalanceWan)
    setAdvancedRemainingYearIndex(snapshot.advancedRemainingYearIndex)
    setAdvancedOriginalRate(snapshot.advancedOriginalRate)
    setLprAdjustMode(
      snapshot.lprAdjustMode === 'n' ? LPR_ADJUST_MODE.NEW_RATE : LPR_ADJUST_MODE.BASIS_POINTS,
    )
    setLprNewRate(snapshot.lprNewRate)
    setLprBasisPoints(snapshot.lprBasisPoints)
    setEarlyPrepaymentWan(snapshot.earlyPrepaymentWan)
    setEarlyRepaymentMode(
      snapshot.earlyRepaymentMode === 'r'
        ? EARLY_REPAYMENT_MODE.REDUCE_PAYMENT
        : EARLY_REPAYMENT_MODE.SHORTEN_TERM,
    )
    setVehiclePriceWan(snapshot.vehiclePriceWan)
    setDownPaymentIndex(snapshot.downPaymentIndex)
    setCarYearIndex(snapshot.carYearIndex)
    setCarInterestRate(snapshot.carInterestRate)
    setCarFeesForm(decodeCarFeesForm(snapshot.carFeesEncoded))
  }

  /** 将已保存的房贷参数写入表单 */
  const applySavedMortgageParams = (params: SavedMortgageParams) => {
    setRepaymentType(params.repaymentType)
    setMortgageFeatureMode(params.mortgageFeatureMode as MORTGAGE_FEATURE_MODE)
    setMortgageLoanType(params.mortgageLoanType as MORTGAGE_LOAN_TYPE)
    setCommercialLoanWan(params.commercialLoanWan)
    setCommercialInterestRate(params.commercialInterestRate)
    setFundLoanWan(params.fundLoanWan)
    setFundInterestRate(params.fundInterestRate)
    setMortgageYearIndex(params.mortgageYearIndex)
    setAdvancedBalanceWan(params.advancedBalanceWan)
    setAdvancedRemainingYearIndex(params.advancedRemainingYearIndex)
    setAdvancedOriginalRate(params.advancedOriginalRate)
    setLprAdjustMode(params.lprAdjustMode)
    setLprNewRate(params.lprNewRate)
    setLprBasisPoints(params.lprBasisPoints)
    setEarlyPrepaymentWan(params.earlyPrepaymentWan)
    setEarlyRepaymentMode(params.earlyRepaymentMode)
  }

  /** 将已保存的车贷参数写入表单 */
  const applySavedCarParams = (params: SavedCarParams) => {
    setVehiclePriceWan(params.vehiclePriceWan)
    setDownPaymentIndex(params.downPaymentIndex)
    setCarYearIndex(params.carYearIndex)
    setCarInterestRate(params.carInterestRate)
    setCarFeesForm(params.carFeesForm)
  }

  useDidShow(() => {
    syncAdUnlockStateFromStorage()
    setShowFavoriteGuide(shouldShowFavoriteGuide())
  })

  const showCalculationResult = (state: CalculationState) => {
    const bypassedToday = isAdLockBypassedToday()
    setCalculationState(state)
    setResultAnimKey((prev) => prev + 1)
    setIsDailyAdLockBypassed(bypassedToday)
    // 当日未达 2 次时，每次重新计算需再次解锁；当日已达 2 次则全天免锁
    setIsScheduleUnlocked(bypassedToday)
  }

  /** 用户点击 Grid / 激励广告并成功触发解锁 */
  const handleAdUnlockClick = () => {
    if (!IS_AD_OPEN || isDailyAdLockBypassed || isScheduleUnlocked) {
      return
    }

    const nextClickCount = incrementAdClickCount()
    setIsScheduleUnlocked(true)

    if (nextClickCount >= AD_DAILY_UNLOCK_LIMIT) {
      setIsDailyAdLockBypassed(true)
      Taro.showToast({ title: '今日已解锁全部明细', icon: 'success' })
      return
    }

    Taro.showToast({
      title: `已解锁本次明细，今日再点 ${AD_DAILY_UNLOCK_LIMIT - nextClickCount} 次广告即可全天免锁`,
      icon: 'none',
    })
  }

  const handleCalculatorTypeChange = (type: CALCULATOR_TYPE) => {
    setCalculatorType(type)
    setCalculationState(null)

    const savedParams =
      type === CALCULATOR_TYPE.MORTGAGE ? loadSavedMortgageParams() : loadSavedCarParams()
    if (savedParams?.repaymentType) {
      setRepaymentType(savedParams.repaymentType)
    }
  }

  /** 保存当前表单为常用参数（房贷 / 车贷分别缓存） */
  const handleSaveParams = () => {
    try {
      if (isMortgage) {
        saveMortgageParams({
          repaymentType,
          mortgageFeatureMode,
          mortgageLoanType,
          commercialLoanWan,
          commercialInterestRate,
          fundLoanWan,
          fundInterestRate,
          mortgageYearIndex,
          advancedBalanceWan,
          advancedRemainingYearIndex,
          advancedOriginalRate,
          lprAdjustMode,
          lprNewRate,
          lprBasisPoints,
          earlyPrepaymentWan,
          earlyRepaymentMode,
        })
      } else {
        saveCarParams({
          repaymentType,
          vehiclePriceWan,
          downPaymentIndex,
          carYearIndex,
          carInterestRate,
          carFeesForm,
        })
      }

      Taro.showToast({ title: '保存成功！下次打开自动回显', icon: 'success' })
    } catch {
      Taro.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
    }
  }

  /** 关闭收藏引导，当天不再展示 */
  const handleDismissFavoriteGuide = () => {
    dismissFavoriteGuideForToday()
    setShowFavoriteGuide(false)
  }

  const handleRepaymentTypeChange = (type: REPAYMENT_TYPE) => {
    setRepaymentType(type)
    setCalculationState(null)
  }

  const handleMortgageLoanTypeChange = (type: MORTGAGE_LOAN_TYPE) => {
    setMortgageLoanType(type)
    setCalculationState(null)
  }

  const handleMortgageFeatureModeChange = (mode: MORTGAGE_FEATURE_MODE) => {
    setMortgageFeatureMode(mode)
    setCalculationState(null)
  }

  const toggleCarFee = (key: CarFeeKey) => {
    setCarFeesForm((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }))
    setCalculationState(null)
  }

  const updateCarFeeAmount = (key: CarFeeKey, amount: string) => {
    setCarFeesForm((prev) => ({
      ...prev,
      [key]: { ...prev[key], amount },
    }))
    setCalculationState(null)
  }

  /** 将表单状态转换为计算器入参 */
  const buildCarAdditionalFeesInput = (): CarAdditionalFeesInput => ({
    vehicleTax: {
      enabled: carFeesForm.vehicleTax.enabled,
      amount: parseInputNumber(carFeesForm.vehicleTax.amount),
    },
    insurance: {
      enabled: carFeesForm.insurance.enabled,
      amount: parseInputNumber(carFeesForm.insurance.amount),
    },
    licensePlate: {
      enabled: carFeesForm.licensePlate.enabled,
      amount: parseInputNumber(carFeesForm.licensePlate.amount),
    },
  })

  const handleCalculate = () => {
    if (isMortgage) {
      if (mortgageFeatureMode === MORTGAGE_FEATURE_MODE.LPR) {
        handleLprCalculate()
        return
      }
      if (mortgageFeatureMode === MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT) {
        handleEarlyRepaymentCalculate()
        return
      }
      handleMortgageCalculate()
      return
    }
    handleCarCalculate()
  }

  const handleMortgageCalculate = () => {
    const commercialAmountYuan = parseInputNumber(commercialLoanWan) * 10000
    const commercialRate = parseInputNumber(commercialInterestRate)
    const fundAmountYuan = parseInputNumber(fundLoanWan) * 10000
    const fundRate = parseInputNumber(fundInterestRate)

    try {
      if (mortgageLoanType === MORTGAGE_LOAN_TYPE.COMMERCIAL) {
        if (!commercialLoanWan.trim()) {
          Taro.showToast({ title: '请输入商业贷款金额', icon: 'none' })
          return
        }
        if (!commercialInterestRate.trim()) {
          Taro.showToast({ title: '请输入商业年利率', icon: 'none' })
          return
        }

        const result = calculateLoan({
          totalLoanAmount: commercialAmountYuan,
          loanYears,
          annualInterestRate: commercialRate,
          repaymentType,
        })
        showCalculationResult({
          type: CALCULATOR_TYPE.MORTGAGE,
          feature: MORTGAGE_FEATURE_MODE.STANDARD,
          result,
        })
        return
      }

      if (mortgageLoanType === MORTGAGE_LOAN_TYPE.FUND) {
        if (!fundLoanWan.trim()) {
          Taro.showToast({ title: '请输入公积金贷款金额', icon: 'none' })
          return
        }
        if (!fundInterestRate.trim()) {
          Taro.showToast({ title: '请输入公积金年利率', icon: 'none' })
          return
        }

        const result = calculateLoan({
          totalLoanAmount: fundAmountYuan,
          loanYears,
          annualInterestRate: fundRate,
          repaymentType,
        })
        showCalculationResult({
          type: CALCULATOR_TYPE.MORTGAGE,
          feature: MORTGAGE_FEATURE_MODE.STANDARD,
          result,
        })
        return
      }

      if (!commercialLoanWan.trim()) {
        Taro.showToast({ title: '请输入商业贷款金额', icon: 'none' })
        return
      }
      if (!commercialInterestRate.trim()) {
        Taro.showToast({ title: '请输入商业年利率', icon: 'none' })
        return
      }
      if (!fundLoanWan.trim()) {
        Taro.showToast({ title: '请输入公积金贷款金额', icon: 'none' })
        return
      }
      if (!fundInterestRate.trim()) {
        Taro.showToast({ title: '请输入公积金年利率', icon: 'none' })
        return
      }

      const result = calculateCombinedLoan({
        commercialLoanAmount: commercialAmountYuan,
        commercialAnnualInterestRate: commercialRate,
        fundLoanAmount: fundAmountYuan,
        fundAnnualInterestRate: fundRate,
        loanYears,
        repaymentType,
      })
      showCalculationResult({
        type: CALCULATOR_TYPE.MORTGAGE,
        feature: MORTGAGE_FEATURE_MODE.STANDARD,
        result,
      })
    } catch (error) {
      const message =
        error instanceof LoanValidationError ? error.message : '计算失败，请检查输入'
      Taro.showToast({ title: message, icon: 'none' })
    }
  }

  const handleLprCalculate = () => {
    if (!advancedBalanceWan.trim()) {
      Taro.showToast({ title: '请输入当前贷款余额', icon: 'none' })
      return
    }
    if (!advancedOriginalRate.trim()) {
      Taro.showToast({ title: '请输入原贷款年利率', icon: 'none' })
      return
    }
    if (lprAdjustMode === LPR_ADJUST_MODE.NEW_RATE && !lprNewRate.trim()) {
      Taro.showToast({ title: '请输入新贷款年利率', icon: 'none' })
      return
    }
    if (lprAdjustMode === LPR_ADJUST_MODE.BASIS_POINTS && !lprBasisPoints.trim()) {
      Taro.showToast({ title: '请输入下调基点', icon: 'none' })
      return
    }

    try {
      const result = calculateLprComparison({
        remainingLoanAmount: parseInputNumber(advancedBalanceWan) * 10000,
        remainingYears: advancedRemainingYears,
        originalAnnualInterestRate: parseInputNumber(advancedOriginalRate),
        repaymentType,
        adjustMode: lprAdjustMode,
        newAnnualInterestRate:
          lprAdjustMode === LPR_ADJUST_MODE.NEW_RATE
            ? parseInputNumber(lprNewRate)
            : undefined,
        rateCutBasisPoints:
          lprAdjustMode === LPR_ADJUST_MODE.BASIS_POINTS
            ? parseInputNumber(lprBasisPoints)
            : undefined,
      })
      showCalculationResult({
        type: CALCULATOR_TYPE.MORTGAGE,
        feature: MORTGAGE_FEATURE_MODE.LPR,
        result,
      })
    } catch (error) {
      const message =
        error instanceof LoanValidationError ? error.message : '计算失败，请检查输入'
      Taro.showToast({ title: message, icon: 'none' })
    }
  }

  const handleEarlyRepaymentCalculate = () => {
    if (!advancedBalanceWan.trim()) {
      Taro.showToast({ title: '请输入当前贷款余额', icon: 'none' })
      return
    }
    if (!advancedOriginalRate.trim()) {
      Taro.showToast({ title: '请输入原贷款年利率', icon: 'none' })
      return
    }
    if (!earlyPrepaymentWan.trim()) {
      Taro.showToast({ title: '请输入提前还款金额', icon: 'none' })
      return
    }

    try {
      const result = calculateEarlyRepayment({
        remainingLoanAmount: parseInputNumber(advancedBalanceWan) * 10000,
        originalAnnualInterestRate: parseInputNumber(advancedOriginalRate),
        remainingYears: advancedRemainingYears,
        repaymentType,
        prepaymentAmount: parseInputNumber(earlyPrepaymentWan) * 10000,
        mode: earlyRepaymentMode,
      })
      showCalculationResult({
        type: CALCULATOR_TYPE.MORTGAGE,
        feature: MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT,
        result,
      })
    } catch (error) {
      const message =
        error instanceof LoanValidationError ? error.message : '计算失败，请检查输入'
      Taro.showToast({ title: message, icon: 'none' })
    }
  }

  const handleCarCalculate = () => {
    const vehicleTotalYuan = parseInputNumber(vehiclePriceWan) * 10000
    const interestRate = parseInputNumber(carInterestRate)
    const downPaymentRatio = DOWN_PAYMENT_OPTIONS[downPaymentIndex].ratio

    if (!vehiclePriceWan.trim()) {
      Taro.showToast({ title: '请输入车辆总价', icon: 'none' })
      return
    }
    if (!carInterestRate.trim()) {
      Taro.showToast({ title: '请输入年利率', icon: 'none' })
      return
    }

    const additionalFeesInput = buildCarAdditionalFeesInput()
    const enabledFeeKeys = ADDITIONAL_FEE_OPTIONS.filter((option) => carFeesForm[option.key].enabled)

    for (const option of enabledFeeKeys) {
      const amountText = carFeesForm[option.key].amount.trim()
      if (!amountText) {
        Taro.showToast({ title: `请输入${option.label}金额`, icon: 'none' })
        return
      }
      if (!Number.isFinite(additionalFeesInput[option.key].amount)) {
        Taro.showToast({ title: `${option.label}金额格式不正确`, icon: 'none' })
        return
      }
    }

    try {
      const result = calculateCarLoan({
        vehicleTotalAmount: vehicleTotalYuan,
        downPaymentRatio,
        loanYears,
        annualInterestRate: interestRate,
        repaymentType,
        additionalFees: additionalFeesInput,
      })
      showCalculationResult({ type: CALCULATOR_TYPE.CAR, result })
    } catch (error) {
      const message =
        error instanceof CarValidationError || error instanceof LoanValidationError
          ? error.message
          : '计算失败，请检查输入'
      Taro.showToast({ title: message, icon: 'none' })
    }
  }

  /** 构建当前表单分享快照（用于带参转发） */
  const buildCurrentShareSnapshot = (): ShareFormSnapshot => ({
    calculatorType: isMortgage ? 'm' : 'c',
    repaymentType: isEqualInterest ? 'i' : 'p',
    mortgageFeatureMode:
      mortgageFeatureMode === MORTGAGE_FEATURE_MODE.LPR
        ? 'l'
        : mortgageFeatureMode === MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT
          ? 'e'
          : 's',
    mortgageLoanType:
      mortgageLoanType === MORTGAGE_LOAN_TYPE.FUND
        ? 'f'
        : mortgageLoanType === MORTGAGE_LOAN_TYPE.COMBINED
          ? 'b'
          : 'c',
    commercialLoanWan,
    commercialInterestRate,
    fundLoanWan,
    fundInterestRate,
    mortgageYearIndex,
    advancedBalanceWan,
    advancedRemainingYearIndex,
    advancedOriginalRate,
    lprAdjustMode: lprAdjustMode === LPR_ADJUST_MODE.NEW_RATE ? 'n' : 'b',
    lprNewRate,
    lprBasisPoints,
    earlyPrepaymentWan,
    earlyRepaymentMode:
      earlyRepaymentMode === EARLY_REPAYMENT_MODE.REDUCE_PAYMENT ? 'r' : 's',
    vehiclePriceWan,
    downPaymentIndex,
    carYearIndex,
    carInterestRate,
    carFeesEncoded: encodeCarFeesForm(carFeesForm),
  })

  /** 挂载初始化：分享接流优先，其次本地缓存回显 */
  useEffect(() => {
    if (hasPageInitializedRef.current) {
      return
    }
    hasPageInitializedRef.current = true

    setShowFavoriteGuide(shouldShowFavoriteGuide())

    const routerParams = Taro.getCurrentInstance().router?.params ?? {}

    if (hasShareQueryParams(routerParams)) {
      const shareSnapshot = parseShareQuery(routerParams)
      if (shareSnapshot) {
        applyShareSnapshot(shareSnapshot)

        const shareResult = calculateFromShareSnapshot(shareSnapshot)
        if (shareResult) {
          showCalculationResult(mapShareResultToCalculationState(shareResult))
        }
        return
      }
    }

    const savedMortgageParams = loadSavedMortgageParams()
    if (savedMortgageParams) {
      applySavedMortgageParams(savedMortgageParams)
    }

    const savedCarParams = loadSavedCarParams()
    if (savedCarParams) {
      applySavedCarParams(savedCarParams)
    }
  }, [])

  /** 微信转发给好友 / 支付宝分享：动态标题 + 带参 path */
  useShareAppMessage(() => {
    const snapshot = buildCurrentShareSnapshot()
    return {
      title: buildShareTitle({
        calculationState: mapCalculationStateToShareState(calculationState),
        downPaymentPercentLabel: DOWN_PAYMENT_LABELS[downPaymentIndex],
      }),
      path: buildShareAppPath(snapshot),
    }
  })

  /** 分享到朋友圈（仅微信小程序） */
  useShareTimeline(() => {
    if (!IS_WEAPP) {
      return { title: '', query: '' }
    }

    const snapshot = buildCurrentShareSnapshot()
    return {
      title: buildShareTitle({
        calculationState: mapCalculationStateToShareState(calculationState),
        downPaymentPercentLabel: DOWN_PAYMENT_LABELS[downPaymentIndex],
      }),
      query: buildShareQuery(snapshot),
    }
  })

  const displayMonthlyPayment =
    calculationState?.type === CALCULATOR_TYPE.MORTGAGE &&
    calculationState.feature === MORTGAGE_FEATURE_MODE.STANDARD
      ? formatCurrency(calculationState.result.monthlyPayments[0].monthlyPayment)
      : calculationState?.type === CALCULATOR_TYPE.CAR
        ? formatCurrency(calculationState.result.monthlyPayments[0].monthlyPayment)
        : ''

  const renderAdBanner = () => {
    if (!IS_AD_OPEN) {
      return null
    }

    return (
      <View className='calc__ad calc__ad--banner'>
        {/* 上线后替换为：<ad unit-id="YOUR_BANNER_UNIT_ID" ad-type="banner" /> */}
        <Text className='calc__ad-text'>{AD_PLACEHOLDER_TEXT}</Text>
        <Text className='calc__ad-sub'>Banner 广告位</Text>
      </View>
    )
  }

  const renderAdGrid = (onUnlockClick?: () => void) => {
    if (!IS_AD_OPEN) {
      return null
    }

    return (
      <View className='calc__ad calc__ad--grid' onClick={onUnlockClick}>
        {/* 上线后替换为：<ad unit-id="YOUR_GRID_UNIT_ID" ad-type="grid" ad-intervals="..." /> */}
        <Text className='calc__ad-text'>{AD_PLACEHOLDER_TEXT}</Text>
        <Text className='calc__ad-sub'>Grid 广告位 · 点击解锁</Text>
      </View>
    )
  }

  const renderPaymentRow = (item: MonthlyPaymentItem, index: number) => (
    <View
      key={item.period}
      className={`calc__table-row ${index % 2 === 1 ? 'calc__table-row--stripe' : ''}`}
    >
      <Text className='calc__td calc__td--period'>{item.period}</Text>
      <Text className='calc__td calc__td--payment'>{formatCurrency(item.monthlyPayment)}</Text>
      <View className='calc__td calc__td--breakdown'>
        <Text className='calc__breakdown-principal'>本 {formatCurrency(item.principal)}</Text>
        <Text className='calc__breakdown-interest'>息 {formatCurrency(item.interest)}</Text>
      </View>
      <Text className='calc__td calc__td--remaining'>
        {formatCurrency(item.remainingPrincipal)}
      </Text>
    </View>
  )

  const renderScheduleLockPanel = () => {
    if (!isScheduleLockActive) {
      return null
    }

    return (
      <View className='calc__schedule-lock'>
        <View className='calc__schedule-lock-mask'>
          <Text className='calc__schedule-lock-text'>
            点击下方广告，免费解锁剩余全部还款计划
          </Text>
          <Text className='calc__schedule-lock-hint'>
            还有 {lockedPaymentCount} 期明细待解锁
          </Text>
        </View>
        {renderAdGrid(handleAdUnlockClick)}
      </View>
    )
  }

  const renderInputWithUnit = (
    placeholder: string,
    value: string,
    unit: string,
    onInput: (inputValue: string) => void,
  ) => (
    <View className='calc__input-box'>
      <Input
        className='calc__input'
        type='digit'
        placeholder={placeholder}
        placeholderClass='calc__input-placeholder'
        value={value}
        onInput={(event) => onInput(event.detail.value)}
      />
      <Text className='calc__unit'>{unit}</Text>
    </View>
  )

  const renderMortgageFeatureTabs = () => (
    <View className='calc__feature-tabs'>
      {MORTGAGE_FEATURE_OPTIONS.map((option) => (
        <View
          key={option.mode}
          className={`calc__feature-tab ${
            mortgageFeatureMode === option.mode ? 'calc__feature-tab--active' : ''
          }`}
          onClick={() => handleMortgageFeatureModeChange(option.mode)}
        >
          <Text className='calc__feature-tab-text'>{option.label}</Text>
        </View>
      ))}
    </View>
  )

  const renderAdvancedRemainingYearField = () => (
    <View className='calc__field'>
      <Text className='calc__label'>剩余年限</Text>
      <Picker
        mode='selector'
        range={MORTGAGE_YEAR_OPTIONS}
        value={advancedRemainingYearIndex}
        onChange={(event) => setAdvancedRemainingYearIndex(Number(event.detail.value))}
      >
        <View className='calc__picker'>
          <Text className='calc__picker-value'>
            {MORTGAGE_YEAR_OPTIONS[advancedRemainingYearIndex]}
          </Text>
          <Text className='calc__picker-arrow'>›</Text>
        </View>
      </Picker>
    </View>
  )

  const renderAdvancedCommonFields = () => (
    <>
      <View className='calc__field'>
        <Text className='calc__label'>贷款余额</Text>
        {renderInputWithUnit(
          '请输入当前贷款余额',
          advancedBalanceWan,
          '万元',
          setAdvancedBalanceWan,
        )}
      </View>
      {renderAdvancedRemainingYearField()}
      <View className='calc__field'>
        <Text className='calc__label'>原贷款利率</Text>
        {renderInputWithUnit('请输入原贷款年利率', advancedOriginalRate, '%', setAdvancedOriginalRate)}
      </View>
    </>
  )

  const renderLprForm = () => (
    <>
      {renderAdvancedCommonFields()}
      <View className='calc__field calc__field--column'>
        <Text className='calc__label calc__label--block'>LPR 调整方式</Text>
        <View className='calc__mode-list'>
          {LPR_ADJUST_MODE_OPTIONS.map((option) => (
            <View
              key={option.mode}
              className={`calc__mode-item ${
                lprAdjustMode === option.mode ? 'calc__mode-item--active' : ''
              }`}
              onClick={() => setLprAdjustMode(option.mode)}
            >
              <Text className='calc__mode-item-text'>{option.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {lprAdjustMode === LPR_ADJUST_MODE.NEW_RATE ? (
        <View className='calc__field'>
          <Text className='calc__label'>新贷款利率</Text>
          {renderInputWithUnit('请输入新贷款年利率', lprNewRate, '%', setLprNewRate)}
        </View>
      ) : (
        <View className='calc__field'>
          <Text className='calc__label'>下调基点</Text>
          {renderInputWithUnit('如 25 表示降 25 基点', lprBasisPoints, 'BP', setLprBasisPoints)}
        </View>
      )}
    </>
  )

  const renderEarlyRepaymentForm = () => (
    <>
      {renderAdvancedCommonFields()}
      <View className='calc__field'>
        <Text className='calc__label'>提前还款</Text>
        {renderInputWithUnit('请输入提前还款金额', earlyPrepaymentWan, '万元', setEarlyPrepaymentWan)}
      </View>
      <View className='calc__field calc__field--column'>
        <Text className='calc__label calc__label--block'>优化模式</Text>
        <View className='calc__mode-list'>
          {EARLY_REPAYMENT_MODE_OPTIONS.map((option) => (
            <View
              key={option.mode}
              className={`calc__mode-item ${
                earlyRepaymentMode === option.mode ? 'calc__mode-item--active' : ''
              }`}
              onClick={() => setEarlyRepaymentMode(option.mode)}
            >
              <Text className='calc__mode-item-text'>{option.label}</Text>
            </View>
          ))}
        </View>
        <Text className='calc__mode-hint'>
          {earlyRepaymentMode === EARLY_REPAYMENT_MODE.SHORTEN_TERM
            ? 'A. 保持月供不变，缩短还款年限'
            : 'B. 保持年限不变，减少月供'}
        </Text>
      </View>
    </>
  )

  const renderMortgageSubTabs = () => (
    <View className='calc__sub-tabs'>
      {MORTGAGE_LOAN_TYPE_OPTIONS.map((option) => (
        <View
          key={option.type}
          className={`calc__sub-tab ${
            mortgageLoanType === option.type ? 'calc__sub-tab--active' : ''
          }`}
          onClick={() => handleMortgageLoanTypeChange(option.type)}
        >
          <Text className='calc__sub-tab-text'>{option.label}</Text>
        </View>
      ))}
    </View>
  )

  const renderMortgageYearField = () => (
    <View className='calc__field'>
      <Text className='calc__label'>贷款年限</Text>
      <Picker
        mode='selector'
        range={MORTGAGE_YEAR_OPTIONS}
        value={mortgageYearIndex}
        onChange={(event) => setMortgageYearIndex(Number(event.detail.value))}
      >
        <View className='calc__picker'>
          <Text className='calc__picker-value'>{MORTGAGE_YEAR_OPTIONS[mortgageYearIndex]}</Text>
          <Text className='calc__picker-arrow'>›</Text>
        </View>
      </Picker>
    </View>
  )

  const renderCommercialFields = () => (
    <>
      <View className='calc__field'>
        <Text className='calc__label'>商贷金额</Text>
        {renderInputWithUnit(
          '请输入商业贷款金额',
          commercialLoanWan,
          '万元',
          setCommercialLoanWan,
        )}
      </View>
      <View className='calc__field'>
        <Text className='calc__label'>商贷利率</Text>
        {renderInputWithUnit(
          '请输入商业年利率',
          commercialInterestRate,
          '%',
          setCommercialInterestRate,
        )}
      </View>
    </>
  )

  const renderFundFields = () => (
    <>
      <View className='calc__field'>
        <Text className='calc__label'>公积金金额</Text>
        {renderInputWithUnit('请输入公积金贷款金额', fundLoanWan, '万元', setFundLoanWan)}
      </View>
      <View className='calc__field'>
        <Text className='calc__label'>公积金利率</Text>
        {renderInputWithUnit('请输入公积金年利率', fundInterestRate, '%', setFundInterestRate)}
      </View>
    </>
  )

  const renderMortgageForm = () => {
    if (mortgageFeatureMode === MORTGAGE_FEATURE_MODE.LPR) {
      return renderLprForm()
    }
    if (mortgageFeatureMode === MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT) {
      return renderEarlyRepaymentForm()
    }

    const showCommercial =
      mortgageLoanType === MORTGAGE_LOAN_TYPE.COMMERCIAL ||
      mortgageLoanType === MORTGAGE_LOAN_TYPE.COMBINED
    const showFund =
      mortgageLoanType === MORTGAGE_LOAN_TYPE.FUND ||
      mortgageLoanType === MORTGAGE_LOAN_TYPE.COMBINED

    return (
      <>
        {showCommercial && renderCommercialFields()}
        {showFund && renderFundFields()}
        {renderMortgageYearField()}
      </>
    )
  }

  const renderCarForm = () => (
    <>
      <View className='calc__field'>
        <Text className='calc__label'>车辆总价</Text>
        {renderInputWithUnit('请输入车辆总价', vehiclePriceWan, '万元', setVehiclePriceWan)}
      </View>

      <View className='calc__field'>
        <Text className='calc__label'>首付比例</Text>
        <Picker
          mode='selector'
          range={DOWN_PAYMENT_LABELS}
          value={downPaymentIndex}
          onChange={(event) => setDownPaymentIndex(Number(event.detail.value))}
        >
          <View className='calc__picker'>
            <Text className='calc__picker-value'>{DOWN_PAYMENT_LABELS[downPaymentIndex]}</Text>
            <Text className='calc__picker-arrow'>›</Text>
          </View>
        </Picker>
      </View>

      <View className='calc__field'>
        <Text className='calc__label'>贷款年限</Text>
        <Picker
          mode='selector'
          range={CAR_YEAR_OPTIONS}
          value={carYearIndex}
          onChange={(event) => setCarYearIndex(Number(event.detail.value))}
        >
          <View className='calc__picker'>
            <Text className='calc__picker-value'>{CAR_YEAR_OPTIONS[carYearIndex]}</Text>
            <Text className='calc__picker-arrow'>›</Text>
          </View>
        </Picker>
      </View>

      <View className='calc__field'>
        <Text className='calc__label'>年利率</Text>
        {renderInputWithUnit('请输入年利率', carInterestRate, '%', setCarInterestRate)}
      </View>

      <View className='calc__field calc__field--column'>
        <Text className='calc__label calc__label--block'>附加费用（可自定义）</Text>
        <View className='calc__fee-list'>
          {ADDITIONAL_FEE_OPTIONS.map((option) => {
            const feeItem = carFeesForm[option.key]
            const isFeeEnabled = feeItem.enabled

            return (
              <View
                key={option.key}
                className={`calc__fee-item ${
                  isFeeEnabled ? 'calc__fee-item--active' : 'calc__fee-item--disabled'
                }`}
              >
                <View
                  className={`calc__fee-check ${
                    isFeeEnabled ? 'calc__fee-check--checked' : ''
                  }`}
                  onClick={() => toggleCarFee(option.key)}
                />
                <Text className='calc__fee-label' onClick={() => toggleCarFee(option.key)}>
                  {option.label}
                </Text>
                <View
                  className={`calc__fee-input-box ${
                    !isFeeEnabled ? 'calc__fee-input-box--disabled' : ''
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Input
                    className='calc__fee-input'
                    type='number'
                    placeholder={String(option.defaultAmount)}
                    placeholderClass='calc__fee-input-placeholder'
                    value={feeItem.amount}
                    disabled={!isFeeEnabled}
                    onInput={(event) => updateCarFeeAmount(option.key, event.detail.value)}
                  />
                  <Text className='calc__fee-unit'>{option.unit}</Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>
    </>
  )

  const renderAdvancedResultLock = () => (
    <View className='calc__advanced-lock'>
      <View className='calc__advanced-lock-mask'>
        <Text className='calc__advanced-lock-text'>点击下方广告，免费查看完整测算结果</Text>
        <Text className='calc__advanced-lock-hint'>高阶功能需观看广告解锁 · 今日点击 2 次全天免锁</Text>
      </View>
      {renderAdGrid(handleAdUnlockClick)}
    </View>
  )

  const renderLprResult = (result: LprComparisonResult) => (
    <View className='calc__compare-card calc__card--animate'>
      <Text className='calc__compare-title'>LPR 降息对比测算</Text>
      <Text className='calc__compare-subtitle'>
        新利率 {result.appliedNewAnnualInterestRate.toFixed(2)}%
      </Text>

      <View className='calc__compare-highlight'>
        <Text className='calc__compare-highlight-label'>每月可省</Text>
        <Text className='calc__compare-highlight-value'>
          ¥{formatCurrency(result.savings.monthlyPayment)}
        </Text>
        <Text className='calc__compare-highlight-sub'>
          总利息可省 ¥{formatCurrency(result.savings.totalInterest)}
        </Text>
      </View>

      <View className='calc__compare-grid'>
        <View className='calc__compare-col'>
          <Text className='calc__compare-col-title'>调整前</Text>
          <Text className='calc__compare-row-label'>月供</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.before.monthlyPayment)}
          </Text>
          <Text className='calc__compare-row-label'>剩余总利息</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.before.totalInterest)}
          </Text>
        </View>
        <View className='calc__compare-col calc__compare-col--after'>
          <Text className='calc__compare-col-title'>调整后</Text>
          <Text className='calc__compare-row-label'>月供</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.after.monthlyPayment)}
          </Text>
          <Text className='calc__compare-row-label'>剩余总利息</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.after.totalInterest)}
          </Text>
        </View>
      </View>
    </View>
  )

  const renderEarlyRepaymentResult = (result: EarlyRepaymentResult) => (
    <View className='calc__compare-card calc__card--animate'>
      <Text className='calc__compare-title'>提前还款试算结果</Text>

      <View className='calc__savings-banner'>
        <Text className='calc__savings-banner-label'>本次提前还款可帮您省下总利息</Text>
        <Text className='calc__savings-banner-value'>¥{formatCurrency(result.interestSaved)}</Text>
      </View>

      <View className='calc__compare-grid'>
        <View className='calc__compare-col'>
          <Text className='calc__compare-col-title'>提前还款前</Text>
          <Text className='calc__compare-row-label'>月供</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.originalMonthlyPayment)}
          </Text>
          <Text className='calc__compare-row-label'>剩余年限</Text>
          <Text className='calc__compare-row-value'>
            {Math.ceil(result.originalRemainingMonths / 12)} 年
          </Text>
          <Text className='calc__compare-row-label'>剩余总利息</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.originalTotalInterest)}
          </Text>
        </View>
        <View className='calc__compare-col calc__compare-col--after'>
          <Text className='calc__compare-col-title'>提前还款后</Text>
          <Text className='calc__compare-row-label'>新月供</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.newMonthlyPayment)}
          </Text>
          <Text className='calc__compare-row-label'>
            {result.mode === EARLY_REPAYMENT_MODE.SHORTEN_TERM ? '新剩余年限' : '剩余年限'}
          </Text>
          <Text className='calc__compare-row-value calc__compare-row-value--highlight'>
            {result.mode === EARLY_REPAYMENT_MODE.SHORTEN_TERM
              ? `${result.newRemainingYears} 年（${result.newRemainingMonths} 期）`
              : `${Math.ceil(result.originalRemainingMonths / 12)} 年（不变）`}
          </Text>
          <Text className='calc__compare-row-label'>剩余总利息</Text>
          <Text className='calc__compare-row-value'>
            ¥{formatCurrency(result.newTotalInterest)}
          </Text>
        </View>
      </View>
    </View>
  )

  const renderMortgageSummary = (result: LoanCalculationResult) => (
    <View className='calc__card-summary'>
      <View className='calc__card-item'>
        <Text className='calc__card-item-label'>总利息</Text>
        <Text className='calc__card-item-value'>¥{formatCurrency(result.totalInterest)}</Text>
      </View>
      <View className='calc__card-item'>
        <Text className='calc__card-item-label'>总还款额</Text>
        <Text className='calc__card-item-value'>¥{formatCurrency(result.totalRepayment)}</Text>
      </View>
    </View>
  )

  const renderCarSummary = (result: CarLoanResult) => (
    <>
      <View className='calc__card-summary calc__card-summary--triple'>
        <View className='calc__card-item'>
          <Text className='calc__card-item-label'>首付款</Text>
          <Text className='calc__card-item-value'>¥{formatCurrency(result.downPayment)}</Text>
        </View>
        <View className='calc__card-item'>
          <Text className='calc__card-item-label'>贷款金额</Text>
          <Text className='calc__card-item-value'>¥{formatCurrency(result.loanAmount)}</Text>
        </View>
        <View className='calc__card-item'>
          <Text className='calc__card-item-label'>总利息</Text>
          <Text className='calc__card-item-value'>¥{formatCurrency(result.totalInterest)}</Text>
        </View>
      </View>
      <View className='calc__card-summary calc__card-summary--double'>
        <View className='calc__card-item'>
          <Text className='calc__card-item-label'>贷款总还款</Text>
          <Text className='calc__card-item-value'>¥{formatCurrency(result.totalRepayment)}</Text>
        </View>
        <View className='calc__card-item'>
          <Text className='calc__card-item-label'>购车总花费</Text>
          <Text className='calc__card-item-value calc__card-item-value--highlight'>
            ¥{formatCurrency(result.totalPurchaseCost)}
          </Text>
        </View>
      </View>
      {result.additionalFees > 0 && (
        <Text className='calc__card-fee-note'>
          含附加费用 ¥{formatCurrency(result.additionalFees)}
        </Text>
      )}
    </>
  )

  const renderResultShareActions = () => (
    <View className='calc__result-actions'>
      <Button className='calc__result-share-btn' openType='share' plain>
        <Text className='calc__result-share-btn-text'>转发测算</Text>
      </Button>
      <View
        className={`calc__result-poster-btn ${
          isPosterGenerating ? 'calc__result-poster-btn--disabled' : ''
        }`}
        onClick={handleGeneratePoster}
      >
        <Text className='calc__result-poster-btn-icon'>🖼</Text>
        <Text className='calc__result-poster-btn-text'>
          {isPosterGenerating ? '生成中...' : '生成海报分享'}
        </Text>
      </View>
    </View>
  )

  const navigationTitle = NAVIGATION_TITLE_MAP[calculatorType]

  return (
    <View className={`calc${IS_ALIPAY ? ' calc--alipay' : ''}`} style={navBarCssVars}>
      {!IS_ALIPAY && (
        <>
          <View className='custom-navbar'>
            <View className='status-bar' />
            <View className='nav-content'>
              <Text className='nav-title'>{navigationTitle}</Text>
            </View>
          </View>
          <View className='navbar-placeholder' />
        </>
      )}

      {showFavoriteGuide && (
        <View
          className={`calc__favorite-guide${IS_ALIPAY ? ' calc__favorite-guide--alipay' : ''}`}
          style={
            IS_ALIPAY
              ? { top: `${navBarMetrics.totalHeightPx + 10}px`, position: 'fixed' }
              : undefined
          }
        >
          <Text className='calc__favorite-guide-text'>{FAVORITE_GUIDE_TEXT}</Text>
          <View className='calc__favorite-guide-close' onClick={handleDismissFavoriteGuide}>
            <Text className='calc__favorite-guide-close-icon'>×</Text>
          </View>
        </View>
      )}

      {/* 大分类 Tab */}
      <View className='calc__category-tabs'>
        <View
          className={`calc__category-tab ${isMortgage ? 'calc__category-tab--active' : ''}`}
          onClick={() => handleCalculatorTypeChange(CALCULATOR_TYPE.MORTGAGE)}
        >
          <Text className='calc__category-tab-text'>房贷计算器</Text>
        </View>
        <View
          className={`calc__category-tab ${!isMortgage ? 'calc__category-tab--active' : ''}`}
          onClick={() => handleCalculatorTypeChange(CALCULATOR_TYPE.CAR)}
        >
          <Text className='calc__category-tab-text'>车贷计算器</Text>
        </View>
      </View>

      {/* 房贷功能模块 Tab */}
      {isMortgage && renderMortgageFeatureTabs()}

      {/* 房贷子类型 Tab（仅常规测算显示） */}
      {isStandardMortgage && renderMortgageSubTabs()}

      {/* 还款方式 Tab（车贷 + 房贷均显示） */}
      <View className='calc__tabs'>
        <View
          className={`calc__tab ${isEqualInterest ? 'calc__tab--active' : ''}`}
          onClick={() => handleRepaymentTypeChange(REPAYMENT_TYPE.INTEREST)}
        >
          <Text>等额本息</Text>
        </View>
        <View
          className={`calc__tab ${!isEqualInterest ? 'calc__tab--active' : ''}`}
          onClick={() => handleRepaymentTypeChange(REPAYMENT_TYPE.PRINCIPAL)}
        >
          <Text>等额本金</Text>
        </View>
      </View>

      {/* 表单 */}
      <View className='calc__form'>
        {isMortgage ? renderMortgageForm() : renderCarForm()}
      </View>

      <View className='calc__action-row'>
        <View className='calc__submit' onClick={handleCalculate}>
          <Text>开始计算</Text>
        </View>
        <View className='calc__save-btn' onClick={handleSaveParams}>
          <Text className='calc__save-btn-icon'>★</Text>
          <Text className='calc__save-btn-text'>保存参数</Text>
        </View>
      </View>

      {/* Banner 广告位（IS_AD_OPEN 为 false 时不渲染） */}
      {renderAdBanner()}

      {/* 计算结果：未计算前隐藏，计算后以淡入动画展示 */}
      {calculationState && (
        <View key={resultAnimKey} className='calc__result'>
          {calculationState.type === CALCULATOR_TYPE.CAR && (
            <>
              <View className='calc__card calc__card--animate'>
                <Text className='calc__card-label'>
                  {isEqualInterest ? '每月供款' : '首月供款'}
                </Text>
                <Text className='calc__card-amount'>¥{displayMonthlyPayment}</Text>
                {!isEqualInterest && monthlyDecrease > 0 && (
                  <Text className='calc__card-decrease'>
                    每月递减：¥{formatCurrency(monthlyDecrease)}
                  </Text>
                )}
                {renderCarSummary(calculationState.result)}
              </View>
            </>
          )}

          {calculationState.type === CALCULATOR_TYPE.MORTGAGE &&
            calculationState.feature === MORTGAGE_FEATURE_MODE.LPR &&
            (isAdvancedResultLocked
              ? renderAdvancedResultLock()
              : renderLprResult(calculationState.result))}

          {calculationState.type === CALCULATOR_TYPE.MORTGAGE &&
            calculationState.feature === MORTGAGE_FEATURE_MODE.EARLY_REPAYMENT &&
            (isAdvancedResultLocked
              ? renderAdvancedResultLock()
              : renderEarlyRepaymentResult(calculationState.result))}

          {calculationState.type === CALCULATOR_TYPE.MORTGAGE &&
            calculationState.feature === MORTGAGE_FEATURE_MODE.STANDARD && (
              <>
                <View className='calc__card calc__card--animate'>
                  <Text className='calc__card-label'>
                    {isEqualInterest ? '每月供款' : '首月供款'}
                  </Text>
                  <Text className='calc__card-amount'>¥{displayMonthlyPayment}</Text>
                  {!isEqualInterest && monthlyDecrease > 0 && (
                    <Text className='calc__card-decrease'>
                      每月递减：¥{formatCurrency(monthlyDecrease)}
                    </Text>
                  )}
                  {renderMortgageSummary(calculationState.result)}
                </View>

                <View className='calc__schedule calc__schedule--animate'>
                  <View className='calc__schedule-head'>
                    <Text className='calc__schedule-title'>还款计划明细</Text>
                  </View>
                  <View className='calc__table-header'>
                    <Text className='calc__th calc__th--period'>期数</Text>
                    <Text className='calc__th calc__th--payment'>月供</Text>
                    <Text className='calc__th calc__th--breakdown'>本金 / 利息</Text>
                    <Text className='calc__th calc__th--remaining'>剩余本金</Text>
                  </View>
                  <View catchMove className='calc__scroll-wrap'>
                    <ScrollView
                      className='calc__scroll'
                      scrollY
                      enhanced
                      showScrollbar={false}
                    >
                      {visibleMonthlyPayments.map((item, index) => renderPaymentRow(item, index))}
                      {renderScheduleLockPanel()}
                    </ScrollView>
                  </View>
                </View>
              </>
            )}

          {canShowResultShareActions && renderResultShareActions()}
        </View>
      )}

      {/* 离屏 Canvas 2d：用于绘制高清分享海报（CSS 尺寸为逻辑像素，物理尺寸在 JS 内按 dpr 设置） */}
      <Canvas
        type='2d'
        id={POSTER_CANVAS_ID}
        className='calc__poster-canvas'
        style={{
          width: `${POSTER_LOGICAL_WIDTH}px`,
          height: `${POSTER_MIN_LOGICAL_HEIGHT}px`,
        }}
      />

      {/* 底部安全区占位，确保页面级滚动可滑到最底部 */}
      <View className='calc__safe-bottom' />
    </View>
  )
}
