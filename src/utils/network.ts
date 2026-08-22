import type { BitcoinNetwork } from '@/types/wallet'

declare const __ACME_NETWORK__: string | undefined

export type AcmeNetwork = BitcoinNetwork | 'testnet4'

function normalizeNetwork(value: string | undefined): AcmeNetwork {
  switch (value?.trim().toLowerCase()) {
    case 'bitcoin':
    case 'main':
    case 'mainnet':
      return 'mainnet'
    case 'test':
    case 'testnet':
      return 'testnet'
    case 'testnet4':
      return 'testnet4'
    case 'signet':
      return 'signet'
    case 'regtest':
      return 'regtest'
    default:
      return 'testnet4'
  }
}

export const ACME_NETWORK = normalizeNetwork(
  typeof __ACME_NETWORK__ === 'string'
    ? __ACME_NETWORK__
    : import.meta.env.VITE_ACME_NETWORK,
)

export const WALLET_NETWORK: BitcoinNetwork =
  ACME_NETWORK === 'testnet4' ? 'testnet' : ACME_NETWORK

export const IS_MAINNET = ACME_NETWORK === 'mainnet'
export const IS_TESTNET = ACME_NETWORK === 'testnet' || ACME_NETWORK === 'testnet4'

export function getMempoolBaseUrl(network: AcmeNetwork = ACME_NETWORK): string {
  switch (network) {
    case 'mainnet':
      return 'https://mempool.space'
    case 'testnet':
    case 'testnet4':
      return 'https://mempool.space/testnet4'
    case 'signet':
      return 'https://mempool.space/signet'
    case 'regtest':
      return ''
  }
}

export function getMempoolTxUrl(txid: string): string {
  const baseUrl = getMempoolBaseUrl()
  return baseUrl ? `${baseUrl}/tx/${txid}` : ''
}

export function getMempoolAddressUrl(address: string): string {
  const baseUrl = getMempoolBaseUrl()
  return baseUrl ? `${baseUrl}/address/${address}` : ''
}

export function getMempoolOutspendUrl(txid: string, vout: number): string | null {
  const baseUrl = getMempoolBaseUrl()
  return baseUrl ? `${baseUrl}/api/tx/${txid}/outspend/${vout}` : null
}

export function getNetworkFromAddress(address: string): BitcoinNetwork | 'unknown' {
  const normalizedAddress = address.trim().toLowerCase()
  if (normalizedAddress.startsWith('1') || normalizedAddress.startsWith('3') || normalizedAddress.startsWith('bc1')) {
    return 'mainnet'
  }
  if (
    normalizedAddress.startsWith('m') ||
    normalizedAddress.startsWith('n') ||
    normalizedAddress.startsWith('2') ||
    normalizedAddress.startsWith('tb1')
  ) {
    return 'testnet'
  }
  if (normalizedAddress.startsWith('sb1')) {
    return 'signet'
  }
  if (normalizedAddress.startsWith('bcrt1')) {
    return 'regtest'
  }
  return 'unknown'
}

export function isAddressForConfiguredNetwork(address: string): boolean {
  const addressNetwork = getNetworkFromAddress(address)
  return addressNetwork !== 'unknown' && addressNetwork === WALLET_NETWORK
}
