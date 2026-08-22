/**
 * Wallet Service Types
 * Extended types for wallet integration beyond base types
 */

import type {
  WalletProvider,
  WalletAdapter,
  BitcoinNetwork,
  SignPsbtOptions,
  UTXO,
} from '@/types/wallet'
import { WALLET_NETWORK } from '@/utils/network'

/**
 * UniSat Wallet API
 * @see https://docs.unisat.io/dev/unisat-developer-service/unisat-wallet
 */
/**
 * UniSat UTXO format returned by getBitcoinUtxos()
 */
export interface UnisatUTXO {
  txid: string
  vout: number
  satoshis: number
  scriptPk: string
}

export interface UniSatAPI {
  requestAccounts(): Promise<string[]>
  getAccounts(): Promise<string[]>
  getPublicKey(): Promise<string>
  getNetwork(): Promise<string>
  switchNetwork(network: string): Promise<void>
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>
  getBitcoinUtxos(): Promise<UnisatUTXO[]>
  sendBitcoin(to: string, satoshis: number, options?: { feeRate?: number }): Promise<string>
  signPsbt(psbtHex: string, options?: {
    autoFinalized?: boolean
    toSignInputs?: Array<{
      index: number
      address?: string
      publicKey?: string
      sighashTypes?: number[]
      disableTweakSigner?: boolean
    }>
  }): Promise<string>
  signPsbts(psbtsHexs: string[], options?: object[]): Promise<string[]>
  pushPsbt(psbt: string): Promise<string>
  signMessage(message: string, type?: 'ecdsa' | 'bip322-simple'): Promise<string>
  pushTx(rawTx: string): Promise<string>
  getInscriptions(cursor?: number, size?: number): Promise<{
    total: number
    list: Array<{
      inscriptionId: string
      inscriptionNumber: number
      address: string
      outputValue: number
      content: string
      contentType: string
      timestamp: number
    }>
  }>
  on(event: string, handler: (...args: unknown[]) => void): void
  removeListener(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * Xverse Wallet API
 * @see https://docs.xverse.app/sats-connect
 */
export interface XverseGetAddressResponse {
  addresses: Array<{
    address: string
    publicKey: string
    purpose: 'payment' | 'ordinals' | 'stacks'
    addressType: 'p2tr' | 'p2wpkh' | 'p2sh' | 'stacks'
  }>
}

export interface XverseSignPsbtResponse {
  psbtBase64: string
  txId?: string
}

export interface XverseAPI {
  request(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown>
}

/**
 * Leather Wallet API (formerly Hiro Wallet)
 * @see https://leather.gitbook.io/developers/bitcoin/connect-users
 */
export interface LeatherAPI {
  request(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown>
}

export interface LeatherAddressResponse {
  result: {
    addresses: Array<{
      symbol: 'BTC' | 'STX'
      type: 'p2wpkh' | 'p2tr' | 'stacks'
      address: string
      publicKey: string
      derivationPath: string
    }>
  }
}

export interface LeatherSignPsbtResponse {
  result: {
    hex: string
  }
}

/**
 * Wallet detection result
 */
export interface WalletDetectionResult {
  provider: WalletProvider
  name: string
  icon: string
  installed: boolean
  api: UniSatAPI | XverseAPI | LeatherAPI | null
}

/**
 * Transaction compose result from ACME API
 */
export interface ComposeResult {
  psbt: string  // Base64 encoded PSBT
  inputs_to_sign: Array<{
    index: number
    address: string
    sighash_type?: number
  }>
  fee: number
  virtual_size: number
}

/**
 * Signed transaction submit result
 */
export interface SubmitResult {
  tx_hash: string
  success: boolean
}

/**
 * Base adapter class with common functionality
 */
export abstract class BaseWalletAdapter implements WalletAdapter {
  abstract provider: WalletProvider
  abstract name: string
  abstract icon: string
  abstract installed: boolean

  abstract connect(): Promise<{ address: string; publicKey: string; network: BitcoinNetwork }>
  abstract disconnect(): Promise<void>
  abstract getAddress(): Promise<string>
  abstract getPublicKey(): Promise<string>
  abstract getBalance(): Promise<number>
  abstract getNetwork(): Promise<BitcoinNetwork>
  abstract getUtxos(): Promise<UTXO[]>
  abstract signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>
  abstract signMessage(message: string): Promise<string>
  sendBitcoin?(to: string, amount: number): Promise<string>

  /**
   * Convert network string to BitcoinNetwork type
   */
  protected parseNetwork(network: string): BitcoinNetwork {
    const networkLower = network.toLowerCase()
    if (networkLower.includes('main') || networkLower === 'livenet') {
      return 'mainnet'
    }
    if (networkLower.includes('test')) {
      return 'testnet'
    }
    if (networkLower.includes('signet')) {
      return 'signet'
    }
    if (networkLower.includes('regtest')) {
      return 'regtest'
    }
    return WALLET_NETWORK
  }

  /**
   * Convert hex to base64
   */
  protected hexToBase64(hex: string): string {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
    return btoa(String.fromCharCode(...bytes))
  }

  /**
   * Convert base64 to hex
   */
  protected base64ToHex(base64: string): string {
    const binary = atob(base64)
    return Array.from(binary, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  }
}

// Wallet icons as data URIs (for offline use)
export const WALLET_ICONS = {
  unisat: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMjQiIGZpbGw9IiNGNzkzMUEiLz4KPHBhdGggZD0iTTY0IDI0QzQyLjQgMjQgMjQgNDIuNCAyNCA2NFM0Mi40IDEwNCA2NCAxMDRTMTA0IDg1LjYgMTA0IDY0Uzg1LjYgMjQgNjQgMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4=',
  xverse: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMjQiIGZpbGw9IiNFRTcyMzgiLz4KPHBhdGggZD0iTTMyIDQ4TDY0IDgwTDk2IDQ4IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4=',
  leather: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMjQiIGZpbGw9IiMxMjEwMEYiLz4KPHJlY3QgeD0iMzIiIHk9IjMyIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSI4IiBmaWxsPSIjRkY1NTAwIi8+Cjwvc3ZnPg==',
  // MetaMask fox logo (simplified SVG)
  metamask: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMjQiIGZpbGw9IiNGNjg1MUYiLz4KPHBhdGggZD0iTTk4IDM4TDY0IDU4TDMwIDM4TDY0IDgwTDk4IDM4WiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuOSIvPgo8cGF0aCBkPSJNNjQgODBMOTggMzhMOTggNzBMNjQgOTBMNjQgODBaIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC43Ii8+CjxwYXRoIGQ9Ik02NCA4MEwzMCAzOEwzMCA3MEw2NCA5MEw2NCA4MFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjciLz4KPC9zdmc+',
} as const
