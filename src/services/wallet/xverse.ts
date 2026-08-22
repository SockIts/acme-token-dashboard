/**
 * Xverse Wallet Adapter
 * Uses the Sats Connect library pattern
 * @see https://docs.xverse.app/sats-connect
 *
 * Modern Xverse (v0.42+) returns responses wrapped as
 *   { status: 'success', result: <data> } | { status: 'error', error: <error> }
 * Older Xverse returned data directly. This adapter handles both.
 *
 * ACME's Bitcoin network is supplied by the frontend build config.
 */

import { Psbt } from 'bitcoinjs-lib'
import type { BitcoinNetwork, SignPsbtOptions, UTXO, WalletConnectionResult } from '@/types/wallet'
import { BaseWalletAdapter, WALLET_ICONS } from './types'
import type { XverseAPI } from './types'
import { fetchUtxos } from './utxoFetcher'
import { broadcastRawTransaction } from './broadcast'
import { WALLET_NETWORK } from '@/utils/network'

/**
 * NOTE on network selection: we intentionally do not pass a network override
 * to the Xverse `getAddresses` request. Some active Xverse extension builds
 * silently reject requests with this param (no popup, no error). Letting
 * Xverse default to whichever network the user has selected in the
 * extension's own UI proved more reliable. We detect the actual network from
 * the address prefix after connection.
 */

/**
 * Unwrap a Sats Connect response. Xverse's `request()` returns one of:
 *
 *   1. JSON-RPC 2.0 (current Xverse, observed in production):
 *        { jsonrpc: '2.0', id: '...', result: <data> }
 *        { jsonrpc: '2.0', id: '...', error: { code, message } }
 *
 *   2. Status-tagged envelope (older Sats Connect docs):
 *        { status: 'success', result: <data> }
 *        { status: 'error', error: { message, code } }
 *
 *   3. Legacy direct-data (very old Xverse):
 *        <data> directly
 *
 * Throws when an error envelope is detected so callers see the wallet's
 * actual error message instead of a generic "no addresses" downstream.
 */
function unwrapXverseResponse<T>(raw: unknown): T {
  if (raw && typeof raw === 'object') {
    // JSON-RPC 2.0 envelope
    if ('jsonrpc' in raw) {
      const env = raw as {
        jsonrpc: string
        id?: string
        result?: T
        error?: { message?: string; code?: string | number }
      }
      if (env.error) {
        const msg = env.error.message || `Xverse error (${env.error.code ?? 'unknown'})`
        throw new Error(msg)
      }
      if (env.result !== undefined) {
        return env.result
      }
    }
    // Status-tagged envelope
    if ('status' in raw) {
      const env = raw as { status: string; result?: T; error?: { message?: string; code?: string | number } }
      if (env.status === 'error') {
        const msg = env.error?.message || `Xverse error (${env.error?.code ?? 'unknown'})`
        throw new Error(msg)
      }
      if (env.status === 'success' && env.result !== undefined) {
        return env.result
      }
    }
  }
  // Legacy unwrapped format
  return raw as T
}

declare global {
  interface Window {
    XverseProviders?: {
      BitcoinProvider?: XverseAPI
    }
    BitcoinProvider?: XverseAPI
  }
}

interface XverseAddress {
  address: string
  publicKey: string
  purpose: 'payment' | 'ordinals' | 'stacks'
  addressType: 'p2tr' | 'p2wpkh' | 'p2sh' | 'stacks'
}

interface XverseGetAddressResult {
  addresses: XverseAddress[]
}

interface XverseSignPsbtResult {
  psbt: string  // Base64 encoded
  txid?: string
}

interface XverseBalanceResult {
  confirmed: number
  unconfirmed: number
  total: number
}

export class XverseAdapter extends BaseWalletAdapter {
  readonly provider = 'xverse' as const
  readonly name = 'Xverse Wallet'
  readonly icon = WALLET_ICONS.xverse

  private _connected = false
  private _paymentAddress: string | null = null
  private _ordinalsAddress: string | null = null
  private _publicKey: string | null = null
  private _network: BitcoinNetwork = WALLET_NETWORK

  /**
   * Check if Xverse extension is installed
   */
  get installed(): boolean {
    if (typeof window === 'undefined') return false
    return !!(window.XverseProviders?.BitcoinProvider || window.BitcoinProvider)
  }

  /**
   * Get Xverse API instance
   */
  private get api(): XverseAPI {
    const provider = window.XverseProviders?.BitcoinProvider || window.BitcoinProvider
    if (!provider) {
      throw new Error('Xverse wallet is not installed')
    }
    return provider
  }

