import { apiClient } from './client'
import type { ApiResponse, ComposeResult } from '@/types/api'

interface ComposeOptions {
  build_transaction?: boolean
  utxos?: Array<{ txid: string; vout: number; value: number; script_pubkey: string }>
  fee_rate?: number
  change_address?: string
}

export interface OpenMintRequest extends ComposeOptions {
  source: string
  asset: string
  openminter_tx_hash: string
  quantity?: number
}

export interface AtomicFillRequest extends ComposeOptions {
  order_tx_hash: string
  buyer_address: string
}

export async function composeOpenMint(request: OpenMintRequest): Promise<ApiResponse<ComposeResult>> {
  const response = await apiClient.post<ApiResponse<ComposeResult>>('/compose', {
    ...request,
    type: 'openmint',
  })
  return response.data
}

export async function composeAtomicFill(request: AtomicFillRequest): Promise<ApiResponse<ComposeResult>> {
  const response = await apiClient.post<ApiResponse<ComposeResult>>('/compose', {
    ...request,
    type: 'atomicfill',
  })
  return response.data
}
