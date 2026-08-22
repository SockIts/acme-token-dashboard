import { apiClient } from './client'
import type { ApiResponse, PaginationParams } from '@/types/api'
import type { StakingPool, StakingPosition, StakingRewards, StakingUnbond } from '@/types/staking'

export async function getStakingPool(): Promise<ApiResponse<StakingPool>> {
  const response = await apiClient.get<ApiResponse<StakingPool>>('/staking/pool')
  return response.data
}

export async function getStakingPosition(address: string): Promise<ApiResponse<StakingPosition>> {
  const response = await apiClient.get<ApiResponse<StakingPosition>>(
    `/staking/positions/${encodeURIComponent(address)}`,
  )
  return response.data
}

export async function getStakingRewards(address: string): Promise<ApiResponse<StakingRewards>> {
  const response = await apiClient.get<ApiResponse<StakingRewards>>(
    `/staking/rewards/${encodeURIComponent(address)}`,
  )
  return response.data
}

export async function getStakingUnbonds(
  address: string,
  params?: PaginationParams,
): Promise<ApiResponse<StakingUnbond[]>> {
  const response = await apiClient.get<ApiResponse<StakingUnbond[]>>(
    `/staking/unbonds/${encodeURIComponent(address)}`,
    { params },
  )
  return response.data
}