  /**
   * Connect to Xverse wallet
   */
  async connect(): Promise<WalletConnectionResult> {
    if (!this.installed) {
      throw new Error('Xverse wallet is not installed. Please install it from https://www.xverse.app')
    }

    try {
      // Strategy:
      //   Modern Xverse (v0.42+) gates capability calls behind an explicit
      //   permission grant via `wallet_connect`. Without it, `getAddresses`
      //   silently returns `{addresses: []}` even with no popup. We try
      //   `wallet_connect` first; on success it returns the addresses we
      //   need directly. On older Xverse builds where `wallet_connect`
      //   doesn't exist, the call throws and we fall back to `getAddresses`.
      //
      //   We do not pass an explicit network override because
      //   some Xverse versions silently reject that param shape (no popup,
      //   no error). We honor whichever network the user has set in the
      //   extension UI and detect from the returned address prefix.

      console.log('[Xverse] connect() — provider:', this.api)
      let addresses: XverseAddress[] = []

      // Step 1: wallet_connect (modern Xverse permission flow)
      try {
        const connectRaw = await this.api.request('wallet_connect', {
          addresses: ['payment', 'ordinals'],
          message: 'ACME Protocol requests access to your wallet',
        })
        console.log('[Xverse] wallet_connect raw:', connectRaw)
        const unwrapped = unwrapXverseResponse<XverseGetAddressResult>(connectRaw)
        console.log('[Xverse] wallet_connect unwrapped:', unwrapped)
        if (unwrapped?.addresses?.length) {
          addresses = unwrapped.addresses
        }
      } catch (e) {
        console.log('[Xverse] wallet_connect threw (likely unsupported on this build):', e)
      }

      // Step 2: getAddresses fallback (legacy / backstop)
      if (addresses.length === 0) {
        console.log('[Xverse] falling back to getAddresses')
        const raw = await this.api.request('getAddresses', {
          purposes: ['payment', 'ordinals'],
          message: 'ACME Protocol requests access to your wallet',
        })
        console.log('[Xverse] getAddresses raw:', raw)
        const result = unwrapXverseResponse<XverseGetAddressResult>(raw)
        console.log('[Xverse] getAddresses unwrapped:', result)
        if (result?.addresses?.length) {
          addresses = result.addresses
        }
      }

      if (addresses.length === 0) {
        throw new Error('No addresses returned from Xverse wallet')
      }

      console.log('[Xverse] addresses resolved:', addresses)

      // Find payment and ordinals addresses
      const paymentAddr = addresses.find(a => a.purpose === 'payment')
      const ordinalsAddr = addresses.find(a => a.purpose === 'ordinals')

      if (!paymentAddr) {
        throw new Error('No payment address found')
      }

      this._paymentAddress = paymentAddr.address
      this._ordinalsAddress = ordinalsAddr?.address || null
      this._publicKey = paymentAddr.publicKey

      // Determine network from address prefix
      this._network = this.detectNetworkFromAddress(paymentAddr.address)

      this._connected = true

      return {
        address: this._paymentAddress,
        publicKey: this._publicKey,
        network: this._network,
      }
    } catch (error) {
      this._connected = false
      if (error instanceof Error && error.message.includes('User rejected')) {
        throw new Error('Connection rejected by user')
      }
      throw error
    }
  }

  /**
   * Disconnect from wallet
   */
  async disconnect(): Promise<void> {
    this._connected = false
    this._paymentAddress = null
    this._ordinalsAddress = null
    this._publicKey = null
  }

  /**
   * Get connected payment address
   */
  async getAddress(): Promise<string> {
    if (!this._connected || !this._paymentAddress) {
      throw new Error('Wallet not connected')
    }
    return this._paymentAddress
  }

