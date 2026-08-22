import { apiClient } from './client'
import type { ApiResponse, PaginationParams } from '@/types/api'

export interface AddressBalance {
  address: string
  asset: string
  asset_longname: string | null
  quantity: number
  block_index: number
  tx_index: number
  utxo: string | null
  utxo_address: string | null
}

export async function getAddressBalances(
  address: string,
  params?: PaginationParams,
): Promise<ApiResponse<AddressBalance[]>> {
  const response = await apiClient.get<ApiResponse<AddressBalance[]>>(
    `/addresses/${encodeURIComponent(address)}/balances`,
    { params },
  )
  return response.data
}
