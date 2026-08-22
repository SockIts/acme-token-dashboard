/**
 * Wallet Connector
 * Unified interface for all wallet providers
 */

import type {
  WalletProvider,
  WalletAdapter,
  BitcoinNetwork,
  SignPsbtOptions,
  WalletConnectionResult,
} from '@/types/wallet'
import { getUniSatAdapter } from './unisat'
import { getXverseAdapter } from './xverse'
import { getLeatherAdapter } from './leather'
import { getMetaMaskAdapter } from './metamask'
import { WALLET_ICONS } from './types'

/**
 * Wallet info for display
 */
export interface WalletInfo {
  provider: WalletProvider
  name: string
  icon: string
  installed: boolean
  description: string
  downloadUrl: string
  /** Whether the wallet's Bitcoin API is coming soon (not yet available for developers) */
  comingSoon?: boolean
  /** Whether the wallet supports Bitcoin transactions (PSBT signing, etc.) */
  bitcoinSupported?: boolean
}

interface PushPsbtCapableAdapter extends WalletAdapter {
  pushPsbt?: (psbt: string) => Promise<string>
}

/**
 * All supported wallets with metadata
 */
export const SUPPORTED_WALLETS: WalletInfo[] = [
  {
    provider: 'unisat',
    name: 'UniSat Wallet',
    icon: WALLET_ICONS.unisat,
    installed: false,  // Will be updated at runtime
    description: 'Ordinals-ready Bitcoin wallet',
    downloadUrl: 'https://unisat.io/download',
    bitcoinSupported: true,
  },
  {
    provider: 'xverse',
    name: 'Xverse Wallet',
    icon: WALLET_ICONS.xverse,
    installed: false,
    description: 'Bitcoin + Stacks wallet',
    downloadUrl: 'https://www.xverse.app/download',
    bitcoinSupported: true,
  },
  {
    provider: 'leather',
    name: 'Leather Wallet',
    icon: WALLET_ICONS.leather,
    installed: false,
    description: 'Secure BTC wallet',
    downloadUrl: 'https://leather.io/install-extension',
    bitcoinSupported: true,
  },
  {
    provider: 'metamask',
    name: 'MetaMask',
    icon: WALLET_ICONS.metamask,
    installed: false,
    description: 'Bitcoin coming soon',
    downloadUrl: 'https://metamask.io/download/',
    comingSoon: true,
    bitcoinSupported: false,
  },
]

/**
 * WalletConnector class
 * Manages wallet connections and provides a unified API
 */
export class WalletConnector {
  private activeAdapter: WalletAdapter | null = null
  private activeProvider: WalletProvider | null = null

  /** Callback invoked when the wallet extension reports an account change */
  onAccountChange?: (address: string) => void

  /**
   * Get adapter for a specific provider
   */
  getAdapter(provider: WalletProvider): WalletAdapter {
    switch (provider) {
      case 'unisat':
        return getUniSatAdapter()
      case 'xverse':
        return getXverseAdapter()
      case 'leather':
        return getLeatherAdapter()
      case 'metamask':
        return getMetaMaskAdapter()
      default:
        throw new Error(`Unknown wallet provider: ${provider}`)
    }
  }

  /**
   * Detect which wallets are installed
   */
  detectInstalledWallets(): WalletInfo[] {
    return SUPPORTED_WALLETS.map(wallet => {
      const adapter = this.getAdapter(wallet.provider)
      // Check if adapter has bitcoinSupported property (MetaMask adapter)
      const bitcoinSupported = 'bitcoinSupported' in adapter
        ? (adapter as { bitcoinSupported: boolean }).bitcoinSupported
        : wallet.bitcoinSupported ?? true

      return {
        ...wallet,
        installed: adapter.installed,
        // Update comingSoon based on actual Bitcoin support
        comingSoon: wallet.comingSoon && !bitcoinSupported,
        bitcoinSupported,
      }
    })
  }

