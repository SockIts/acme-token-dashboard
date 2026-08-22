import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAddressMempoolMintedQuantity, getAddressMintedQuantity } from '@/services/api/openminters'
import {
  getAddressMintAllowance,
  UNLIMITED_MINT_ALLOWANCE,
  type AddressMintAllowance,
  type OpenMinter,
} from '@/types/openminter'

export function useAddressMintAllowance(minter: OpenMinter | null | undefined, address: string | null | undefined) {
  const [pendingRaw, setPendingRaw] = useState(0)
  const isCapped = !!minter && typeof minter.max_mint_per_address === 'number' && minter.max_mint_per_address > 0
  const enabled = isCapped && !!address

  const query = useQuery({
    queryKey: ['addressMintedQuantity', minter?.asset, address],
    queryFn: async () => {
      const [confirmedRaw, mempoolRaw] = await Promise.all([
        getAddressMintedQuantity(minter!.asset, address!),
        getAddressMempoolMintedQuantity(minter!.asset, address!),
      ])
      return { confirmedRaw, mempoolRaw }
    },
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const allowance = useMemo<AddressMintAllowance>(() => {
    if (!minter || !enabled) return UNLIMITED_MINT_ALLOWANCE
    const confirmedRaw = query.data?.confirmedRaw ?? 0
    const unconfirmedRaw = Math.max(query.data?.mempoolRaw ?? 0, pendingRaw)
    return getAddressMintAllowance(minter, confirmedRaw + unconfirmedRaw)
  }, [enabled, minter, pendingRaw, query.data])

  const recordPendingMint = useCallback((rawQuantity: number) => {
    if (rawQuantity > 0) setPendingRaw((prev) => prev + rawQuantity)
  }, [])

  const isLoading = enabled && query.isPending
  const isUnknown = enabled && query.isError
  const blockedReason = allowance.exhausted
    ? 'This wallet has already reached the per-address mint limit.'
    : isLoading
      ? 'Checking this wallet mint allowance.'
      : isUnknown
        ? 'Could not verify this wallet mint allowance.'
        : null

  return {
    allowance,
    isCapped,
    isLoading,
    isUnknown,
    isBlocked: blockedReason !== null,
    blockedReason,
    recordPendingMint,
    refetch: () => { if (enabled) void query.refetch() },
  }
}
