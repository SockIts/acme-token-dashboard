import { apiClient } from './client'
import type { ApiResponse, PaginationParams } from '@/types/api'

export interface TokenStats {
  asset: string
  asset_longname: string | null
  divisible: boolean
  supply: number
  holder_count: number
  deploy_block: number | null
  locked: boolean
  owner: string | null
  description: string | null
  open_listings_count: number
  floor_price_sats: number | null
  ceiling_price_sats: number | null
  fills_24h_count: number
  volume_24h_sats: number
  volume_24h_units: number
  high_24h_sats: number | null
  low_24h_sats: number | null
  last_price_sats: number | null
  market_cap_sats: number | null
  price_change_24h_pct: number | null
  as_of_block: number
}

export async function getDexTokenStats(asset: string): Promise<ApiResponse<TokenStats>> {
  const response = await apiClient.get<ApiResponse<TokenStats>>(
    `/dex/token_stats/${encodeURIComponent(asset)}`,
  )
  return response.data
}

export interface AssetBalance {
  address: string
  asset: string
  asset_longname: string | null
  quantity: number
  block_index: number
  tx_index: number
  utxo: string | null
  utxo_address: string | null
}

export interface AssetSend {
  tx_index: number
  tx_hash: string
  block_index: number
  source: string
  destination: string
  asset: string
  quantity: number
  status: string
  msg_index?: number
  memo?: string | null
  fee_paid?: number
  send_type?: string | null
  source_address?: string | null
  destination_address?: string | null
}

export interface AtomicOrder {
  tx_hash: string
  block_index: number
  source: string
  order_type: 'sell' | 'buy'
  asset: string
  quantity: number
  btc_price: number
  expiration: number
  expire_index: number
  fill_utxo_txid: string
  fill_utxo_vout: number
  fill_utxo_address: string
  status: 'open' | 'filled' | 'cancelled' | 'expired'
  has_psbt: boolean
  fill_tx_hash: string | null
  fill_tx_index: number | null
  fill_address: string | null
  fill_block_index: number | null
}

export interface AtomicOrdersParams extends PaginationParams {
  asset?: string
  order_type?: string
  status?: 'open' | 'filled' | 'completed' | 'cancelled' | 'expired' | 'all'
}

export interface OpenOrder {
  tx_index: number
  tx_hash: string
  block_index: number
  source: string
  give_asset: string
  give_quantity: number
  give_remaining: number
  get_asset: string
  get_quantity: number
  get_remaining: number
  expiration: number
  expire_index: number
  fee_required: number
  fee_required_remaining: number
  fee_provided: number
  fee_provided_remaining: number
  status: 'open' | 'filled' | 'cancelled' | 'expired'
  get_asset_divisible: 0 | 1 | boolean
  give_asset_divisible: 0 | 1 | boolean
  give_price: number
  get_price: number
}

export interface OrdersParams extends PaginationParams {
  status?: 'open' | 'filled' | 'cancelled' | 'expired' | 'all'
}

export async function getAssetBalances(asset: string, params?: PaginationParams): Promise<ApiResponse<AssetBalance[]>> {
  const response = await apiClient.get<ApiResponse<AssetBalance[]>>(
    `/assets/${encodeURIComponent(asset)}/balances`,
    { params },
  )
  return response.data
}

export async function getAssetSends(asset: string, params?: PaginationParams): Promise<ApiResponse<AssetSend[]>> {
  const response = await apiClient.get<ApiResponse<AssetSend[]>>(
    `/assets/${encodeURIComponent(asset)}/sends`,
    { params },
  )
  return response.data
}

export async function getAtomicOrders(params?: AtomicOrdersParams): Promise<ApiResponse<AtomicOrder[]>> {
  const response = await apiClient.get<ApiResponse<AtomicOrder[]>>('/atomic/orders', { params })
  return response.data
}

export async function getOrders(params?: OrdersParams): Promise<ApiResponse<OpenOrder[]>> {
  const response = await apiClient.get<ApiResponse<OpenOrder[]>>('/orders', { params })
  return response.data
}
