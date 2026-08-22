import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import type { WalletProvider } from '@/types/wallet'

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

export function WalletPicker() {
  const wallet = useWallet()
  const [open, setOpen] = useState(false)

  if (wallet.connected && wallet.address) {
    return (
      <div className="wallet-chip">
        <span>{shortAddress(wallet.address)}</span>
        <button type="button" onClick={() => void wallet.disconnect()}>Disconnect</button>
      </div>
    )
  }

  return (
    <div className="wallet-connect">
      <button type="button" className="win-button" onClick={() => setOpen((value) => !value)}>
        {wallet.connecting ? 'Connecting...' : 'Connect account'}
      </button>
      {open && (
        <div className="wallet-menu">
          {wallet.wallets.map((option) => (
            <button
              key={option.provider}
              type="button"
              disabled={!option.installed || option.comingSoon || !option.bitcoinSupported}
              onClick={() => {
                void wallet.connect(option.provider as WalletProvider).then(() => setOpen(false))
              }}
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
