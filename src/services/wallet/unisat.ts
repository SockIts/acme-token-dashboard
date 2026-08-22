/**
 * UniSat Wallet Adapter
 * @see https://docs.unisat.io/dev/unisat-developer-service/unisat-wallet
 */

import { Psbt } from 'bitcoinjs-lib'
import type { BitcoinNetwork, SignPsbtOptions, UTXO, WalletConnectionResult } from '@/types/wallet'
import { BaseWalletAdapter, WALLET_ICONS } from './types'
import type { UniSatAPI } from './types'
import { fetchUtxos } from './utxoFetcher'
import { broadcastRawTransaction } from './broadcast'
import { WALLET_NETWORK } from '@/utils/network'

declare global {
  interface Window {
    unisat?: UniSatAPI
  }
}

export class UniSatAdapter extends BaseWalletAdapter {
  readonly provider = 'unisat' as const
  readonly name = 'UniSat Wallet'
  readonly icon = WALLET_ICONS.unisat

  private _connected = false
  private _address: string | null = null
  private _publicKey: string | null = null
  private _network: BitcoinNetwork = WALLET_NETWORK

  /** Callback invoked when the user switches accounts in the extension */
  onAccountChange?: (address: string) => void

  /**
   * Check if UniSat extension is installed
   */
  get installed(): boolean {
    return typeof window !== 'undefined' && !!window.unisat
  }

  /**
   * Get UniSat API instance
   */
  private get api(): UniSatAPI {
    if (!window.unisat) {
      throw new Error('UniSat wallet is not installed')
    }
    return window.unisat
  }