  /**
   * Get list of installed wallets
   */
  getInstalledWallets(): WalletInfo[] {
    return this.detectInstalledWallets().filter(w => w.installed)
  }

  /**
   * Check if any wallet is installed
   */
  hasInstalledWallet(): boolean {
    return this.getInstalledWallets().length > 0
  }

  /**
   * Connect to a wallet
   */
  async connect(provider: WalletProvider): Promise<WalletConnectionResult> {
    // Disconnect from current wallet if connected
    if (this.activeAdapter) {
      await this.disconnect()
    }

    const adapter = this.getAdapter(provider)

    if (!adapter.installed) {
      const walletInfo = SUPPORTED_WALLETS.find(w => w.provider === provider)
      throw new Error(
        `${walletInfo?.name || provider} is not installed. ` +
        `Please install it from ${walletInfo?.downloadUrl || 'the wallet website'}`
      )
    }

    const result = await adapter.connect()

    this.activeAdapter = adapter
    this.activeProvider = provider

    // Wire account change callback if adapter supports it
    if ('onAccountChange' in adapter) {
      (adapter as { onAccountChange?: (addr: string) => void }).onAccountChange = (addr: string) => {
        this.onAccountChange?.(addr)
      }
    }

    return result
  }

  /**
   * Disconnect from current wallet
   */
  async disconnect(): Promise<void> {
    if (this.activeAdapter) {
      await this.activeAdapter.disconnect()
      this.activeAdapter = null
      this.activeProvider = null
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.activeAdapter !== null
  }

  /**
   * Get active provider
   */
  getActiveProvider(): WalletProvider | null {
    return this.activeProvider
  }

  /**
   * Get current address
   */
  async getAddress(): Promise<string> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.getAddress()
  }

  /**
   * Get public key
   */
  async getPublicKey(): Promise<string> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.getPublicKey()
  }

  /**
   * Get BTC balance
   */
  async getBalance(): Promise<number> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.getBalance()
  }

  /**
   * Get network
   */
  async getNetwork(): Promise<BitcoinNetwork> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.getNetwork()
  }

  /**
   * Sign a PSBT
   */
  async signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.signPsbt(psbtHex, options)
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.signMessage(message)
  }

  /**
   * Send BTC
   */
  async sendBitcoin(to: string, amount: number): Promise<string> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    if (!this.activeAdapter.sendBitcoin) {
      throw new Error('This wallet does not support direct BTC sending')
    }
    return this.activeAdapter.sendBitcoin(to, amount)
  }

  /**
   * Get UTXOs from wallet
   */
  async getUtxos(): Promise<import('@/types/wallet').UTXO[]> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    return this.activeAdapter.getUtxos()
  }

  /**
   * Broadcast a signed PSBT
   */
  async pushPsbt(psbt: string): Promise<string> {
    if (!this.activeAdapter) {
      throw new Error('No wallet connected')
    }
    // Use the adapter's pushPsbt if available (UniSat), otherwise fall back
    const adapter = this.activeAdapter as PushPsbtCapableAdapter
    if (typeof adapter.pushPsbt === 'function') {
      return adapter.pushPsbt(psbt)
    }
    throw new Error('This wallet does not support PSBT broadcasting')
  }

  /**
   * Attempt to reconnect to a previously connected wallet
   */
  async tryReconnect(provider: WalletProvider): Promise<WalletConnectionResult | null> {
    try {
      const adapter = this.getAdapter(provider)
      if (!adapter.installed) {
        return null
      }

      const result = await adapter.connect()
      this.activeAdapter = adapter
      this.activeProvider = provider

      return result
    } catch {
      // Silent fail for auto-reconnect
      return null
    }
  }
}

// Singleton instance
let walletConnector: WalletConnector | null = null

/**
 * Get the wallet connector instance
 */
export function getWalletConnector(): WalletConnector {
  if (!walletConnector) {
    walletConnector = new WalletConnector()
  }
  return walletConnector
}
