/**
 * OpenMinter Types (Editions Mint / Token Mint)
 * Based on /v2/openminters API response
 *
 * UI Terminology:
 * - openminter -> "Edition Mint" (for art/NFTs)
 * - openmint -> "Token Mint" (for divisible tokens)
 */

export interface OpenMinter {
  tx_hash: string
  tx_index: number
  block_index: number
  source: string
  asset: string
  asset_parent: string | null
  asset_longname: string | null
  description: string | null
  price: number
  price_asset: string  // Asset name used for payment (e.g., "BTC")
  price_asset_name: string  // Human-readable name resolved server-side
  quantity_by_price: number
  hard_cap: number
  max_mint_per_tx: number
  premint_quantity: number
  start_block: number
  end_block: number
  minted_asset_commission_int: number
  lock_description: boolean
  lock_quantity: boolean
  divisible: boolean
  pre_minted: boolean
  status: OpenMinterStatus
  max_mint_per_address: number | null
  mime_type: string
  earned_quantity: number
  paid_quantity: number
  commission: number
}

export type OpenMinterStatus = 'open' | 'closed' | 'invalid'

/** OpenMint record (participation) */
export interface OpenMint {
  tx_hash: string
  tx_index: number
  block_index: number
  source: string
  openminter_tx_hash: string
  asset: string
  earn_quantity: number
  paid_quantity: number
  commission: number
  status: string
}

/** Create openminter request */
export interface CreateOpenMinterRequest {
  source: string
  asset: string
  max_mint_per_tx: number
  hard_cap: number
  divisible: boolean
  description?: string
  premint_quantity?: number
  start_block?: number
  end_block?: number
  max_mint_per_address?: number
  price?: number
  price_asset?: string
  quantity_by_price?: number
}

/** Participate in openmint request */
export interface OpenMintRequest {
  source: string
  asset: string
  quantity?: number
}

/** Calculate minting progress percentage (premint + earned vs hard_cap) */
export function getMintProgress(openminter: OpenMinter): number {
  if (openminter.hard_cap === 0) return 0
  return ((openminter.earned_quantity + (openminter.premint_quantity || 0)) / openminter.hard_cap) * 100
}

/** Check if openminter is active */
export function isOpenMinterActive(openminter: OpenMinter, currentBlock: number): boolean {
  if (openminter.status !== 'open') return false
  if (openminter.earned_quantity >= openminter.hard_cap) return false
  if (openminter.start_block > 0 && currentBlock < openminter.start_block) return false
  if (openminter.end_block > 0 && currentBlock > openminter.end_block) return false
  return true
}

/** Get remaining quantity available to mint (accounts for premint) */
export function getRemainingMintQuantity(openminter: OpenMinter): number {
  return openminter.hard_cap - openminter.earned_quantity - (openminter.premint_quantity || 0)
}

/** Hard ceiling on the repeat-mint control shared by the mint modals. */
export const MAX_REPEAT_MINTS = 10

/** What a single address is still allowed to mint from an openminter. */
export interface AddressMintAllowance {
  /** Raw per-address cap, or null when the minter sets no per-address limit. */
  capRaw: number | null
  /** Raw quantity this address has already minted from this minter. */
  mintedRaw: number
  /** Raw quantity this address may still mint. Infinity when uncapped. */
  remainingRaw: number
  /** True once the address has reached its per-address cap. */
  exhausted: boolean
}

/** Allowance for an uncapped minter (or an address we have no data for). */
export const UNLIMITED_MINT_ALLOWANCE: AddressMintAllowance = {
  capRaw: null,
  mintedRaw: 0,
  remainingRaw: Infinity,
  exhausted: false,
}

/**
 * Build the per-address allowance from the minter's cap and the raw quantity
 * the address has already minted. `max_mint_per_address` is null/0 when the
 * creator left the limit unset.
 */
export function getAddressMintAllowance(
  minter: OpenMinter,
  mintedRaw: number
): AddressMintAllowance {
  const capRaw = minter.max_mint_per_address && minter.max_mint_per_address > 0
    ? minter.max_mint_per_address
    : null
  const minted = Number.isFinite(mintedRaw) ? Math.max(0, mintedRaw) : 0

  if (capRaw === null) {
    return { ...UNLIMITED_MINT_ALLOWANCE, mintedRaw: minted }
  }

  const remainingRaw = Math.max(0, capRaw - minted)
  return { capRaw, mintedRaw: minted, remainingRaw, exhausted: remainingRaw <= 0 }
}

