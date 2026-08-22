import { ACME_NETWORK } from '@/utils/network'

export const ACME_ATOMIC_UNITS = 100_000_000
export const STAKING_EPOCH_BLOCKS = 144

export interface StakingNetworkConfig {
  enabled: boolean
  activationHeight: number | null
  reserveAddress: string | null
  label: string
}

export interface StakingPool {
  total_active_stake: number
  acc_reward_per_share: string
  last_update_block: number
  current_epoch: number
  reserve_remaining: number
  emission_remainder: string
}

export interface StakingPosition {
  owner: string
  active_quantity: number
  reward_debt: string
  pending_reward: number
  block_index: number
  event_seq: number
}

export interface StakingRewards {
  owner: string
  at_block: number
  current_epoch: number
  active_quantity: number
  stored_pending_reward: number
  projected_claimable_reward: number
}

export interface StakingUnbond {
  unbond_id: string
  owner: string
  quantity: number
  start_block: number
  credit_block: number
  status: string
  tx_hash: string | null
  block_index: number
  event_seq: number
}

export function getStakingNetworkConfig(network: string | null | undefined = ACME_NETWORK): StakingNetworkConfig {
  switch (network) {
    case 'testnet':
    case 'testnet4':
      return {
        enabled: true,
        activationHeight: 141_500,
        reserveAddress: 'tb1q7xy960szwevdts54kz64s60qszz23ekp8let5x',
        label: 'Testnet4',
      }
    case 'mainnet':
      return { enabled: false, activationHeight: null, reserveAddress: null, label: 'Mainnet' }
    case 'signet':
      return { enabled: false, activationHeight: null, reserveAddress: null, label: 'Signet' }
    case 'regtest':
      return { enabled: false, activationHeight: null, reserveAddress: null, label: 'Regtest' }
    default:
      return { enabled: false, activationHeight: null, reserveAddress: null, label: 'Mainnet' }
  }
}

export function formatAcmeQuantity(quantity: number, options?: { compact?: boolean }): string {
  const value = quantity / ACME_ATOMIC_UNITS
  return value.toLocaleString(undefined, {
    notation: options?.compact ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  })
}
