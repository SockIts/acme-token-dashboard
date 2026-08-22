export const MIN_FEE_RATE_SAT_VB = 0.01
export const FEE_RATE_STEP = 0.01

const FEE_RATE_DECIMALS = 3
const FEE_RATE_SCALE = 10 ** FEE_RATE_DECIMALS

export function isValidFeeRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_FEE_RATE_SAT_VB
}

export function parseFeeRate(value: string | number): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return isValidFeeRate(parsed) ? parsed : null
}

/** Round upward to the API's supported display precision. */
export function roundFeeRateUp(rate: number): number {
  return Math.ceil((rate - Number.EPSILON) * FEE_RATE_SCALE) / FEE_RATE_SCALE
}

export function multiplyFeeRate(rate: number, multiplier: number): number {
  return Math.max(MIN_FEE_RATE_SAT_VB, roundFeeRateUp(rate * multiplier))
}

/** Bitcoin transaction fees are always whole satoshis and never round down. */
export function calculateFeeSats(vbytes: number, rate: number): number {
  return Math.ceil(vbytes * rate)
}