/**
 * Largest raw quantity a single mint transaction may request: the smallest of
 * the per-tx cap, the supply still unminted, and this address's remaining
 * per-address allowance. Anything above this is rejected by the indexer while
 * the payment still settles on-chain, so the UI must never let it through.
 */
export function getEffectiveMaxMintRaw(
  minter: OpenMinter,
  allowanceRemainingRaw: number = Infinity
): number {
  const remainingSupplyRaw = minter.hard_cap > 0
    ? Math.max(0, getRemainingMintQuantity(minter))
    : Infinity
  return Math.max(0, Math.min(minter.max_mint_per_tx, remainingSupplyRaw, allowanceRemainingRaw))
}

/**
 * How many times a given raw quantity can be repeated before the per-address
 * allowance runs out. Repeats broadcast back to back, so the cap applies to
 * their sum, not to each one individually.
 */
export function getMaxRepeatCount(
  qtyRaw: number,
  allowanceRemainingRaw: number = Infinity,
  hardMax: number = MAX_REPEAT_MINTS
): number {
  if (!Number.isFinite(allowanceRemainingRaw)) return hardMax
  if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) return hardMax
  return Math.max(1, Math.min(hardMax, Math.floor(allowanceRemainingRaw / qtyRaw)))
}

/** Get price asset name from openminter */
export function getPriceAssetName(openminter: OpenMinter): string {
  if (openminter.price_asset_name) return openminter.price_asset_name
  if (openminter.price_asset) return openminter.price_asset
  return 'Free'
}

/** Format mint type for UI (Edition Mint vs Token Mint) */
export function getMintTypeLabel(openminter: OpenMinter): string {
  return openminter.divisible ? 'Token Mint' : 'Edition Mint'
}

/** Satoshi divisor for BTC and divisible token amounts (8 decimal places) */
export const SATOSHI_DIVISOR = 100_000_000

function isBtcPriceAsset(priceAsset: string): boolean {
  return priceAsset.trim().toUpperCase() === 'BTC'
}

/** Token-denominated openminter prices are entered as whole tokens and stored raw. */
export function normalizeOpenMinterPrice(price: number, priceAsset: string): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  return isBtcPriceAsset(priceAsset)
    ? Math.round(price)
    : Math.round(price * SATOSHI_DIVISOR)
}

/** Format quantity accounting for divisibility (8 decimal places for divisible) */
export function formatOpenMinterQuantity(quantity: number, divisible: boolean): string {
  if (!divisible) {
    return quantity.toLocaleString()
  }
  const value = quantity / SATOSHI_DIVISOR
  // Remove trailing zeros but keep at least 2 decimal places for large numbers
  if (value >= 1) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })
  }
  // For small values, show more precision
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })
}

/** Format satoshi value to human-readable BTC/sats string */
export function formatSatoshis(sats: number): string {
  if (sats >= SATOSHI_DIVISOR) {
    // Show as BTC for >= 1 BTC
    const btc = sats / SATOSHI_DIVISOR
    return `${btc.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} BTC`
  } else if (sats >= 1000) {
    // Show with comma formatting for larger sat values
    return `${sats.toLocaleString()} sats`
  } else {
    return `${sats} sats`
  }
}

/** Format a raw openminter payment amount in the selected payment asset. */
export function formatOpenMinterPaymentAmount(amount: number, priceAsset: string): string {
  if (isBtcPriceAsset(priceAsset)) return formatSatoshis(amount)

  const value = amount / SATOSHI_DIVISOR
  const formatted = value >= 1
    ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })
    : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })

  return `${formatted} ${priceAsset.trim().toUpperCase()}`
}

/**
 * Get comprehensive pricing info for an openminter
 * Returns formatted strings for display
 *
 * ALL quantity fields (hard_cap, max_mint_per_tx, quantity_by_price) are stored
 * in RAW units (satoshi units for divisible assets, integer for non-divisible).
 *
 * Example PHUCKY after fix: price=1, quantity_by_price=10000000000 (raw), max_mint_per_tx=10000000000000 (raw)
 * - 1 sat buys 100 human tokens (10000000000 / 10^8)
 * - Max mint = 100,000 human tokens (10000000000000 / 10^8)
 * - Cost for max = (100,000 / 100) * 1 = 1,000 sats
 */
