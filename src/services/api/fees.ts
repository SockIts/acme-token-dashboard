import { adminApiClient } from './client'
import { MIN_FEE_RATE_SAT_VB, parseFeeRate } from '@/utils/feeRate'

export interface FeeEstimates {
  fastestFee: number
  halfHourFee: number
  hourFee: number
  economyFee: number
  minimumFee: number
}

const FALLBACK_FEES: FeeEstimates = {
  fastestFee: 10,
  halfHourFee: 5,
  hourFee: 2,
  economyFee: 1,
  minimumFee: MIN_FEE_RATE_SAT_VB,
}

function normalizeFee(value: unknown, fallback: number): number {
  return parseFeeRate(typeof value === 'number' || typeof value === 'string' ? value : '') ?? fallback
}

export async function getRecommendedFees(): Promise<FeeEstimates> {
  try {
    const response = await adminApiClient.get('/bitcoin/fees/recommended')
    const values = response.data?.result ?? response.data?.data ?? response.data ?? {}
    return {
      fastestFee: normalizeFee(values.fastestFee, FALLBACK_FEES.fastestFee),
      halfHourFee: normalizeFee(values.halfHourFee, FALLBACK_FEES.halfHourFee),
      hourFee: normalizeFee(values.hourFee, FALLBACK_FEES.hourFee),
      economyFee: normalizeFee(values.economyFee, FALLBACK_FEES.economyFee),
      minimumFee: normalizeFee(values.minimumFee, FALLBACK_FEES.minimumFee),
    }
  } catch {
    return FALLBACK_FEES
  }
}