  /**
   * Get ordinals address (taproot)
   */
  async getOrdinalsAddress(): Promise<string | null> {
    return this._ordinalsAddress
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
   */
  async getBalance(): Promise<number> {
    if (!this._connected || !this._paymentAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      const raw = await this.api.request('getBalance', {})
      const result = unwrapXverseResponse<XverseBalanceResult>(raw)
      return result?.total || 0
    } catch {
      // Fallback: Return 0 if balance endpoint not available
      return 0
    }
  }

  /**
   * Get current network
   */
  async getNetwork(): Promise<BitcoinNetwork> {
    return this._network
  }

  /**
   * Get UTXOs for the connected payment address.
   *
   * Xverse's Sats Connect API doesn't expose a UTXO endpoint, so we fetch
   * through the ACME backend. The scriptPubKey is derived from the address via
   * bitcoinjs-lib — see services/wallet/utxoFetcher.ts.
   */
  async getUtxos(): Promise<UTXO[]> {
    if (!this._connected || !this._paymentAddress) {
      throw new Error('Wallet not connected')
    }
    return fetchUtxos(this._paymentAddress, this._network)
  }

  /**
   * Sign a PSBT.
   *
   * Accepts the PSBT in EITHER hex OR base64. The legacy parameter name
   * `psbtHex` is misleading — callers across the codebase pass base64
   * (because that's what the ACME compose endpoints return). We detect the
   * input format from the charset and convert as needed.
   *
   * Xverse expects base64 internally; we always return hex for consistency
   * with UniSat's signPsbt return shape.
   */
  async signPsbt(psbtInput: string, options?: SignPsbtOptions): Promise<string> {
    if (!this._connected || !this._paymentAddress) {
      throw new Error('Wallet not connected')
    }

    // Detect format. PSBT magic bytes are "psbt\xff" → starts with `70736274`
    // in hex or `cHNidP8` in base64. The hex form is a strict subset of
    // [0-9a-fA-F] so a charset test is unambiguous.
    const isHex = /^[0-9a-fA-F]+$/.test(psbtInput)
    const psbtBase64 = isHex ? this.hexToBase64(psbtInput) : psbtInput
    console.log('[Xverse] signPsbt input format:', isHex ? 'hex' : 'base64', '→ base64 for Xverse')

    // Build sign inputs for Xverse format
    const signInputs: Record<string, number[]> = {}
    if (options?.toSignInputs) {
      for (const input of options.toSignInputs) {
        const addr = input.address || this._paymentAddress
        if (!signInputs[addr]) {
          signInputs[addr] = []
        }
        signInputs[addr].push(input.index)
      }
    }

    // NOTE: do NOT pass `broadcast: false` here. Modern Xverse deprecated
    // the `broadcast` parameter on signPsbt — passing it (with ANY value,
    // including `false`) makes the wallet reject the request with
    // "This wallet does not support PSBT broadcasting". Omitting the field
    // gives us sign-only behavior, which is what we want; broadcasting is
    // handled separately by the ACME backend after we return the signed PSBT.
    const raw = await this.api.request('signPsbt', {
      psbt: psbtBase64,
      signInputs: Object.keys(signInputs).length > 0 ? signInputs : undefined,
    })
    const result = unwrapXverseResponse<XverseSignPsbtResult>(raw)

    if (!result?.psbt) {
      throw new Error('Xverse returned no signed PSBT')
    }

    // Convert back to hex
    return this.base64ToHex(result.psbt)
  }

  /**
   * Broadcast a signed PSBT to the network.
   *
   * Xverse's Sats Connect API doesn't expose a broadcast endpoint, so we
   * extract the raw transaction from the already-finalized PSBT using
   * bitcoinjs-lib and submit it through the ACME backend.
   *
   * The signed PSBT comes back from `signPsbt()` already finalized when the
   * caller passed `autoFinalized: true` (most flows do). If not finalized,
   * we attempt finalization here as a best-effort fallback.
   */
  async pushPsbt(psbt: string): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    // Parse PSBT. Accept both hex and base64 input.
    const isHex = /^[0-9a-fA-F]+$/.test(psbt)
    const parsed = isHex ? Psbt.fromHex(psbt) : Psbt.fromBase64(psbt)

    // Best-effort finalize (no-op if all inputs are already finalized).
    try {
      parsed.finalizeAllInputs()
    } catch (e) {
      // Already finalized inputs throw — that's fine, we ignore and proceed.
      console.log('[Xverse] pushPsbt: finalizeAllInputs threw (likely already finalized):', e)
    }

    const tx = parsed.extractTransaction()
    const rawHex = tx.toHex()
    console.log('[Xverse] pushPsbt: broadcasting tx', tx.getId(), 'size', rawHex.length / 2, 'bytes')

    const txid = await broadcastRawTransaction(rawHex)
    console.log('[Xverse] pushPsbt: broadcast ok, txid:', txid)
    return txid
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this._connected || !this._paymentAddress) {
      throw new Error('Wallet not connected')
    }

    const raw = await this.api.request('signMessage', {
      address: this._paymentAddress,
      message,
      protocol: 'ECDSA',
    })
    const result = unwrapXverseResponse<{ signature: string }>(raw)

    if (!result?.signature) {
      throw new Error('Xverse returned no signature')
    }

    return result.signature
  }

  /**
   * Send BTC to an address
   */
  async sendBitcoin(to: string, amount: number): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    const raw = await this.api.request('sendTransfer', {
      recipients: [{ address: to, amount }],
    })
    const result = unwrapXverseResponse<{ txid: string }>(raw)

    if (!result?.txid) {
      throw new Error('Xverse returned no txid')
    }

    return result.txid
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
let xverseAdapter: XverseAdapter | null = null

/**
 * Get Xverse adapter instance
 */
export function getXverseAdapter(): XverseAdapter {
  if (!xverseAdapter) {
    xverseAdapter = new XverseAdapter()
  }
  return xverseAdapter
}