export function getOpenMinterPricingInfo(openminter: OpenMinter): {
  /** Price per token in the selected payment asset (e.g., "0.01 sats/token") */
  pricePerToken: string
  /** Pricing ratio (e.g., "1 sat = 100 PHUCKY") */
  pricingRatio: string
  /** Total cost for max mint (e.g., "1,000 sats") */
  maxMintCost: string
  /** Tokens received for max mint (e.g., "100,000") */
  maxMintTokens: string
  /** Price asset name */
  priceAsset: string
} {
  const priceAsset = getPriceAssetName(openminter)
  const isBTC = isBtcPriceAsset(priceAsset)

  // All quantities are in RAW units - convert to human for display
  const qtyByPriceHuman = openminter.divisible
    ? openminter.quantity_by_price / SATOSHI_DIVISOR
    : openminter.quantity_by_price

  // Price is in sats for BTC, raw 8-decimal units for token payment assets.
  const priceRaw = openminter.price
  const priceHuman = isBTC ? priceRaw : priceRaw / SATOSHI_DIVISOR

  // Calculate price per single human token.
  const pricePerHumanToken = qtyByPriceHuman > 0 ? priceHuman / qtyByPriceHuman : 0

  // Format price per token
  let pricePerToken: string
  if (isBTC && pricePerHumanToken >= SATOSHI_DIVISOR) {
    // More than 1 BTC per token
    const btcPerToken = pricePerHumanToken / SATOSHI_DIVISOR
    pricePerToken = `${btcPerToken.toLocaleString(undefined, { maximumFractionDigits: 4 })} BTC/token`
  } else if (isBTC && pricePerHumanToken >= 1000) {
    pricePerToken = `${pricePerHumanToken.toLocaleString()} sats/token`
  } else if (isBTC && pricePerHumanToken >= 1) {
    pricePerToken = `${pricePerHumanToken.toFixed(2)} sats/token`
  } else if (isBTC && pricePerHumanToken > 0) {
    // Fractional sats per token - show inverse ratio
    const tokensPerSat = 1 / pricePerHumanToken
    pricePerToken = `${tokensPerSat.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens/sat`
  } else if (pricePerHumanToken > 0) {
    pricePerToken = `${pricePerHumanToken.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${priceAsset}/token`
  } else {
    pricePerToken = 'Free'
  }

  // Create human-readable pricing ratio
  // Show: "X sats = Y TOKEN"
  let pricingRatio: string
  if (priceRaw === 0) {
    pricingRatio = 'Free mint'
  } else {
    // Format quantity in human terms
    const qtyFormatted = qtyByPriceHuman >= 1
      ? qtyByPriceHuman.toLocaleString(undefined, { maximumFractionDigits: 8 })
      : qtyByPriceHuman.toFixed(8).replace(/\.?0+$/, '')

    if (isBTC) {
      pricingRatio = `${formatSatoshis(priceRaw)} = ${qtyFormatted} ${openminter.asset}`
    } else {
      pricingRatio = `${formatOpenMinterPaymentAmount(priceRaw, priceAsset)} = ${qtyFormatted} ${openminter.asset}`
    }
  }

  // Calculate max mint cost in the payment asset's raw units.
  // lots = max_mint_per_tx / quantity_by_price (both in raw units)
  // cost = lots * price
  const lots = openminter.quantity_by_price > 0
    ? Math.ceil(openminter.max_mint_per_tx / openminter.quantity_by_price)
    : 0
  const maxMintCostRaw = lots * priceRaw

  const maxMintCost = formatOpenMinterPaymentAmount(maxMintCostRaw, priceAsset)
  const maxMintTokens = formatOpenMinterQuantity(openminter.max_mint_per_tx, openminter.divisible)

  return {
    pricePerToken,
    pricingRatio,
    maxMintCost,
    maxMintTokens,
    priceAsset,
  }
}

/** Get minted vs total supply info */
export function getOpenMinterSupplyInfo(openminter: OpenMinter): {
  minted: string
  total: string
  remaining: string
  percentMinted: number
} {
  const minted = formatOpenMinterQuantity(
    (openminter.earned_quantity || 0) + (openminter.premint_quantity || 0),
    openminter.divisible
  )
  const total = formatOpenMinterQuantity(openminter.hard_cap, openminter.divisible)
  const remaining = formatOpenMinterQuantity(
    openminter.hard_cap - (openminter.earned_quantity || 0) - (openminter.premint_quantity || 0),
    openminter.divisible
  )
  const percentMinted = getMintProgress(openminter)

  return { minted, total, remaining, percentMinted }
}
