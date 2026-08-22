/**
 * MetaMask Wallet Adapter (Placeholder)
 *
 * MetaMask Bitcoin support is not yet available for third-party developers.
 * This adapter is a placeholder for future implementation once the API is released.
 */

import type { BitcoinNetwork, SignPsbtOptions, UTXO, WalletConnectionResult } from '@/types/wallet'
import { BaseWalletAdapter, WALLET_ICONS } from './types'

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean
    }
  }
}

/**
 * Check if MetaMask extension is installed
 */
function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' &&
         typeof window.ethereum !== 'undefined' &&
         window.ethereum.isMetaMask === true
}

/**
 * MetaMask Bitcoin Adapter (Placeholder)
 *
 * This adapter detects MetaMask installation but Bitcoin functionality
 * is not yet available. Will be implemented when MetaMask releases
 * their Bitcoin API for developers.
 */
export class MetaMaskAdapter extends BaseWalletAdapter {
  readonly provider = 'metamask' as const
  readonly name = 'MetaMask'
  readonly icon = WALLET_ICONS.metamask

  /**
   * Check if MetaMask extension is installed
   */
  get installed(): boolean {
    return isMetaMaskInstalled()
  }

  /**
   * Bitcoin API is not yet available
   */
  get bitcoinSupported(): boolean {
    return false
  }

  async connect(): Promise<WalletConnectionResult> {
    throw new Error('MetaMask Bitcoin API is not yet available for developers. Please use UniSat, Xverse, or Leather wallet.')
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  async getAddress(): Promise<string> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async getPublicKey(): Promise<string> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async getBalance(): Promise<number> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async getNetwork(): Promise<BitcoinNetwork> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async getUtxos(): Promise<UTXO[]> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async signPsbt(_psbtHex: string, _options?: SignPsbtOptions): Promise<string> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async signMessage(_message: string): Promise<string> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }

  async sendBitcoin(_to: string, _amount: number): Promise<string> {
    throw new Error('MetaMask Bitcoin API is not yet available')
  }
}

// Singleton instance
let metamaskAdapter: MetaMaskAdapter | null = null

/**
 * Get MetaMask adapter instance
 */
export function getMetaMaskAdapter(): MetaMaskAdapter {
  if (!metamaskAdapter) {
    metamaskAdapter = new MetaMaskAdapter()
  }
  return metamaskAdapter
}
