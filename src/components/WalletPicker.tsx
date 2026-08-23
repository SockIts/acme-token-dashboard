import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import type { WalletProvider } from '@/types/wallet'

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

type WalletPickerProps = {
  label?: string
  menuId?: string
}

export function WalletPicker({ label = 'Connect account', menuId = 'wallet-provider-menu' }: WalletPickerProps) {
  const wallet = useWallet()
  const [open, setOpen] = useState(false)

  async function handleConnect(provider: WalletProvider) {
    try {
      await wallet.connect(provider)
      setOpen(false)
    } catch {
      setOpen(true)
    }
  }

  if (wallet.connected && wallet.address) {
    const addressLabel = shortAddress(wallet.address)

    return (
      <div className="wallet-connect">
        <button
          type="button"
          className="win-button wallet-disconnect-button"
          aria-label={`Disconnect wallet ${addressLabel}`}
          title="Disconnect wallet"
          onClick={() => void wallet.disconnect()}
        >
          <span className="wallet-address-label">{addressLabel}</span>
          <span className="wallet-disconnect-label" aria-hidden="true">Disconnect</span>
        </button>
      </div>
    )
  }

  return (
    <div className="wallet-connect">
      <button
        type="button"
        className="win-button"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={wallet.connecting}
        onClick={() => setOpen((value) => !value)}
      >
        {wallet.connecting ? 'Connecting...' : label}
      </button>
      {open && (
        <div id={menuId} className="wallet-menu">
          {wallet.wallets.map((option) => (
            <button
              key={option.provider}
              type="button"
              disabled={wallet.connecting || !option.installed || option.comingSoon || !option.bitcoinSupported}
              onClick={() => void handleConnect(option.provider as WalletProvider)}
            >
              <span className="wallet-icon" aria-hidden="true">
                <img src={option.icon} alt="" />
              </span>
              <strong>{option.name}</strong>
              <small>{option.installed ? option.description : 'Not installed'}</small>
            </button>
          ))}
          {wallet.error && <p className="wallet-error">{wallet.error}</p>}
        </div>
      )}
    </div>
  )
}
