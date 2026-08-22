import { apiClient } from './client'
import type { ApiResponse, PaginationParams } from '@/types/api'
import type { OpenMinter, OpenMint } from '@/types/openminter'

export async function getOpenMinters(params?: PaginationParams & { asset?: string; status?: string; divisible?: boolean }): Promise<ApiResponse<OpenMinter[]>> {
  const response = await apiClient.get<ApiResponse<OpenMinter[]>>('/openminters', { params })
  return response.data
}

export async function getAddressAssetOpenMints(asset: string, address: string, params?: PaginationParams): Promise<ApiResponse<OpenMint[]>> {
  const response = await apiClient.get<ApiResponse<OpenMint[]>>(
    `/assets/${encodeURIComponent(asset)}/openmints/${encodeURIComponent(address)}`,
    { params },
  )
  return response.data
}

export async function getAddressMintedQuantity(asset: string, address: string): Promise<number> {
  let total = 0
  let cursor: number | string | undefined
  for (let page = 0; page < 20; page += 1) {
    const response = await getAddressAssetOpenMints(asset, address, { limit: 500, cursor })
    const mints = response.result ?? []
    if (mints.length === 0) break
    for (const mint of mints) {
      if (mint.status && mint.status !== 'valid') continue
      total += mint.earn_quantity || 0
    }
    if (response.next_cursor === null || response.next_cursor === undefined) break
    cursor = response.next_cursor
  }
  return total
}

interface MempoolEvent {
  command: string
  category: string
  bindings: string
  addresses: string
}

export async function getAddressMempoolMintedQuantity(asset: string, address: string): Promise<number> {
  const response = await apiClient.get<ApiResponse<MempoolEvent[]>>(
    `/addresses/${encodeURIComponent(address)}/mempool`,
    { params: { limit: 500 } },
  )

  let total = 0
  for (const event of response.data.result ?? []) {
    if (event.command !== 'openmint' || !event.addresses?.split(',').includes(address)) continue
    try {
      const parsed = JSON.parse(event.bindings) as { OpenMint?: { asset?: string; quantity?: number } }
      if (parsed.OpenMint?.asset === asset) total += parsed.OpenMint.quantity ?? 0
    } catch {
      continue
    }
  }
  return total
}