  /**
   * Connect to UniSat wallet
   */
  async connect(): Promise<WalletConnectionResult> {
    if (!this.installed) {
      throw new Error('UniSat wallet is not installed. Please install it from https://unisat.io')
    }

    try {
      // Request account access
      const accounts = await this.api.requestAccounts()
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your UniSat wallet.')
      }

      this._address = accounts[0]
      this._publicKey = await this.api.getPublicKey()

      // Get network
      const networkStr = await this.api.getNetwork()
      this._network = this.parseNetwork(networkStr)

      this._connected = true

      // Set up event listeners
      this.setupEventListeners()

      return {
        address: this._address,
        publicKey: this._publicKey,
        network: this._network,
      }
    } catch (error) {
      this._connected = false
      throw error
    }
  }

  /**
   * Disconnect from wallet
   */
  async disconnect(): Promise<void> {
    this._connected = false
    this._address = null
    this._publicKey = null
    this.removeEventListeners()
  }

  /**
   * Get connected address
   */
  async getAddress(): Promise<string> {
    if (!this._connected || !this._address) {
      throw new Error('Wallet not connected')
    }
    return this._address
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
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    const balance = await this.api.getBalance()
    return balance.total
  }

  /**
   * Get current network
   */
  async getNetwork(): Promise<BitcoinNetwork> {
    const networkStr = await this.api.getNetwork()
    this._network = this.parseNetwork(networkStr)
    return this._network
  }

  /**
   * Get UTXOs for the connected address.
   *
   * Previously this called `window.unisat.getBitcoinUtxos()`, but UniSat's
   * indexer lags behind the network: when we broadcast via mempool.space
   * (see `pushPsbt`), UniSat's backend doesn't immediately see the spent
   * UTXO as spent, so the next compose returns the same UTXO and creates a
   * conflicting low-fee replacement that mempool.space rejects.
   *
   * Use the shared mempool.space Esplora fetcher (same source as the
   * broadcaster) so the spent UTXO disappears and the new change UTXO
   * appears the moment a tx hits the public mempool.
   */
  async getUtxos(): Promise<UTXO[]> {
    if (!this._connected || !this._address) {
      throw new Error('Wallet not connected')
    }

    try {
      return await fetchUtxos(this._address, this._network)
    } catch (error) {
      console.error('Failed to get UTXOs from mempool.space:', error)
      return []
    }
  }

  /**
   * Broadcast a signed PSBT to the network.
   *
   * UniSat's built-in `window.unisat.pushPsbt` routes through UniSat's own
   * backend, whose Bitcoin Core relay still enforces the pre-Core-30 default
   * `maxdatacarriersize=83`. ACME OP_RETURN message envelopes (Send, Order,
   * larger protocol messages are 90-110 bytes of pushdata, which that relay rejects as
   * `bad-txns-nonstandard` ("scriptpubkey"). The thrown rejection is a plain
   * `{code, msg}` object, not an Error — which is also why the UI shows the
   * generic "Failed to send" fallback with nothing in the console.
   *
   * Bypass the UniSat relay: extract the raw tx from the already-finalized PSBT
   * and submit it through the ACME backend. The PSBT is finalized because the
   * SendModal / mint flows pass `autoFinalized: true` to `signPsbt`.
   */
  async pushPsbt(psbt: string): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    const isHex = /^[0-9a-fA-F]+$/.test(psbt)
    const parsed = isHex ? Psbt.fromHex(psbt) : Psbt.fromBase64(psbt)

    try {
      parsed.finalizeAllInputs()
    } catch (e) {
      console.log('[UniSat] pushPsbt: finalizeAllInputs threw (likely already finalized):', e)
    }

    const tx = parsed.extractTransaction()
    const rawHex = tx.toHex()
    console.log('[UniSat] pushPsbt: broadcasting tx', tx.getId(), 'size', rawHex.length / 2, 'bytes')

    const txid = await broadcastRawTransaction(rawHex)
    console.log('[UniSat] pushPsbt: broadcast ok, txid:', txid)
    return txid
  }

  /**
   * Sign a PSBT (Partially Signed Bitcoin Transaction)
   */
  async signPsbt(psbtInput: string, options?: SignPsbtOptions): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    // Detect format. The legacy `psbtHex` parameter name is misleading —
    // ACME compose endpoints return PSBTs as base64. Accept both: pass hex
    // through directly, convert base64 to hex.
    const isHex = /^[0-9a-fA-F]+$/.test(psbtInput)
    const psbtHex = isHex ? psbtInput : this.base64ToHex(psbtInput)

    // UniSat expects hex format
    const signedPsbt = await this.api.signPsbt(psbtHex, {
      autoFinalized: options?.autoFinalized ?? true,
      toSignInputs: options?.toSignInputs?.map(input => ({
        index: input.index,
        address: input.address,
        publicKey: input.publicKey,
        sighashTypes: input.sighashTypes,
        disableTweakSigner: input.disableTweakSigner,
      })),
    })

    return signedPsbt
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    return await this.api.signMessage(message, 'ecdsa')
  }

  /**
   * Send BTC to an address
   */
  async sendBitcoin(to: string, amount: number): Promise<string> {
    if (!this._connected) {
      throw new Error('Wallet not connected')
    }

    return await this.api.sendBitcoin(to, amount)
  }

  /**
   * Switch network
   */
  async switchNetwork(network: BitcoinNetwork): Promise<void> {
    const networkMap: Record<BitcoinNetwork, string> = {
      mainnet: 'livenet',
      testnet: 'testnet',
      signet: 'signet',
      regtest: 'regtest',
    }

    await this.api.switchNetwork(networkMap[network])
    this._network = network
  }

  /**
   * Push a signed transaction to the network
   */
  async broadcastTransaction(rawTxHex: string): Promise<string> {
    return await this.api.pushTx(rawTxHex)
  }

  /**
   * Set up wallet event listeners
   */
  private setupEventListeners(): void {
    if (!window.unisat) return

    window.unisat.on('accountsChanged', this.handleAccountsChanged as (...args: unknown[]) => void)
    window.unisat.on('networkChanged', this.handleNetworkChanged as (...args: unknown[]) => void)
  }

  /**
   * Remove wallet event listeners
   */
  private removeEventListeners(): void {
    if (!window.unisat) return

    window.unisat.removeListener('accountsChanged', this.handleAccountsChanged as (...args: unknown[]) => void)
    window.unisat.removeListener('networkChanged', this.handleNetworkChanged as (...args: unknown[]) => void)
  }

  /**
   * Handle account change event
   */
  private handleAccountsChanged = (accounts: string[]): void => {
    if (accounts.length === 0) {
      this.disconnect()
    } else {
      const newAddress = accounts[0]
      if (newAddress !== this._address) {
        this._address = newAddress
        this.onAccountChange?.(newAddress)
      }
    }
  }

  /**
   * Handle network change event
   */
  private handleNetworkChanged = (network: string): void => {
    this._network = this.parseNetwork(network)
  }
}

// Singleton instance
let unisatAdapter: UniSatAdapter | null = null

/**
 * Get UniSat adapter instance
 */
export function getUniSatAdapter(): UniSatAdapter {
  if (!unisatAdapter) {
    unisatAdapter = new UniSatAdapter()
  }
  return unisatAdapter
}
