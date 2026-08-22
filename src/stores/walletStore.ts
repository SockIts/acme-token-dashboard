import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BitcoinNetwork, UTXO, WalletProvider } from '@/types/wallet'
import { WALLET_NETWORK } from '@/utils/network'

interface WalletState {
  connected: boolean
  connecting: boolean
  provider: WalletProvider | null
  address: string | null
  publicKey: string | null
  btcBalance: number
  network: BitcoinNetwork
  error: string | null
  utxos: UTXO[]
  setConnecting: (connecting: boolean) => void
  setConnected: (data: { provider: WalletProvider; address: string; publicKey: string; network: BitcoinNetwork }) => void
  setDisconnected: () => void
  setBalance: (balance: number) => void
  setUtxos: (utxos: UTXO[]) => void
  setError: (error: string | null) => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      connected: false,
      connecting: false,
      provider: null,
      address: null,
      publicKey: null,
      btcBalance: 0,
      network: WALLET_NETWORK,
      error: null,
      utxos: [],
      setConnecting: (connecting) => set({ connecting, error: null }),
      setConnected: ({ provider, address, publicKey, network }) =>
        set((state) => ({
          connected: true,
          connecting: false,
          provider,
          address,
          publicKey,
          network,
          error: null,
          utxos: state.address !== address ? [] : state.utxos,
          btcBalance: state.address !== address ? 0 : state.btcBalance,
        })),
      setDisconnected: () => set({
        connected: false,
        connecting: false,
        provider: null,
        address: null,
        publicKey: null,
        btcBalance: 0,
        utxos: [],
        error: null,
      }),
      setBalance: (balance) => set({ btcBalance: balance }),
      setUtxos: (utxos) => set({ utxos }),
      setError: (error) => set({ error, connecting: false }),
    }),
    { name: 'acme-token-dashboard-wallet' },
  ),
)
