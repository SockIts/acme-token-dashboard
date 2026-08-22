/**
 * UTXO Fetcher
 *
 * Wallets that don't expose UTXO data through their own API (notably Xverse,
 * Leather) need an indexed source. The webapp uses the ACME backend instead
 * of calling public mempool.space directly. The backend normalizes electrs
 * listunspent responses and falls back internally when electrs is unavailable.
 *
 * The backend should include scriptPubKey, but we still derive it locally as a
 * defensive fallback for standard Bitcoin addresses.
 */

import { address as btcAddress, networks } from 'bitcoinjs-lib'
import { adminApiClient } from '@/services/api/client'
import type { UTXO, BitcoinNetwork } from '@/types/wallet'
import { WALLET_NETWORK } from '@/utils/network'

interface BackendUtxo {
  txid?: string
  tx_hash?: string
  vout?: number
  tx_pos?: number
  value?: number | string
  amount?: number | string
  scriptPubKey?: string
  script_pubkey?: string
  address?: string
  confirmations?: number
  height?: number
}

function networkFor(net: BitcoinNetwork) {
  // testnet4 uses the same address prefixes (`tb1...`, `m`/`n`) as testnet3,
  // and bitcoinjs-lib's `testnet` network params apply to both. We don't
  // distinguish; address derivation is identical.
  if (net === 'mainnet') return networks.bitcoin
  return networks.testnet
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Derive scriptPubKey hex from a Bitcoin address. Returns empty string if
 * derivation fails (bad address, unsupported type) — backend compose flows
 * may still be able to recover from address alone.
 */
function deriveScriptPubKey(address: string, network: BitcoinNetwork): string {
  try {
    const out = btcAddress.toOutputScript(address, networkFor(network))
    return bytesToHex(out as Uint8Array)
  } catch (e) {
    console.warn(`[utxoFetcher] Could not derive scriptPubKey for ${address}:`, e)
    return ''
  }
}

function normalizeValue(utxo: BackendUtxo): number {
  if (utxo.value !== undefined) return Number(utxo.value)
  if (utxo.amount !== undefined) return Math.round(Number(utxo.amount) * 100_000_000)
  return 0
}

function normalizeConfirmations(utxo: BackendUtxo): number {
  if (typeof utxo.confirmations === 'number') return utxo.confirmations
  if (typeof utxo.height === 'number' && utxo.height > 0) return 1
  return 0
}

function normalizeUtxo(
  utxo: BackendUtxo,
  address: string,
  fallbackScriptPubKey: string,
): UTXO | null {
  const txid = utxo.txid ?? utxo.tx_hash
  const vout = utxo.vout ?? utxo.tx_pos
  const value = normalizeValue(utxo)

  if (!txid || vout === undefined || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return {
    txid,
    vout,
    value,
    scriptPubKey: utxo.scriptPubKey ?? utxo.script_pubkey ?? fallbackScriptPubKey,
    address: utxo.address ?? address,
    confirmations: normalizeConfirmations(utxo),
  }
}

/**
 * Fetch UTXOs for an address from the backend electrs/Core source chain.
 * Returns confirmed and unconfirmed UTXOs when electrs is available.
 */
export async function fetchUtxos(
  address: string,
  network: BitcoinNetwork = WALLET_NETWORK,
): Promise<UTXO[]> {
  const response = await adminApiClient.get(`/bitcoin/addresses/${encodeURIComponent(address)}/utxos`)
  const data = response.data?.result ?? response.data?.data ?? response.data
  if (!Array.isArray(data)) return []

  const scriptPubKey = deriveScriptPubKey(address, network)
  return data
    .map(utxo => normalizeUtxo(utxo as BackendUtxo, address, scriptPubKey))
    .filter((utxo): utxo is UTXO => utxo !== null)
}
