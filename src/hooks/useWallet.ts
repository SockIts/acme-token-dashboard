import { useCallback, useEffect, useMemo, useState } from 'react'
import { getWalletConnector, SUPPORTED_WALLETS, type WalletInfo } from '@/services/wallet'
import { useWalletStore } from '@/stores/walletStore'
import type { SignPsbtOptions, UTXO, WalletProvider } from '@/types/wallet'

export function useWallet() {
  const store = useWalletStore()
  const connector = useMemo(() => getWalletConnector(), [])
  const [walletsTick, setWalletsTick] = useState(0)

  const wallets = useMemo<WalletInfo[]>(() => {
    if (typeof window === 'undefined') return SUPPORTED_WALLETS
    return connector.detectInstalledWallets()
  }, [connector, walletsTick])

  useEffect(() => {
    let count = 0
    const id = window.setInterval(() => {
      count += 1
      setWalletsTick((tick) => tick + 1)
      if (count >= 12) window.clearInterval(id)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    connector.onAccountChange = (address: string) => {
      if (!store.provider) return
      store.setConnected({ provider: store.provider, address, publicKey: store.publicKey || '', network: store.network })
      connector.getBalance().then(store.setBalance).catch(() => {})
    }
    return () => { connector.onAccountChange = undefined }
  }, [connector, store])

  useEffect(() => {
    const provider = store.provider
    if (!provider || store.connected || store.connecting) return
    connector.tryReconnect(provider).then((result) => {
      if (!result) return
      store.setConnected({ provider, address: result.address, publicKey: result.publicKey, network: result.network })
      connector.getBalance().then(store.setBalance).catch(() => {})
    }).catch(() => {})
  }, [])

  const connect = useCallback(async (provider: WalletProvider) => {
    store.setConnecting(true)
    try {
      const result = await connector.connect(provider)
      store.setConnected({ provider, address: result.address, publicKey: result.publicKey, network: result.network })
      connector.getBalance().then(store.setBalance).catch(() => store.setBalance(0))
    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Failed to connect wallet')
      throw error
    }
  }, [connector, store])

  const disconnect = useCallback(async () => {
    await connector.disconnect()
    store.setDisconnected()
  }, [connector, store])

  const getUtxos = useCallback(async (): Promise<UTXO[]> => {
    if (!store.connected) throw new Error('Wallet not connected')
    const utxos = await connector.getUtxos()
    store.setUtxos(utxos)
    return utxos
  }, [connector, store])

  const signPsbt = useCallback((psbt: string, options?: SignPsbtOptions) => connector.signPsbt(psbt, options), [connector])
  const pushPsbt = useCallback((psbt: string) => connector.pushPsbt(psbt), [connector])

  return {
    connected: store.connected,
    connecting: store.connecting,
    address: store.address,
    provider: store.provider,
    balance: store.btcBalance,
    error: store.error,
    wallets,
    installedWallets: wallets.filter((wallet) => wallet.installed),
    connect,
    disconnect,
    getUtxos,
    signPsbt,
    pushPsbt,
  }
}
