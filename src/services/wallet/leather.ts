/**
 * Leather Wallet Adapter (formerly Hiro Wallet)
 * @see https://leather.gitbook.io/developers/bitcoin/connect-users
 */

import type { BitcoinNetwork, SignPsbtOptions, UTXO, WalletConnectionResult } from '@/types/wallet'
import { BaseWalletAdapter, WALLET_ICONS } from './types'
import type { LeatherAPI } from './types'
import { WALLET_NETWORK } from '@/utils/network'

declare global {
  interface Window {
    LeatherProvider?: LeatherAPI
    HiroWalletProvider?: LeatherAPI  // Legacy name
  }
}

interface LeatherAddress {
  symbol: 'BTC' | 'STX'
  type: 'p2wpkh' | 'p2tr' | 'stacks'
  address: string
  publicKey: string
  derivationPath?: string
}

interface LeatherGetAddressesResult {
  result: {
    addresses: LeatherAddress[]
  }
}

interface LeatherSignPsbtResult {
  result: {
    hex: string
  }
}

interface LeatherSignMessageResult {
  result: {
    signature: string
    address: string
    message: string
  }
}

export class LeatherAdapter extends BaseWalletAdapter {
  readonly provider = 'leather' as const
  readonly name = 'Leather Wallet'
  readonly icon = WALLET_ICONS.leather

  private _connected = false
  private _nativeSegwitAddress: string | null = null
  private _taprootAddress: string | null = null
  private _publicKey: string | null = null
  private _network: BitcoinNetwork = WALLET_NETWORK

  /**
   * Check if Leather extension is installed
   */
  get installed(): boolean {
    if (typeof window === 'undefined') return false
    return !!(window.LeatherProvider || window.HiroWalletProvider)
  }

  /**
   * Get Leather API instance
   */
  private get api(): LeatherAPI {
    const provider = window.LeatherProvider || window.HiroWalletProvider
    if (!provider) {
      throw new Error('Leather wallet is not installed')
    }
    return provider
  }

  /**
   * Connect to Leather wallet
   */
  async connect(): Promise<WalletConnectionResult> {
    if (!this.installed) {
      throw new Error('Leather wallet is not installed. Please install it from https://leather.io')
    }

    try {
      // Request addresses
      const result = await this.api.request('getAddresses') as LeatherGetAddressesResult

      if (!result.result?.addresses || result.result.addresses.length === 0) {
        throw new Error('No addresses returned from Leather wallet')
      }

      // Find Bitcoin addresses (filter out Stacks)
      const btcAddresses = result.result.addresses.filter(a => a.symbol === 'BTC')

      // Get native segwit (p2wpkh) and taproot (p2tr) addresses
      const nativeSegwit = btcAddresses.find(a => a.type === 'p2wpkh')
      const taproot = btcAddresses.find(a => a.type === 'p2tr')

      if (!nativeSegwit && !taproot) {
        throw new Error('No Bitcoin address found in Leather wallet')
      }

      // Prefer native segwit for payments, taproot for ordinals
      const primaryAddress = nativeSegwit || taproot!

      this._nativeSegwitAddress = nativeSegwit?.address || null
      this._taprootAddress = taproot?.address || null
      this._publicKey = primaryAddress.publicKey

      // Detect network from address
      this._network = this.detectNetworkFromAddress(primaryAddress.address)

      this._connected = true

      return {
        address: primaryAddress.address,
        publicKey: this._publicKey,
        network: this._network,
      }
    } catch (error) {
      this._connected = false
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('denied')) {
          throw new Error('Connection rejected by user')
        }
      }
      throw error
    }
  }

  /**
   * Disconnect from wallet
   */
  async disconnect(): Promise<void> {
    this._connected = false
    this._nativeSegwitAddress = null
    this._taprootAddress = null
    this._publicKey = null
  }

  /**
   * Get connected address (native segwit preferred)
   */
  async getAddress(): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }
    const address = this._nativeSegwitAddress || this._taprootAddress
    if (!address) {
      throw new Error('No address available')
    }
    return address
  }

  /**
   * Get taproot address for ordinals
   */
  async getTaprootAddress(): Promise<string | null> {
    return this._taprootAddress
  }

  /**
   * Get native segwit address for payments
   */
  async getNativeSegwitAddress(): Promise<string | null> {
    return this._nativeSegwitAddress
  }

  /**
   * Get public key
   */
  async getPublicKey(): Promise<string> {
    if (!this._connected || !this._publicKey) {
      throw new Error('Wallet not connected')
    }
    return this._publicKey
  }

  /**
   * Get BTC balance in satoshis
   * Leather doesn't expose balance directly, return 0
   */
  async getBalance(): Promise<number> {
    // Leather doesn't have a balance API
    // The app should fetch balance from ACME API or a block explorer
    return 0
  }

  /**
   * Get current network
   */
  async getNetwork(): Promise<BitcoinNetwork> {
    return this._network
  }

  /**
   * Get UTXOs - use ACME API instead
   */
  async getUtxos(): Promise<UTXO[]> {
    return []
  }

  /**
   * Sign a PSBT
   */
  async signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    const address = this._nativeSegwitAddress || this._taprootAddress
    if (!address) {
      throw new Error('No address available for signing')
    }

    // Build sign at index array for Leather
    const signAtIndex = options?.toSignInputs?.map(input => input.index)

    const result = await this.api.request('signPsbt', {
      hex: psbtHex,
      signAtIndex,
      broadcast: false,
      // Allow signing with either address type
      allowedSighash: options?.toSignInputs?.[0]?.sighashTypes,
    }) as LeatherSignPsbtResult

    return result.result.hex
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    const address = this._nativeSegwitAddress || this._taprootAddress
    if (!address) {
      throw new Error('No address available for signing')
    }

    const result = await this.api.request('signMessage', {
      message,
      paymentType: this._nativeSegwitAddress ? 'p2wpkh' : 'p2tr',
    }) as LeatherSignMessageResult

    return result.result.signature
  }

  /**
   * Send BTC - Leather uses sendTransfer
   */
  async sendBitcoin(to: string, amount: number): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    const result = await this.api.request('sendTransfer', {
      recipients: [
        {
          address: to,
          amount: amount.toString(),
        },
      ],
    }) as { result: { txid: string } }

    return result.result.txid
  }

  /**
   * Detect network from address prefix
   */
  private detectNetworkFromAddress(address: string): BitcoinNetwork {
    // Mainnet prefixes
    if (address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1')) {
      return 'mainnet'
    }
    // Testnet prefixes
    if (address.startsWith('m') || address.startsWith('n') || address.startsWith('2') || address.startsWith('tb1')) {
      return 'testnet'
    }
    // Signet
    if (address.startsWith('sb1')) {
      return 'signet'
    }
    // Regtest
    if (address.startsWith('bcrt1')) {
      return 'regtest'
    }
    return WALLET_NETWORK
  }
}

// Singleton instance
let leatherAdapter: LeatherAdapter | null = null

/**
 * Get Leather adapter instance
 */
export function getLeatherAdapter(): LeatherAdapter {
  if (!leatherAdapter) {
    leatherAdapter = new LeatherAdapter()
  }
  return leatherAdapter
}
