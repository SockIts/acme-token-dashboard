/**
 * Wallet Types
 * For Bitcoin wallet integration (UniSat, Xverse, Leather, MetaMask)
 */

/** Supported wallet providers */
export type WalletProvider = 'unisat' | 'xverse' | 'leather' | 'metamask'

/** Bitcoin network */
export type BitcoinNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest'

/** Wallet connection state */
export interface WalletState {
  connected: boolean
  connecting: boolean
  provider: WalletProvider | null
  address: string | null
  publicKey: string | null
  btcBalance: number  // In satoshis
  network: BitcoinNetwork
  error: string | null
}

/** UTXO for building transactions */
export interface UTXO {
  txid: string
  vout: number
  value: number  // In satoshis
  scriptPubKey: string
  address: string
  confirmations: number
}

/** Sign PSBT options */
export interface SignPsbtOptions {
  autoFinalized?: boolean
  toSignInputs?: ToSignInput[]
}

/** Input to sign in PSBT */
export interface ToSignInput {
  index: number
  address?: string
  publicKey?: string
  sighashTypes?: number[]
  disableTweakSigner?: boolean
}

/** Wallet adapter interface */
export interface WalletAdapter {
  provider: WalletProvider
  name: string
  icon: string
  installed: boolean

  connect(): Promise<WalletConnectionResult>
  disconnect(): Promise<void>
  getAddress(): Promise<string>
  getPublicKey(): Promise<string>
  getBalance(): Promise<number>
  getNetwork(): Promise<BitcoinNetwork>
  getUtxos(): Promise<UTXO[]>
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>
  signMessage(message: string): Promise<string>
  sendBitcoin?(to: string, amount: number): Promise<string>
}

/** Wallet connection result */
export interface WalletConnectionResult {
  address: string
  publicKey: string
  network: BitcoinNetwork
}

/** Format satoshis as BTC */
export function formatBtc(satoshis: number, decimals: number = 8): string {
  const btc = satoshis / 100_000_000
  return btc.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

/** Format BTC with symbol */
export function formatBtcWithSymbol(satoshis: number, decimals: number = 8): string {
  return `${formatBtc(satoshis, decimals)} BTC`
}

/** Parse BTC string to satoshis */
export function parseBtcToSatoshis(btcString: string): number {
  const btc = parseFloat(btcString)
  if (isNaN(btc)) return 0
  return Math.round(btc * 100_000_000)
}
