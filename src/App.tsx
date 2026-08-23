import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WalletPicker } from '@/components/WalletPicker'
import { useWallet } from '@/hooks/useWallet'
import { useAddressMintAllowance } from '@/hooks/useAddressMintAllowance'
import { getAddressBalances } from '@/services/api/addresses'
import { API_BASE_URL } from '@/services/api/client'
import { composeAtomicFill, composeOpenMint } from '@/services/api/compose'
import {
  getAssetBalances,
  getAssetSends,
  getAtomicOrders,
  getDexTokenStats,
  getOrders,
  type AssetBalance,
  type AssetSend,
  type AtomicOrder,
  type OpenOrder,
  type TokenStats,
} from '@/services/api/dex'
import { getRecommendedFees } from '@/services/api/fees'
import { getBitcoinUsdPrice } from '@/services/api/market'
import { getOpenMinters } from '@/services/api/openminters'
import { getStakingPool, getStakingPosition, getStakingRewards, getStakingUnbonds } from '@/services/api/staking'
import {
  formatOpenMinterPaymentAmount,
  formatOpenMinterQuantity,
  getEffectiveMaxMintRaw,
  getOpenMinterPricingInfo,
  getRemainingMintQuantity,
  type OpenMinter,
} from '@/types/openminter'
import {
  formatAcmeQuantity,
  getStakingNetworkConfig,
  STAKING_EPOCH_BLOCKS,
  type StakingPool,
  type StakingPosition,
  type StakingRewards,
  type StakingUnbond,
} from '@/types/staking'

const ASSET = 'ACME'
const SCALE = 100_000_000
const TOTAL_SUPPLY = 1_000_000_000
const MINT_PRICE_SATS = 1
const MIN_MINT_ACME = 330
const MIN_MINT_RAW = MIN_MINT_ACME * SCALE
const MAINNET_URL = 'https://acme.pics/dex/tokens'
const MAINNET_ASSET_COUNT_FALLBACK = 408

const TOKENOMICS = [
  { label: 'Open Mint', percent: 30, summary: 'Public launch', details: 'Mint at 1 sat on a first-come, first-served basis. No VC allocation and no presale.', className: 'alloc-open' },
  { label: 'Staking Rewards', percent: 30, summary: 'Two-year program', details: '18% unlocks in Year 1 and 12% in Year 2. Staking starts when the 30% open mint completes.', className: 'alloc-staking' },
  { label: 'Community Airdrop', percent: 5, summary: 'Early communities', details: 'For long-time participants across the Stamps, Counterparty, and Ordinals communities.', className: 'alloc-airdrop' },
  { label: 'Minting Rewards', percent: 5, summary: 'Activity incentives', details: 'Calculated weekly in proportion to minting fees paid.', className: 'alloc-minting' },
  { label: 'Team Reserve', percent: 15, summary: 'Two-year lock', details: 'The team reserve is locked, staked, and participates in governance.', className: 'alloc-team' },
  { label: 'DAO Reserve', percent: 15, summary: 'Community treasury', details: 'Reserved for governance, protocol development, and long-term ecosystem growth.', className: 'alloc-dao' },
] as const

const ACME_PRODUCTS = [
  { name: 'Mainnet', tag: 'LIVE', description: 'Production Bitcoin rail for ACME objects, transfers, commitments, and open mint activity.', icon: 'MN' },
  { name: 'Testnet', tag: 'LAB', description: 'Sandbox for trial mints, wallet flows, indexer checks, and protocol experiments before release.', icon: 'TN' },
  { name: 'Explorer', tag: 'INDEX', description: 'Search blocks, transactions, assets, holders, provenance, and ACME state from the indexer.', icon: 'EX' },
  { name: 'Dex Marketplace', tag: 'MARKET', description: 'Native listings, fills, offers, floors, and transparent price discovery for ACME assets.', icon: 'DX' },
  { name: 'ArtCore Studio', tag: 'CREATE', description: 'Artist-facing creation tools for profiles, collections, editions, signatures, and runtime work.', icon: 'AS' },
  { name: 'ArtCore Directory', tag: 'BROWSE', description: 'Discovery surface for artists, collections, editions, market pages, and protocol-native culture.', icon: 'AD' },
  { name: 'Cortex Universe', tag: 'GRAPH', description: 'The CORTEX relationship graph for identity, metadata, provenance, taxonomy, and asset context.', icon: 'CU' },
  { name: 'Kek.Works', tag: 'PFP', description: 'PFP launchpad for collectible drops, creator campaigns, and community mint moments.', icon: 'KW' },
] as const

const ROADMAP_ARC = [
  { step: '01', title: 'Mainnet', note: 'Open mint, canonical indexer, and Bitcoin-native ACME state.' },
  { step: '02', title: 'Activate', note: 'Staking begins after 30% public mint; ARTCORE brings creator tools online.' },
  { step: '03', title: 'Expand', note: 'Independent indexers, storage, wallets, galleries, and market builders join.' },
  { step: '04', title: 'DAO', note: 'Open validators and community control over fees, upgrades, reserves, and grants.' },
] as const

const SHAREHOLDER_TIERS = [
  { key: 'basic', name: 'Basic', range: '0 - 50,000', min: 0, max: 50_000, className: 'tier-basic' },
  { key: 'sky', name: 'Sky Blue', range: '50,001 - 250K', min: 50_001, max: 249_999, className: 'tier-sky' },
  { key: 'gold', name: 'Gold Bar', range: '250K - 1M', min: 250_000, max: 999_999, className: 'tier-gold' },
  { key: 'diamond', name: 'Diamond', range: '1M - 10M', min: 1_000_000, max: 9_999_999, className: 'tier-diamond' },
  { key: 'black', name: 'Black Card', range: '10M+', min: 10_000_000, max: Infinity, className: 'tier-black' },
] as const

type ShareholderTier = typeof SHAREHOLDER_TIERS[number]

type MintStatus = 'idle' | 'composing' | 'signing' | 'broadcasting' | 'success' | 'error'
type AppPage = 'home' | 'token' | 'docs'
type TabKey = 'invest' | 'portfolio' | 'programs' | 'reports' | 'manifesto'
type DeskMode = 'mint' | 'stake' | 'dex'

const NAV_ITEMS = [
  ['invest', 'Invest'],
  ['portfolio', 'Portfolio'],
  ['programs', 'Programs'],
  ['reports', 'Reports'],
  ['manifesto', 'Manifesto'],
] as const

const PROTOCOL_STATS = [
  { label: 'Flexible storage methods', value: '4 layers' },
  { label: 'Mainnet allocation mapped', value: '100%' },
  { label: 'Fixed token supply', value: '1B ACME' },
] as const

const DOCUMENTS = [
  {
    key: 'cortex',
    title: 'ACME Cortex User Guide',
    kind: 'Creator guide',
    href: '/Documentation/ACME%20Cortex%20User%20Guide.html',
    summary: 'Relationship graph workflows for tagging, provenance, references, and richer asset context.',
  },
  {
    key: 'atomic',
    title: 'ACME Atomic Swap Guide',
    kind: 'Trading guide',
    href: '/Documentation/ACME%20Atomic%20Swap%20Guide.html',
    summary: 'Practical notes for atomic orders, fills, wallet flow, and deterministic market settlement.',
  },
  {
    key: 'routing',
    title: 'Trustless API Routing + Fees',
    kind: 'Technical paper',
    href: '/Documentation/ACMEProtocol_TrustlessAPIRoutingAndFeeDistributionArchitecture_TechnicalPaper.pdf',
    summary: 'Architecture paper covering API routing, fee distribution, incentives, and verifiable service layers.',
  },
  {
    key: 'runtime',
    title: 'ACME Runtime',
    kind: 'Runtime spec',
    href: '/Documentation/ACME-RUNTIME.pdf',
    summary: 'Reference material for ACME runtime behavior, programmable assets, and creator-facing execution.',
  },
] as const

type DocumentKey = typeof DOCUMENTS[number]['key']

const MAINNET_PREVIEW_ASSETS = [
  { asset: 'INVISIBLE', name: 'Invisible', artist: 'LUAMBRIZ', src: '/assets/mainnet-preview/invisible.jpg', detail: 'Browse asset pages, ownership, art metadata, and provenance from the live mainnet indexer.' },
  { asset: 'ECHOES', name: 'Echoes', artist: 'MEGANO', src: '/assets/mainnet-preview/echoes.jpg', detail: 'Mainnet assets render directly from ACME media endpoints with verifiable asset records.' },
  { asset: 'FAMILYHOUR', name: 'Family Hour', artist: 'MATURATED', src: '/assets/mainnet-preview/familyhour.gif', detail: 'Collections and animated works can be explored, traded, and referenced across the protocol.' },
  { asset: 'SURREAL', name: 'Surreal', artist: 'HNFTPEPE', src: '/assets/mainnet-preview/surreal.png', detail: 'Permanent Bitcoin-native art surfaces through the same asset pipeline used by the mainnet app.' },
] as const

const ART_BY_SOCKS_ASSET = '/assets/mainnet-preview/artbysocks.gif'

const PROTOCOL_PILLARS = [
  ['01', 'Permanent UTXO Storage', "Data can be embedded directly in Bitcoin's core UTXO set, replicated by full nodes instead of depending on fragile external services."],
  ['02', 'Merkle-Proof Verification', 'Anyone can verify asset state through Merkle proofs anchored to Bitcoin consensus. ACME is built around verifiable state, not indexer trust.'],
  ['03', 'Mineable Fee Pools', 'A UTXO-based fee pool rewards correct indexer submissions, turning honest indexing into a permissionless and economically aligned activity.'],
  ['04', 'Artist-First Simplicity', 'Clean creator tools sit on top of protocol depth: DEX markets, auctions, generative tooling, curation, royalties, and permanent assets.'],
] as const

const PROTOCOL_FEATURES = [
  ['Flexible Storage', 'Choose UTXO, Witness, OP_RETURN, or Arweave storage per asset and per use case.'],
  ['Generative Studio', 'Create generative and recursive on-chain art with the art and its engine living together.'],
  ['Native DEX + Marketplace', 'On-chain orders, dispensers, auctions, bids, and offers with deterministic settlement.'],
  ['ACME Cortex + Tagging', 'AI-assisted asset relationships, tags, curation, provenance, and discoverability without centralized metadata.'],
  ['DAO Governance', 'A path to community control over fees, royalties, upgrades, reserve usage, and ecosystem priorities.'],
  ['Staking & BTC Rewards', 'Protocol fee sharing and staking are mapped into the long-term holder program.'],
  ['Upgradable Architecture', 'A modular design intended to adapt as Bitcoin opcodes and app surfaces evolve.'],
  ['Fair Launch Access', 'The open mint puts launch access in the community’s hands, with explicit allocations for staking, DAO, team, and activity rewards.'],
] as const

const PROTOCOL_MARKETS = [
  ['Counterparty (XCP)', '~$345M market cap', '~$500M+ peak'],
  ['Ordinals / BRC-20', '~$224M market cap', '~$1.5-6B peak'],
  ['Runes', '~$172M market cap', '~$2B+ peak'],
  ['STAMPS / SRC-20', '~$50M market cap', '~$150-300M peak'],
  ['ACME Protocol', '~$650K FDV on launch', '1 ACME = 1 sat'],
] as const

const PROTOCOL_TEAM = [
  ['@btc_socks', 'Co-founder', 'Bitcoin maximalist and ACME co-founder focused on decentralized Bitcoin-native tooling for artists and creators.', '/acme-protocol/team/socks.jpg', 'https://x.com/btc_socks'],
  ['@hnftpepe', 'Co-founder', 'Digital artist and ACME co-founder specializing in on-chain creativity, vector art, and permissionless Bitcoin NFT markets.', '/acme-protocol/team/hnftpepe.jpg', 'https://x.com/HnftPepe'],
  ['@lentymor', 'Co-founder', 'Digital art alchemist and on-chain artist pushing experimental Bitcoin art and fully on-chain creative work.', '/acme-protocol/team/mortylen.jpg', 'https://x.com/lentymor'],
  ['@0xDerpNation', 'Tech Devs', 'Bitcoin protocol developer and Stampverse contributor focused on Stamps, recursive protocols, OLGA encoding, and on-chain innovation.', '/acme-protocol/team/derp.jpg', 'https://x.com/0xDerpNation'],
  ['@paperbuddha', 'Ambassador', 'Contemporary Buddhist artist blending Thangka influence, vintage pulp, validator culture, and AI building.', '/acme-protocol/team/paperbuddha.jpg', 'https://x.com/paperbuddha'],
  ['@kanemayfield', 'Ambassador', 'Writer, cultural curator, meme merchant, and Bitcoin art personality bringing irreverent energy to the ecosystem.', '/acme-protocol/team/kane.jpg', 'https://x.com/KaneMayfield'],
  ['@desultor', 'Ambassador', 'Crunchy dystopian Bitcoin artist with bold, gritty, post-apocalyptic on-chain work and long NFT history.', '/acme-protocol/team/desultor.jpg', 'https://x.com/desultor'],
] as const

interface AcmeContext {
  wallet: ReturnType<typeof useWallet>
  stats: TokenStats | undefined
  minter: OpenMinter | null
  supplyWhole: number | undefined
  capWhole: number | null
  remainingRaw: number
  progress: number
  walletAcmeRaw: number
  walletAcmeWhole: number
  bitcoinUsd: number | null
  stakingConfig: ReturnType<typeof getStakingNetworkConfig>
  stakingPool: StakingPool | null
  stakingPosition: StakingPosition | null
  stakingRewards: StakingRewards | null
  stakingUnbonds: StakingUnbond[]
  stakingLoading: boolean
  holders: AssetBalance[]
  sends: AssetSend[]
  listings: AtomicOrder[]
  marketplaceOrders: OpenOrder[]
  reportLoading: boolean
  marketplaceLoading: boolean
  pricing: ReturnType<typeof getOpenMinterPricingInfo> | null
  quantity: string
  setQuantity: (value: string) => void
  feeRate: number
  setFeeRate: (value: number) => void
  mintStatus: MintStatus
  mintMessage: string | null
  txid: string | null
  maxRaw: number
  overMax: boolean
  cost: number
  canMint: boolean | null
  allowanceState: ReturnType<typeof useAddressMintAllowance>
  handleMint: () => Promise<void>
}

function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

function qtyRawFromInput(value: string): number {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? Math.floor(quantity * SCALE) : 0
}

function formatMintInputRaw(quantity: number): string {
  const value = quantity / SCALE
  return Number.isInteger(value) ? String(value) : value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
}

function getShareholderTier(balance: number): ShareholderTier {
  return SHAREHOLDER_TIERS.find((tier) => balance >= tier.min && balance <= tier.max) ?? SHAREHOLDER_TIERS[0]
}

function formatSats(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  return value >= SCALE ? `${formatNumber(value / SCALE, 8)} BTC` : `${formatNumber(value)} sats`
}

function formatUsd(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
  })
}

function shortAddress(address: string | null | undefined): string {
  if (!address) return '--'
  return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return '--'
  return hash.length > 14 ? `${hash.slice(0, 6)}...${hash.slice(-6)}` : hash
}

function formatAcmeRaw(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined) return '--'
  return `${formatNumber(quantity / SCALE, 8)} ACME`
}

function formatTokenPercent(quantity: number, supplyRaw: number | null | undefined): string {
  if (!supplyRaw || supplyRaw <= 0) return '--'
  return `${formatNumber((quantity / supplyRaw) * 100, 4)}%`
}

function formatUnitPrice(order: AtomicOrder): string {
  const quantityWhole = order.quantity / SCALE
  if (quantityWhole <= 0) return '--'
  return formatSats(order.btc_price / quantityWhole)
}

function formatBlocksUntil(expireIndex: number, currentBlock: number | null | undefined): string {
  if (!currentBlock) return formatNumber(expireIndex)
  const remaining = expireIndex - currentBlock
  if (remaining <= 0) return 'expired'
  return `${formatNumber(remaining)} blocks`
}

function isDivisibleOrderAsset(value: boolean | 0 | 1 | undefined): boolean {
  return value === true || value === 1
}

function formatOrderAssetQuantity(quantity: number, divisible: boolean | 0 | 1 | undefined): string {
  return isDivisibleOrderAsset(divisible) ? formatNumber(quantity / SCALE, 8) : formatNumber(quantity)
}

function getMarketplaceAsset(order: OpenOrder): string {
  return order.give_asset === ASSET ? order.get_asset : order.give_asset
}

function getMarketplaceAssetQuantity(order: OpenOrder): string {
  return order.give_asset === ASSET
    ? formatOrderAssetQuantity(order.get_quantity, order.get_asset_divisible)
    : formatOrderAssetQuantity(order.give_quantity, order.give_asset_divisible)
}

function getMarketplaceAcmeQuantity(order: OpenOrder): string {
  return order.give_asset === ASSET
    ? formatAcmeRaw(order.give_quantity)
    : formatAcmeRaw(order.get_quantity)
}

function getOrderSiteUrl(order: OpenOrder): string {
  return `https://acme.pics/orders?status=open&asset=${encodeURIComponent(getMarketplaceAsset(order))}`
}

function getAssetThumbnailUrl(asset: string): string {
  return `${API_BASE_URL}/assets/${encodeURIComponent(asset)}/thumbnail`
}

function getAcmeOrderSiteUrl(order: AtomicOrder): string {
  return `https://acme.pics/asset/${ASSET}?order=${encodeURIComponent(order.tx_hash)}`
}

function StatPanel({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <section className="panel stat-panel">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-help">{help}</div>
    </section>
  )
}

function WindowPanel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [closed, setClosed] = useState(false)

  if (closed) return null

  return (
    <section className={`window ${collapsed ? 'is-collapsed' : ''} ${className}`}>
      <header className="window-title">
        <span>{title}</span>
        <span className="window-controls">
          <button
            type="button"
            className="window-control window-minimize"
            aria-label={collapsed ? `Restore ${title}` : `Minimize ${title}`}
            title={collapsed ? 'Restore' : 'Minimize'}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span aria-hidden="true">-</span>
          </button>
          <button
            type="button"
            className="window-control window-close"
            aria-label={`Close ${title}`}
            title="Close"
            onClick={() => setClosed(true)}
          >
            <span aria-hidden="true">x</span>
          </button>
        </span>
      </header>
      {!collapsed && <div className="window-body">{children}</div>}
    </section>
  )
}

function MintDesk({ ctx }: { ctx: AcmeContext }) {
  const { wallet, minter, quantity, setQuantity, feeRate, setFeeRate, cost, allowanceState, overMax, maxRaw, mintStatus, mintMessage, txid, canMint, handleMint } = ctx
  const [deskMode, setDeskMode] = useState<DeskMode>('mint')
  const maxMintQuantity = formatMintInputRaw(minter?.max_mint_per_tx ?? 0)

  if (!minter) {
    return <p className="muted">No active ACME token minter is available right now.</p>
  }

  return (
    <div className="mint-form shareholder-desk">
      <div className="mode-tabs">
        <button type="button" className={deskMode === 'mint' ? 'active' : ''} onClick={() => setDeskMode('mint')}>Mint ACME<br /><strong>Instant</strong></button>
        <button type="button" className={deskMode === 'stake' ? 'active' : ''} onClick={() => setDeskMode('stake')}>Stake<br /><strong>Token</strong></button>
        <button type="button" className={deskMode === 'dex' ? 'active' : ''} onClick={() => setDeskMode('dex')}>Trade<br /><strong>Open DEX</strong></button>
      </div>

      {deskMode === 'mint' && (
        <>
          <label>
            Amount
            <input
              type="number"
              min={MIN_MINT_ACME}
              step="1"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ''))}
            />
          </label>
          <div className="mint-readout">
            <span>Wallet</span>
            <strong>{wallet.connected ? shortAddress(wallet.address) : 'Not connected'}</strong>
          </div>
          <div className="you-receive">
            <span>YOU RECEIVE</span>
            <strong>{formatNumber(Number(quantity) || 0, 8)} ACME</strong>
          </div>
          {quantity && qtyRawFromInput(quantity) > 0 && qtyRawFromInput(quantity) < MIN_MINT_RAW && (
            <p className="danger">Minimum mint amount is {formatNumber(MIN_MINT_ACME)} ACME.</p>
          )}
          <label>
            Fee rate
            <input type="number" min="0.01" step="0.01" value={feeRate} onChange={(event) => setFeeRate(Number(event.target.value))} />
          </label>
          <div className="mint-readout">
            <span>Estimated payment</span>
            <strong>{formatOpenMinterPaymentAmount(cost, minter.price_asset_name || minter.price_asset || 'BTC')}</strong>
          </div>
          <div className="mint-readout">
            <span>Wallet allowance</span>
            <strong>{allowanceState.isCapped ? `${formatOpenMinterQuantity(allowanceState.allowance.remainingRaw, true)} left` : 'Uncapped'}</strong>
          </div>
          {overMax && <p className="danger">Max mintable now is {formatOpenMinterQuantity(maxRaw, true)} ACME.</p>}
          {allowanceState.blockedReason && <p className="danger">{allowanceState.blockedReason}</p>}
          {!wallet.connected && <p className="muted">Connect account to activate mint controls.</p>}
          <div className="mint-action-row">
            <button type="button" className="mint-button mint-submit" disabled={!canMint} onClick={() => void handleMint()}>
              {mintStatus === 'composing' ? 'Composing...' : mintStatus === 'signing' ? 'Awaiting signature...' : mintStatus === 'broadcasting' ? 'Broadcasting...' : 'Mint ACME'}
            </button>
            <button type="button" className="mint-max-button" onClick={() => setQuantity(maxMintQuantity)} aria-label={`Set amount to max ${formatOpenMinterQuantity(minter.max_mint_per_tx, true)} ACME`}>
              Max
            </button>
          </div>
          {mintMessage && <p className={mintStatus === 'error' ? 'danger' : 'success'}>{mintMessage}</p>}
          {txid && <a className="tx-link" href={`https://mempool.space/tx/${txid}`} target="_blank" rel="noreferrer">View transaction</a>}
        </>
      )}

      {deskMode === 'stake' && <StakeTokenPanel ctx={ctx} />}
      {deskMode === 'dex' && <DexListingsDesk ctx={ctx} />}
    </div>
  )
}

function StakeTokenPanel({ ctx }: { ctx: AcmeContext }) {
  const activeStake = ctx.stakingPosition?.active_quantity ?? 0
  const claimableReward = ctx.stakingRewards?.projected_claimable_reward ?? ctx.stakingPosition?.pending_reward ?? 0
  const enabled = ctx.stakingConfig.enabled
  const [stakeAmount, setStakeAmount] = useState('')
  const maxStakeAmount = formatNumber(ctx.walletAcmeWhole, 8)

  return (
    <div className="stake-token-panel">
      <label>
        Amount
        <div className="stake-input-row">
          <input
            inputMode="decimal"
            placeholder="0.00000000"
            value={stakeAmount}
            onChange={(event) => setStakeAmount(event.target.value.replace(/[^\d.]/g, ''))}
          />
          <button type="button" disabled>ACME</button>
        </div>
      </label>
      <div className="stake-balance">Balance: {formatNumber(ctx.walletAcmeWhole, 8)} ACME</div>
      <div className="stake-earn">
        <span>YOU EARN</span>
        <strong>+0.00 ACME / day</strong>
      </div>
      <div className="stake-actions">
        <button type="button" onClick={() => setStakeAmount(maxStakeAmount)} disabled={ctx.walletAcmeWhole <= 0}>Max</button>
        <button type="button" disabled>Stake ACME</button>
      </div>
      <p className="stake-note">
        {enabled ? 'Staking transactions are staged for protocol activation.' : `Staking is not enabled for ${ctx.stakingConfig.label}.`} Amount entry is available for planning; Stake ACME remains disabled until launch.
      </p>
      <details className="stake-details">
        <summary>How the rate is set, and why it can fall</summary>
        <table>
          <tbody>
            <tr><td>Active stake</td><td>{formatAcmeQuantity(activeStake)} ACME</td></tr>
            <tr><td>Claimable reward</td><td>{formatAcmeQuantity(claimableReward)} ACME</td></tr>
            <tr><td>Pool status</td><td>{ctx.stakingLoading ? 'Loading' : ctx.stakingPool ? 'Online' : 'Unavailable'}</td></tr>
          </tbody>
        </table>
      </details>
    </div>
  )
}

function DexListingsDesk({ ctx }: { ctx: AcmeContext }) {
  const openListings = ctx.listings.filter((order) => order.status === 'open')
  const [selectedOrder, setSelectedOrder] = useState<AtomicOrder | null>(null)

  return (
    <div className="desk-listings">
      <table>
        <thead><tr><th>Unit price</th><th>Amount</th><th>Total</th><th>Seller</th><th>Expires</th><th /></tr></thead>
        <tbody>
          {openListings.length > 0 ? openListings.map((order) => (
            <tr key={order.tx_hash}>
              <td>{formatUnitPrice(order)}</td>
              <td>{formatAcmeRaw(order.quantity)}</td>
              <td>{formatSats(order.btc_price)}</td>
              <td className="mono">{shortAddress(order.source)}</td>
              <td>{formatBlocksUntil(order.expire_index, ctx.stats?.as_of_block)}</td>
              <td><button type="button" onClick={() => setSelectedOrder(order)}>Buy</button></td>
            </tr>
          )) : (
            <tr><td colSpan={6}>{ctx.reportLoading ? 'Loading listings...' : 'No open ACME listings found.'}</td></tr>
          )}
        </tbody>
      </table>
      {selectedOrder && <DexBuyModal ctx={ctx} order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}

function DexBuyModal({ ctx, order, onClose }: { ctx: AcmeContext; order: AtomicOrder; onClose: () => void }) {
  const [status, setStatus] = useState<MintStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [txid, setTxid] = useState<string | null>(null)
  const busy = status === 'composing' || status === 'signing' || status === 'broadcasting'
  const canBuy = ctx.wallet.connected && !busy

  async function handleBuy() {
    if (!ctx.wallet.connected || !ctx.wallet.address) {
      setStatus('error')
      setMessage('Connect a wallet before buying this ACME listing.')
      return
    }

    setStatus('composing')
    setMessage(null)
    setTxid(null)

    try {
      const utxos = await ctx.wallet.getUtxos()
      const psbt = (await composeAtomicFill({
        order_tx_hash: order.tx_hash,
        buyer_address: ctx.wallet.address,
        build_transaction: true,
        fee_rate: ctx.feeRate,
        utxos: utxos.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          script_pubkey: utxo.scriptPubKey,
        })),
      })).result?.transaction?.psbt

      if (!psbt) throw new Error('The compose API did not return a PSBT.')
      setStatus('signing')
      const signed = await ctx.wallet.signPsbt(psbt, { autoFinalized: true })
      setStatus('broadcasting')
      const broadcastTxid = await ctx.wallet.pushPsbt(signed)
      setTxid(broadcastTxid)
      setStatus('success')
      setMessage('ACME purchase broadcast.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Buy failed.')
    }
  }

  return (
    <div className="buy-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="buy-modal" role="dialog" aria-modal="true" aria-label="Buy ACME listing">
        <header>
          <div>
            <span>Buy ACME</span>
            <strong>{formatAcmeRaw(order.quantity)}</strong>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close buy dialog">x</button>
        </header>
        <div className="buy-modal-body">
          <table>
            <tbody>
              <tr><td>Unit price</td><td>{formatUnitPrice(order)}</td></tr>
              <tr><td>Total</td><td>{formatSats(order.btc_price)}</td></tr>
              <tr><td>Seller</td><td className="mono">{shortAddress(order.source)}</td></tr>
              <tr><td>Expires</td><td>{formatBlocksUntil(order.expire_index, ctx.stats?.as_of_block)}</td></tr>
            </tbody>
          </table>
          {!ctx.wallet.connected && <p className="danger">Connect a wallet before buying this listing.</p>}
          {message && <p className={status === 'error' ? 'danger' : 'success'}>{message}</p>}
          {txid && <a className="tx-link" href={`https://mempool.space/tx/${txid}`} target="_blank" rel="noreferrer">View transaction</a>}
          <div className="buy-modal-actions">
            <a href={getAcmeOrderSiteUrl(order)} target="_blank" rel="noreferrer">Open order</a>
            <button type="button" onClick={() => void handleBuy()} disabled={!canBuy}>
              {status === 'composing' ? 'Composing...' : status === 'signing' ? 'Awaiting signature...' : status === 'broadcasting' ? 'Broadcasting...' : 'Sign & Buy'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

async function getMainnetAssetCount(): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/assets?limit=1`)
  if (!response.ok) throw new Error('Failed to load mainnet asset count')
  const data = await response.json() as { result_count?: number }
  if (typeof data.result_count !== 'number') throw new Error('Mainnet asset count unavailable')
  return data.result_count
}

function HomePage({ ctx, onOpenTokenDashboard, onOpenMintDashboard }: { ctx: AcmeContext; onOpenTokenDashboard: () => void; onOpenMintDashboard: () => void }) {
  const mainnetAssetsQuery = useQuery({
    queryKey: ['mainnet-asset-count'],
    queryFn: getMainnetAssetCount,
    staleTime: 60_000,
  })
  const protocolStats = [
    { label: 'Assets on mainnet', value: formatNumber(mainnetAssetsQuery.data ?? MAINNET_ASSET_COUNT_FALLBACK) },
    ...PROTOCOL_STATS,
  ]

  return (
    <div className="home-page">
      <section className="protocol-hero">
        <img src="/acme-protocol/landing-hero.webp" alt="" />
        <div className="protocol-hero-copy">
          <span>Bitcoin-Native Meta Protocol</span>
          <h2>Assets that live forever on Bitcoin.</h2>
          <p>ACME — Assets Coded on the Monetary Engine — solves fragmentation, verifiability, and permanence for digital assets on Bitcoin. Built for artists and developers who refuse to compromise.</p>
          <div className="protocol-actions">
            <a href={MAINNET_URL} target="_blank" rel="noreferrer">Launch Mainnet App</a>
            <button type="button" onClick={onOpenTokenDashboard}>Open Token Dashboard</button>
          </div>
        </div>
      </section>

      <div className="protocol-proof">
        {['UniSat Wallet', 'Xverse', 'Bitcoin L1', 'UTXO Set', 'Arweave', 'Witness Data', 'OP_RETURN'].map((item) => (
          <span key={item}><i />{item}</span>
        ))}
      </div>

      <div className="hero-metrics protocol-stats">
        {protocolStats.map((stat) => (
          <StatPanel key={stat.label} label={stat.label} value={stat.value} help={stat.label === 'Assets on mainnet' ? 'live mainnet asset count from the ACME API' : 'from ACMEProtocol project overview'} />
        ))}
      </div>

      <WindowPanel title="ACME PROTOCOL -- BITCOIN ASSETS DONE RIGHT">
        <div className="protocol-intro">
          <div>
            <h3>Four things no other Bitcoin protocol does together.</h3>
            <p>ACME combines permanent storage, trustless proofs, incentivized indexing, and artist-grade tooling in a single system.</p>
          </div>
          <img src={ART_BY_SOCKS_ASSET} alt="" />
        </div>
        <div className="protocol-grid">
          {PROTOCOL_PILLARS.map(([step, title, detail]) => (
            <article key={title} className="protocol-card">
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </WindowPanel>

      <WindowPanel title="FEATURES & ADVANTAGES">
        <div className="protocol-feature-layout">
          <div>
            <h3>Everything you need. Nothing you do not.</h3>
            <p>Every feature is aimed at a real pain point in existing Bitcoin asset protocols: persistence, verification, liquidity, creation, and governance.</p>
          </div>
          <div className="protocol-feature-grid">
            {PROTOCOL_FEATURES.map(([title, detail]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </WindowPanel>

      <WindowPanel title="LIVE MAINNET PREVIEW">
        <div className="protocol-preview">
          {MAINNET_PREVIEW_ASSETS.map(({ asset, name, artist, src, detail }) => (
            <article key={asset}>
              <img src={src} alt="" />
              <div>
                <h3>{asset} <span>by {artist}</span></h3>
                <strong>{name}</strong>
                <p>{detail}</p>
              </div>
            </article>
          ))}
        </div>
      </WindowPanel>

      <WindowPanel title="MARKET OPPORTUNITY">
        <div className="protocol-market">
          <div className="protocol-market-list">
            {PROTOCOL_MARKETS.map(([name, cap, peak]) => (
              <article key={name} className={name === 'ACME Protocol' ? 'is-acme' : ''}>
                <div>
                  <strong>{name}</strong>
                  <span>{cap}</span>
                </div>
                <em>{peak}</em>
              </article>
            ))}
          </div>
          <div className="protocol-mainnet-card">
            <span>Mainnet Launch</span>
            <strong>Open Mint</strong>
            <p>Fair launch. No VC allocation and no presale. Thirty percent of supply is available through open public minting.</p>
            <button type="button" onClick={onOpenMintDashboard}>Mint ACME</button>
          </div>
        </div>
      </WindowPanel>

      <TokenomicsPanel ctx={ctx} />

      <WindowPanel title="TEAM & AMBASSADORS">
        <div className="protocol-team">
          {PROTOCOL_TEAM.map(([name, role, detail, image, href]) => (
            <a key={name} href={href} target="_blank" rel="noreferrer">
              <img src={image} alt="" />
              <strong>{name}</strong>
              <span>{role}</span>
              <p>{detail}</p>
            </a>
          ))}
        </div>
      </WindowPanel>

      <WindowPanel title="MAINNET IS OPEN NOW">
        <div className="protocol-cta">
          <div>
            <h3>Mint, trade, and build with permanent, verifiable Bitcoin assets.</h3>
            <p>The live ACME mainnet app is the production surface for token markets, asset exploration, minting, and creator workflows.</p>
          </div>
          <div className="protocol-actions">
            <a href={MAINNET_URL} target="_blank" rel="noreferrer">Launch Mainnet App</a>
            <a href="https://acme.pics/faq" target="_blank" rel="noreferrer">Mainnet FAQ</a>
          </div>
        </div>
      </WindowPanel>
    </div>
  )
}

function DocumentationPage() {
  const [activeDocKey, setActiveDocKey] = useState<DocumentKey>('cortex')
  const activeDoc = DOCUMENTS.find((doc) => doc.key === activeDocKey) ?? DOCUMENTS[0]

  return (
    <div className="documentation-page">
      <WindowPanel title="DOCUMENTATION -- ACME PROTOCOL LIBRARY">
        <div className="documentation-hero">
          <span>Reference Shelf</span>
          <h2>Protocol docs for builders, artists, traders, and indexers.</h2>
          <p>Read the current ACME references inside the dashboard: Cortex usage, atomic swaps, runtime behavior, and the routing architecture that connects fees back to protocol services.</p>
        </div>
      </WindowPanel>

      <nav className="tabs documentation-tabs" aria-label="Documentation tabs">
        {DOCUMENTS.map((doc) => (
          <button
            key={doc.key}
            type="button"
            className={activeDoc.key === doc.key ? 'active' : ''}
            onClick={() => setActiveDocKey(doc.key)}
          >
            {doc.title}
          </button>
        ))}
      </nav>

      <WindowPanel title={`DOCUMENT -- ${activeDoc.title.toUpperCase()}`}>
        <div className="documentation-reader">
          <div className="documentation-reader-summary">
            <span>{activeDoc.kind}</span>
            <strong>{activeDoc.title}</strong>
            <p>{activeDoc.summary}</p>
          </div>
          <iframe
            key={activeDoc.href}
            src={activeDoc.href}
            title={activeDoc.title}
            className="documentation-frame"
          />
        </div>
      </WindowPanel>

    </div>
  )
}

function TokenLockedPage() {
  return (
    <div className="token-locked-page">
      <WindowPanel title="WALLET REQUIRED">
        <div className="token-locked-placeholder">
          <span>Connect Wallet</span>
          <h2>Connect your wallet to access the token dashboard.</h2>
          <p>The Token Dashboard reads your ACME balance, shareholder card tier, portfolio, mint allowance, staking status, and wallet-specific activity after you connect.</p>
        </div>
      </WindowPanel>
    </div>
  )
}

function InvestPage({ ctx }: { ctx: AcmeContext }) {
  return (
    <>
      <div className="hero-metrics">
        <StatPanel label="ACME PRICE" value={ctx.pricing?.pricingRatio ?? '--'} help={ctx.pricing?.pricePerToken ?? 'active openminter pricing'} />
        <StatPanel label="MINT CAPACITY" value={`${formatOpenMinterQuantity(ctx.remainingRaw, true)} ACME`} help="unissued supply available through the openminter" />
        <StatPanel label="NEXT CHECK" value={`${formatNumber(ctx.stats?.as_of_block)} blk`} help="live indexer block for this terminal" />
      </div>

      <WindowPanel title="SHAREHOLDER DESK -- MINT ACME">
        <MintDesk ctx={ctx} />
      </WindowPanel>

      <div className="portfolio-strip">
        <div><span>HELD</span><strong>{formatNumber(ctx.walletAcmeWhole, 8)} ACME</strong><small>connected wallet balance</small></div>
        <div><span>MINTABLE NOW</span><strong>{ctx.minter ? formatOpenMinterQuantity(ctx.maxRaw, true) : '--'} ACME</strong><small>per tx, supply and wallet cap aware</small></div>
        <div><span>MARKET FLOOR</span><strong>{formatSats(ctx.stats?.floor_price_sats)}</strong><small>lowest DEX listing</small></div>
      </div>

      <WindowPanel title="ACME PRODUCTS">
        <div className="product-suite">
          {ACME_PRODUCTS.map((product) => (
            <article key={product.name}>
              <span className="product-icon">{product.icon}</span>
              <div>
                <h3>{product.name}</h3>
                <strong>{product.tag}</strong>
              </div>
              <p>{product.description}</p>
            </article>
          ))}
        </div>
      </WindowPanel>

      <WindowPanel title="ALL METRICS">
        <div className="split-list">
          <Metric label="Supply" value={`${formatNumber(ctx.supplyWhole, 8)} ACME`} note="Indexed circulating ACME supply." />
          <Metric label="Backing idea" value="Bitcoin-native protocol token" note="ACME transactions, DEX activity, token mints, and on-chain art all settle through the same Bitcoin-backed rail." />
          <Metric label="Mint status" value={ctx.minter ? 'Open' : 'Closed'} note="This dashboard uses the active divisible openminter when one is indexed." />
          <Metric label="Holders" value={formatNumber(ctx.stats?.holder_count)} note="Unique indexed ACME holders." />
          <Metric label="Listings" value={formatNumber(ctx.stats?.open_listings_count)} note="Open market listings for ACME." />
          <Metric label="24h volume" value={formatSats(ctx.stats?.volume_24h_sats)} note={`${formatNumber(ctx.stats?.fills_24h_count)} fills in the last day.`} />
        </div>
      </WindowPanel>
    </>
  )
}

function PortfolioPage({ ctx }: { ctx: AcmeContext }) {
  const share = ctx.supplyWhole && ctx.walletAcmeWhole ? (ctx.walletAcmeWhole / ctx.supplyWhole) * 100 : 0
  return (
    <>
      <div className="portfolio-strip">
        <div><span>ACME HELD</span><strong>{formatNumber(ctx.walletAcmeWhole, 8)} ACME</strong><small>{ctx.wallet.connected ? shortAddress(ctx.wallet.address) : 'connect wallet to read balances'}</small></div>
        <div><span>BTC BALANCE</span><strong>{formatNumber(ctx.wallet.balance / SCALE, 8)} BTC</strong><small>reported by wallet provider</small></div>
        <div><span>SUPPLY SHARE</span><strong>{formatNumber(share, 8)}%</strong><small>held ACME divided by indexed supply</small></div>
      </div>

      <WindowPanel title="MANAGE POSITION">
        <div className="hero-metrics">
          <StatPanel label="TOKEN BALANCE" value={`${formatNumber(ctx.walletAcmeWhole, 8)} ACME`} help="from /addresses/:address/balances" />
          <StatPanel label="LAST PRICE" value={formatSats(ctx.stats?.last_price_sats)} help="latest indexed fill price" />
          <StatPanel label="FLOOR VALUE" value={ctx.stats?.floor_price_sats ? formatSats(Math.floor(ctx.walletAcmeWhole * ctx.stats.floor_price_sats)) : '--'} help="rough mark using current floor" />
        </div>
        <div className="portfolio-notes">
          <p>ACME is the account’s working token for the ACME ecosystem. This Portfolio page is now focused on custody, balances, staking readiness, and position tracking. Minting remains available from the Invest desk.</p>
          <table>
            <tbody>
              <tr><td>Owner</td><td className="mono">{ctx.stats?.owner ?? '--'}</td></tr>
              <tr><td>Circulating supply</td><td>{formatNumber(ctx.supplyWhole, 8)} / {formatNumber(TOTAL_SUPPLY)} ACME</td></tr>
              <tr><td>Deploy block</td><td>{formatNumber(ctx.stats?.deploy_block)}</td></tr>
            </tbody>
          </table>
        </div>
      </WindowPanel>

      <StakingDesk ctx={ctx} />

      <WindowPanel title="DISTRIBUTION CALCULATOR -- ACME SCENARIOS">
        <table>
          <thead><tr><th>Scenario</th><th>ACME owned</th><th>Value at floor</th></tr></thead>
          <tbody>
            {[100, 1_000, 10_000, 100_000].map((amount) => (
              <tr key={amount}>
                <td>{formatNumber(amount)} ACME</td>
                <td>{formatNumber(amount, 8)} ACME</td>
                <td>{ctx.stats?.floor_price_sats ? formatSats(amount * ctx.stats.floor_price_sats) : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </WindowPanel>
    </>
  )
}

function StakingDesk({ ctx }: { ctx: AcmeContext }) {
  const activeStake = ctx.stakingPosition?.active_quantity ?? 0
  const claimableReward = ctx.stakingRewards?.projected_claimable_reward ?? ctx.stakingPosition?.pending_reward ?? 0
  const poolStake = ctx.stakingPool?.total_active_stake ?? 0
  const reserveRemaining = ctx.stakingPool?.reserve_remaining ?? 0
  const currentEpoch = ctx.stakingPool?.current_epoch ?? null
  const enabled = ctx.stakingConfig.enabled
  const [stakeAmount, setStakeAmount] = useState('')
  const maxStakeAmount = formatNumber(ctx.walletAcmeWhole, 8)

  return (
    <>
      <WindowPanel title="STAKING -- DISABLED PROTOCOL FEATURE">
        <div className="staking-banner">
          <strong>{enabled ? 'Staking network enabled' : `Staking is not enabled for ${ctx.stakingConfig.label}.`}</strong>
          <span>
            ACME staking is designed around 144-block epochs and a two-year rewards allocation. Mainnet controls are shown here for readiness, but actions remain locked while the protocol feature is disabled.
          </span>
        </div>
        <div className="hero-metrics">
          <StatPanel label="POOL" value={ctx.stakingLoading ? 'Loading' : ctx.stakingPool ? 'Online' : 'Unavailable'} help="staking pool endpoint status" />
          <StatPanel label="ACTIVE STAKE" value={`${formatAcmeQuantity(poolStake, { compact: true })} ACME`} help="total pool stake, if available" />
          <StatPanel label="EPOCH" value={currentEpoch === null ? '--' : formatNumber(currentEpoch)} help={`${STAKING_EPOCH_BLOCKS} blocks per staking epoch`} />
        </div>
        <div className="dual-forms">
          <fieldset>
            <legend>Stake ACME</legend>
            <label>
              Amount
              <input
                inputMode="decimal"
                placeholder="0.00000000"
                value={stakeAmount}
                onChange={(event) => setStakeAmount(event.target.value.replace(/[^\d.]/g, ''))}
              />
            </label>
            <p className="muted">Liquid ACME available: {formatNumber(ctx.walletAcmeWhole, 8)} ACME</p>
            <div className="staking-actions">
              <button type="button" onClick={() => setStakeAmount(maxStakeAmount)} disabled={ctx.walletAcmeWhole <= 0}>Max</button>
              <button disabled>Stake ACME</button>
            </div>
            <p className="muted">Stake ACME remains disabled until staking launches.</p>
          </fieldset>
          <fieldset>
            <legend>Unstake / Claim</legend>
            <table>
              <tbody>
                <tr><td>Active stake</td><td>{formatAcmeQuantity(activeStake)} ACME</td></tr>
                <tr><td>Claimable reward</td><td>{formatAcmeQuantity(claimableReward)} ACME</td></tr>
                <tr><td>Reserve remaining</td><td>{formatAcmeQuantity(reserveRemaining)} ACME</td></tr>
              </tbody>
            </table>
            <div className="staking-actions">
              <button disabled>Unstake</button>
              <button disabled>Claim</button>
            </div>
          </fieldset>
        </div>
      </WindowPanel>

      <WindowPanel title="UNBONDING QUEUE -- WALLET">
        <table>
          <thead><tr><th>Unbond</th><th>Quantity</th><th>Credit block</th><th>Status</th></tr></thead>
          <tbody>
            {ctx.stakingUnbonds.length > 0 ? ctx.stakingUnbonds.map((unbond) => (
              <tr key={unbond.unbond_id}>
                <td className="mono">{unbond.unbond_id}</td>
                <td>{formatAcmeQuantity(unbond.quantity)} ACME</td>
                <td>{formatNumber(unbond.credit_block)}</td>
                <td>{unbond.status}</td>
              </tr>
            )) : (
              <tr><td colSpan={4}>No unbonding entries for this wallet.</td></tr>
            )}
          </tbody>
        </table>
      </WindowPanel>
    </>
  )
}

function ProgramsPage({ ctx }: { ctx: AcmeContext }) {
  const activeTier = getShareholderTier(ctx.walletAcmeWhole)
  const [selectedTierKey, setSelectedTierKey] = useState<ShareholderTier['key']>(activeTier.key)
  const selectedTier = SHAREHOLDER_TIERS.find((tier) => tier.key === selectedTierKey) ?? activeTier
  const activeTierIndex = SHAREHOLDER_TIERS.findIndex((tier) => tier.key === activeTier.key)
  const previewIsCurrent = selectedTier.key === activeTier.key

  useEffect(() => {
    setSelectedTierKey(activeTier.key)
  }, [ctx.wallet.address, activeTier.key])

  const programs = [
    ['Kek.Works', 'Generative PFP collections', 'A launch studio for creating generative PFP collections on ACME, from trait assembly through mint-ready collection drops.'],
    ['Artcore Directory Studio', 'Generative ACME art', 'A creation environment for generative ACME art, giving artists a structured path to publish coded collections and on-chain editions.'],
    ['Staking', 'Token staking', 'A planned ACME staking program for long-term holders, designed to activate after protocol staking is available.'],
    ['Governance', 'Future protocol governance', 'A later-stage governance layer for ACME holders to help steer protocol parameters, program priorities, and treasury-directed decisions.'],
    ['Protocol Fee Sharing', 'Protocol revenue sharing', 'A fee-sharing program intended to route ACME-generated protocol fees back into the holder ecosystem once revenue distribution is enabled.'],
  ]

  return (
    <>
      <WindowPanel title="YOUR PLAY -- ALL ACME PROGRAMS">
        <div className="program-summary">
          <StatPanel label="LIFETIME VOLUME" value={formatSats(ctx.stats?.volume_24h_sats)} help="live 24h proxy until account history is connected" />
          <StatPanel label="TOKEN RESULT" value={`${formatNumber(ctx.walletAcmeWhole, 8)} ACME`} help="current connected wallet balance" />
          <StatPanel label="PROGRAMS MAPPED" value="5" help="creator tools, staking, governance, and fee sharing" />
          <StatPanel label="REPORT BLOCK" value={formatNumber(ctx.stats?.as_of_block)} help="current indexer checkpoint" />
        </div>
      </WindowPanel>

      <WindowPanel title="SHAREHOLDER CARD">
        <div className="shareholder-card">
          <div className="card-display">
            <div className={`card-art ${selectedTier.className}`}>
              <span>ACME CAPITAL</span>
              <strong>{selectedTier.name}</strong>
              <em>{previewIsCurrent && ctx.wallet.connected ? `${activeTier.range} ACME holder tier` : `${selectedTier.range} ACME preview`}</em>
              <dl>
                <div><dt>HOLDINGS</dt><dd>{formatNumber(ctx.walletAcmeWhole, 4)} ACME</dd></div>
                <div><dt>STATUS</dt><dd>{previewIsCurrent && ctx.wallet.connected ? activeTier.name : 'Mint ACME'}</dd></div>
                <div><dt>PROGRAMS</dt><dd>5</dd></div>
              </dl>
              <small>{shortAddress(ctx.wallet.address)}</small>
              <span className="card-logo">ACME</span>
            </div>
            <div className="card-tier-strip" aria-label="Shareholder card tiers">
              {SHAREHOLDER_TIERS.map((tier, index) => {
                const isCurrent = tier.key === activeTier.key
                const isSelected = tier.key === selectedTier.key
                const isLockedPreview = index > activeTierIndex

                return (
                  <div key={tier.key} className={`tier-choice ${isCurrent ? 'current' : ''}`}>
                    <button
                      type="button"
                      className={`tier-thumb ${tier.className} ${isSelected ? 'selected' : ''} ${isCurrent ? 'active' : ''} ${isLockedPreview ? 'future-tier' : ''}`}
                      aria-pressed={isSelected}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => setSelectedTierKey(tier.key)}
                    >
                      <span>{tier.name}</span>
                    </button>
                    <span className="tier-current-indicator" aria-hidden={!isCurrent}>
                      {isCurrent ? 'Current' : '\u00a0'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="program-list">
            {programs.map(([name, kind, detail]) => (
              <article key={name}>
                <h3>{name}</h3>
                <strong>{kind}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </WindowPanel>

      <WindowPanel title="NFT MARKETPLACE">
        <NftMarketplaceSection ctx={ctx} />
      </WindowPanel>
    </>
  )
}

function NftMarketplaceSection({ ctx }: { ctx: AcmeContext }) {
  const rows = ctx.marketplaceOrders.filter((order) => order.give_asset === ASSET || order.get_asset === ASSET)
  const total = rows.length

  return (
    <div className="nft-marketplace">
      <div className="marketplace-count">{formatNumber(total)} ACME-involved open orders</div>
      <div className="marketplace-grid">
        {rows.length > 0 ? rows.map((order) => {
          const asset = getMarketplaceAsset(order)
          const action = order.give_asset === ASSET ? 'Offer' : 'Ask'

          return (
            <a
              key={order.tx_hash}
              className="marketplace-card"
              href={getOrderSiteUrl(order)}
              target="_blank"
              rel="noreferrer"
            >
              <div className="marketplace-art">
                <img
                  src={getAssetThumbnailUrl(asset)}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
                <i>{action}</i>
                <em>OPEN</em>
              </div>
              <div className="marketplace-card-body">
                <h3>{asset}</h3>
                <div>
                  <span>{action === 'Ask' ? 'For' : 'Pays'}</span>
                  <strong>{getMarketplaceAcmeQuantity(order)}</strong>
                </div>
                <div>
                  <span>Qty</span>
                  <strong>{getMarketplaceAssetQuantity(order)}</strong>
                </div>
              </div>
            </a>
          )
        }) : (
          <p className="marketplace-empty">{ctx.marketplaceLoading ? 'Loading open orders...' : 'No open NFT orders found.'}</p>
        )}
      </div>
      <div className="marketplace-footer">
        <span>Showing {formatNumber(rows.length)} / {formatNumber(total)} orders</span>
        <a href="https://acme.pics/orders" target="_blank" rel="noreferrer">All orders</a>
      </div>
    </div>
  )
}

function ReportsPage({ ctx }: { ctx: AcmeContext }) {
  const circulatingValueSats = ctx.supplyWhole === undefined ? null : ctx.supplyWhole * MINT_PRICE_SATS
  const fdvSats = TOTAL_SUPPLY * MINT_PRICE_SATS
  const circulatingValueUsd = circulatingValueSats === null || ctx.bitcoinUsd === null
    ? null
    : (circulatingValueSats / SCALE) * ctx.bitcoinUsd
  const fdvUsd = ctx.bitcoinUsd === null ? null : (fdvSats / SCALE) * ctx.bitcoinUsd

  return (
    <>
      <WindowPanel title="REPORTS -- THE TWO FIGURES">
        <div className="two-figures">
          <StatPanel label="CIRCULATING SUPPLY" value={`${formatNumber(ctx.supplyWhole, 8)} ACME`} help="indexed supply currently moving in wallets and orders" />
          <StatPanel label="MINTABLE REMAINDER" value={`${formatOpenMinterQuantity(ctx.remainingRaw, true)} ACME`} help="unissued capacity remaining in the active openminter" />
        </div>
      </WindowPanel>

      <WindowPanel title="KEY METRICS">
        <div className="metrics-grid">
          <StatPanel label="CIRC VALUE" value={formatSats(circulatingValueSats)} help="issued ACME estimated at the 1 sat mint value" />
          <StatPanel label="CIRC VALUE USD" value={formatUsd(circulatingValueUsd)} help="circulating estimate converted with live BTC/USD" />
          <StatPanel label="FLOOR" value={formatSats(ctx.stats?.floor_price_sats)} help="lowest open listing per whole ACME" />
          <StatPanel label="BTC/USD" value={formatUsd(ctx.bitcoinUsd, 0)} help="CoinGecko reference price for USD estimates" />
          <StatPanel label="FDV" value={formatSats(fdvSats)} help="1B ACME estimated at the 1 sat mint value" />
          <StatPanel label="FDV USD" value={formatUsd(fdvUsd)} help="1B ACME x 1 sat mint value x BTC/USD" />
          <StatPanel label="24H VOLUME" value={formatSats(ctx.stats?.volume_24h_sats)} help={`${formatNumber(ctx.stats?.fills_24h_count)} fills in the last day`} />
          <StatPanel label="HOLDERS" value={formatNumber(ctx.stats?.holder_count)} help="unique indexed token holders" />
          <StatPanel label="HARD CAP" value={ctx.capWhole ? `${formatNumber(ctx.capWhole, 8)} ACME` : '--'} help="maximum distributable mint supply" />
          <StatPanel label="MAX PER TX" value={ctx.minter ? `${formatOpenMinterQuantity(ctx.minter.max_mint_per_tx, true)} ACME` : '--'} help="largest quantity the minter allows per transaction" />
          <StatPanel label="PRICE" value={ctx.pricing?.pricingRatio ?? '--'} help={ctx.pricing?.pricePerToken ?? 'openminter unavailable'} />
          <StatPanel label="AS OF BLOCK" value={formatNumber(ctx.stats?.as_of_block)} help="indexer block for this report" />
        </div>
      </WindowPanel>

      <div className="columns">
        <WindowPanel title="RESERVE PORTFOLIO -- TOKENOMICS" className="wide">
          <div className="progress-track"><span style={{ width: `${ctx.progress}%` }} /></div>
          <table>
            <tbody>
              <tr><td>Asset</td><td>{ctx.stats?.asset_longname || ASSET}</td><td>100.0%</td></tr>
              <tr><td>Supply issued</td><td>{formatNumber(ctx.supplyWhole, 8)} ACME</td><td>{formatNumber(ctx.progress, 2)}%</td></tr>
              <tr><td>Mint capacity left</td><td>{formatOpenMinterQuantity(ctx.remainingRaw, true)} ACME</td><td>{formatNumber(100 - ctx.progress, 2)}%</td></tr>
              <tr><td>Open listings</td><td>{formatNumber(ctx.stats?.open_listings_count)}</td><td>DEX</td></tr>
              <tr><td>Owner</td><td className="mono">{ctx.stats?.owner ?? '--'}</td><td>{ctx.stats?.locked ? 'Locked' : 'Unlocked'}</td></tr>
            </tbody>
          </table>
        </WindowPanel>

        <WindowPanel title="CAPITALIZATION">
          <table>
            <tbody>
              <tr><td>Shares outstanding</td><td>{formatNumber(ctx.supplyWhole, 8)} ACME</td></tr>
              <tr><td>Hard cap</td><td>{ctx.capWhole ? `${formatNumber(ctx.capWhole, 8)} ACME` : '--'}</td></tr>
              <tr><td>Minimum mint price</td><td>{ctx.pricing?.pricingRatio ?? '--'}</td></tr>
              <tr><td>Floor listing</td><td>{formatSats(ctx.stats?.floor_price_sats)}</td></tr>
            </tbody>
          </table>
        </WindowPanel>
      </div>

      <WindowPanel title="ACME INFORMATION -- FAQ SYNTHESIS">
        <div className="info-grid">
          <p>ACME is the native asset powering the Art Coded on the Monetary Engine ecosystem: token mints, DEX markets, on-chain art, profiles, and protocol activity all settle through the same Bitcoin-backed transaction flow.</p>
          <p>The dashboard tracks ACME tokenomics live from the indexer: circulating supply, holders, listings, 24h trading, mint cap, per-transaction limits, and openminter pricing.</p>
          <p>Minting uses the same Sock2 wallet flow: compose an openmint PSBT, sign in the connected wallet, then broadcast through the wallet provider.</p>
        </div>
      </WindowPanel>

      <ReportHistorySection ctx={ctx} />
      <ReportHolderSection ctx={ctx} />
      <ReportListingSection ctx={ctx} />
    </>
  )
}

function ReportHistorySection({ ctx }: { ctx: AcmeContext }) {
  const rows = ctx.sends.slice(0, 8)
  return (
    <WindowPanel title="HISTORY -- RECENT ACME TRANSFERS">
      <p className="report-note">Pulled from the ACME token detail history feed for recent valid sends.</p>
      <div className="report-table">
        <table>
          <thead><tr><th>Block</th><th>From</th><th>To</th><th>Amount</th><th>Tx</th></tr></thead>
          <tbody>
            {rows.length > 0 ? rows.map((send) => (
              <tr key={`${send.tx_hash}-${send.tx_index}`}>
                <td>{formatNumber(send.block_index)}</td>
                <td className="mono">{shortAddress(send.source)}</td>
                <td className="mono">{shortAddress(send.destination)}</td>
                <td>{formatAcmeRaw(send.quantity)}</td>
                <td className="mono">{shortHash(send.tx_hash)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}>{ctx.reportLoading ? 'Loading history...' : 'No recent transfer history found.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </WindowPanel>
  )
}

function ReportHolderSection({ ctx }: { ctx: AcmeContext }) {
  const rows = [...ctx.holders].sort((a, b) => b.quantity - a.quantity).slice(0, 12)
  return (
    <WindowPanel title="HOLDER -- TOP ACME BALANCES">
      <div className="holder-summary">
        <StatPanel label="INDEXED HOLDERS" value={formatNumber(ctx.stats?.holder_count)} help="reported by token stats" />
      </div>
      <div className="report-table">
        <table>
          <thead><tr><th>#</th><th>Address</th><th>Balance</th><th>Supply</th><th>Last Block</th></tr></thead>
          <tbody>
            {rows.length > 0 ? rows.map((holder, index) => (
              <tr key={holder.address}>
                <td>{index + 1}</td>
                <td className="mono">{shortAddress(holder.address)}</td>
                <td>{formatAcmeRaw(holder.quantity)}</td>
                <td>{formatTokenPercent(holder.quantity, ctx.stats?.supply)}</td>
                <td>{formatNumber(holder.block_index)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}>{ctx.reportLoading ? 'Loading holders...' : 'No holders found.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </WindowPanel>
  )
}

function ReportListingSection({ ctx }: { ctx: AcmeContext }) {
  const openListings = ctx.listings.filter((order) => order.status === 'open').slice(0, 8)

  return (
    <WindowPanel title="LISTING -- ACME DEX MARKET">
      <div className="listing-grid listing-grid-single">
        <section>
          <h3>Open Listings</h3>
          <table>
            <thead><tr><th>Unit</th><th>Amount</th><th>Total</th><th>Seller</th><th>Expires</th></tr></thead>
            <tbody>
              {openListings.length > 0 ? openListings.map((order) => (
                <tr key={order.tx_hash}>
                  <td>{formatUnitPrice(order)}</td>
                  <td>{formatAcmeRaw(order.quantity)}</td>
                  <td>{formatSats(order.btc_price)}</td>
                  <td className="mono">{shortAddress(order.source)}</td>
                  <td>{formatBlocksUntil(order.expire_index, ctx.stats?.as_of_block)}</td>
                </tr>
              )) : (
                <tr><td colSpan={5}>{ctx.reportLoading ? 'Loading listings...' : 'No open listings found.'}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </WindowPanel>
  )
}

function ManifestoPage({ ctx }: { ctx: AcmeContext }) {
  return (
    <>
      <WindowPanel title="THE MANIFESTO -- STATEMENT OF DIRECTION">
        <div className="manifesto-copy">
          <h2>We are building the art currency of Bitcoin-native software.</h2>
          <p>ACME is not a static ticker page. It is the connective tissue for a protocol where art, token mints, market orders, profiles, and programmable assets all share one transaction language.</p>
          <p>The mint is the front door. The dashboard reports the truth: supply, holders, listings, limits, and fees from the same indexer that the wider ACME webapp uses. The wallet keeps custody; the app prepares the message; Bitcoin carries it.</p>
          <p>The objective is plain: make ACME legible enough for a first mint, dense enough for repeat use, and durable enough to feel like a public terminal rather than a campaign page.</p>
        </div>
      </WindowPanel>

      <WindowPanel title="THE FLYWHEEL -- HOW ACME COMPOUNDS">
        <div className="flywheel flywheel-console">
          <div className="flywheel-console-core">
            <span>ACME</span>
            <strong>UTILITY RAIL</strong>
          </div>
          {[
            ['01', 'Protocol Fees', 'Usage produces settlement flow.'],
            ['02', 'Market Access', 'Orders create visible demand.'],
            ['03', 'Creator Tools', 'Artists bring new assets online.'],
            ['04', 'Governance', 'Holders steer protocol priorities.'],
            ['05', 'Staking', 'Participation secures the loop once live.'],
          ].map(([step, title, note]) => (
            <article className="fly-step" key={title}>
              <strong>{step}</strong>
              <span>{title}</span>
              <small>{note}</small>
            </article>
          ))}
        </div>
        <p>ACME is meant to sit under the product surface, not beside it. The token can route protocol fees, secure staking once enabled, express governance, unlock creator tools, and give holders direct access to market functions across the ACME app. Utility is the loop: useful software creates token demand, token participation strengthens the network, and the network gives creators and traders better rails.</p>
      </WindowPanel>

      <TokenomicsPanel ctx={ctx} />

      <WindowPanel title="THE PRODUCT SUITE -- UTILITY IN SERVICE OF ACME">
        <div className="product-suite manifesto-products">
          {ACME_PRODUCTS.map((product) => (
            <article key={product.name}>
              <span className="product-icon">{product.icon}</span>
              <div>
                <h3>{product.name}</h3>
                <strong>{product.tag}</strong>
              </div>
              <p>{product.description}</p>
            </article>
          ))}
        </div>
        <div className="memo manifesto-note">
          Current report: {formatNumber(ctx.supplyWhole, 8)} ACME issued, {formatNumber(ctx.stats?.holder_count)} holders, {formatNumber(ctx.stats?.open_listings_count)} open listings.
        </div>
      </WindowPanel>

      <WindowPanel title="ROADMAP -- MAINNET TO DAO CONTROL">
        <RoadmapSection />
      </WindowPanel>
    </>
  )
}

function RoadmapSection() {
  return (
    <div className="roadmap-section">
      <div className="roadmap-lede">
        <span>04 / ROADMAP</span>
        <div>
          <h2>Build, open, hand off.</h2>
          <p>The first arc is intentionally simple: launch the protocol, activate participation, broaden the operator set, then move control to the community.</p>
        </div>
      </div>

      <div className="roadmap-arc">
        {ROADMAP_ARC.map((item) => (
          <article key={item.step}>
            <span>{item.step}</span>
            <h3>{item.title}</h3>
            <p>{item.note}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function TokenomicsPanel({ ctx }: { ctx: AcmeContext }) {
  const mintedPublicPercent = ctx.supplyWhole ? Math.min(30, (ctx.supplyWhole / TOTAL_SUPPLY) * 100) : 0

  return (
    <WindowPanel title="ACME TOKENOMICS -- FIXED ALLOCATION">
      <div className="tokenomics-intro">
        <div>
          <span>ALLOCATION</span>
          <strong>100%</strong>
          <small>accounted for</small>
        </div>
        <p>ACME uses a fixed 1,000,000,000 token allocation. Thirty percent is reserved for open public minting at 1 sat, thirty percent funds the two-year staking rewards program, and the remaining forty percent is split across community, minting, team, and DAO reserves with explicit percentages.</p>
      </div>
      <div className="allocation-bar" role="img" aria-label="ACME supply allocation">
        {TOKENOMICS.map((slice) => (
          <span key={slice.label} className={slice.className} style={{ width: `${slice.percent}%` }}>
            {slice.percent >= 15 ? `${slice.percent}%` : ''}
          </span>
        ))}
      </div>
      <div className="allocation-legend">
        {TOKENOMICS.map((slice) => (
          <span key={slice.label}><i className={slice.className} />{slice.label}</span>
        ))}
      </div>
      <table className="tokenomics-table">
        <tbody>
          {TOKENOMICS.map((slice) => (
            <tr key={slice.label}>
              <td><strong>{slice.label}</strong><small>{slice.summary}</small></td>
              <td>{slice.details}</td>
              <td>{slice.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tokenomics-footer">
        <div><strong>{formatNumber(TOTAL_SUPPLY)} ACME</strong><span>Fixed allocation map</span></div>
        <div><strong>1 sat</strong><span>Open mint price</span></div>
        <div><strong>30%</strong><span>Public open mint</span></div>
        <div><strong>30%</strong><span>Staking reward reserve</span></div>
        <div><strong>2 years</strong><span>Team reserve lock</span></div>
        <div><strong>{STAKING_EPOCH_BLOCKS} blocks</strong><span>Staking epoch</span></div>
        <div><strong>{formatNumber(mintedPublicPercent, 2)}%</strong><span>Public mint progress toward 30%</span></div>
        <div><strong>{ctx.capWhole ? formatNumber(ctx.capWhole, 0) : '--'} ACME</strong><span>Indexed mint cap</span></div>
      </div>
    </WindowPanel>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  )
}

export default function App() {
  const wallet = useWallet()
  const stakingConfig = getStakingNetworkConfig()
  const [activeAppPage, setActiveAppPage] = useState<AppPage>('home')
  const [activeTab, setActiveTab] = useState<TabKey>('invest')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [quantity, setQuantity] = useState(String(MIN_MINT_ACME))
  const [feeRate, setFeeRate] = useState(5)
  const [mintStatus, setMintStatus] = useState<MintStatus>('idle')
  const [mintMessage, setMintMessage] = useState<string | null>(null)
  const [txid, setTxid] = useState<string | null>(null)

  const statsQuery = useQuery({
    queryKey: ['token-stats', ASSET],
    queryFn: () => getDexTokenStats(ASSET),
    refetchInterval: 15_000,
  })

  const minterQuery = useQuery({
    queryKey: ['openminter', ASSET],
    queryFn: () => getOpenMinters({ limit: 500 }),
    refetchInterval: 15_000,
  })

  const balancesQuery = useQuery({
    queryKey: ['address-balances', wallet.address],
    queryFn: () => getAddressBalances(wallet.address!, { limit: 500 }),
    enabled: Boolean(wallet.address),
    refetchInterval: 30_000,
  })

  const holdersQuery = useQuery({
    queryKey: ['asset-balances', ASSET],
    queryFn: () => getAssetBalances(ASSET, { limit: 500 }),
    refetchInterval: 60_000,
  })

  const sendsQuery = useQuery({
    queryKey: ['asset-sends', ASSET],
    queryFn: () => getAssetSends(ASSET, { limit: 50 }),
    refetchInterval: 30_000,
  })

  const listingsQuery = useQuery({
    queryKey: ['atomic-orders', ASSET, 'open'],
    queryFn: () => getAtomicOrders({ asset: ASSET, order_type: 'sell', status: 'open', limit: 100 }),
    refetchInterval: 20_000,
  })

  const marketplaceOrdersQuery = useQuery({
    queryKey: ['orders', 'open'],
    queryFn: () => getOrders({ status: 'open', limit: 100 }),
    refetchInterval: 20_000,
  })

  const stakingPoolQuery = useQuery({
    queryKey: ['staking', 'pool'],
    queryFn: async () => (await getStakingPool()).result,
    refetchInterval: 30_000,
    enabled: stakingConfig.enabled,
    retry: false,
  })

  const stakingPositionQuery = useQuery({
    queryKey: ['staking', 'position', wallet.address],
    queryFn: async () => (await getStakingPosition(wallet.address!)).result,
    enabled: stakingConfig.enabled && Boolean(wallet.address),
    refetchInterval: 30_000,
    retry: false,
  })

  const stakingRewardsQuery = useQuery({
    queryKey: ['staking', 'rewards', wallet.address],
    queryFn: async () => (await getStakingRewards(wallet.address!)).result,
    enabled: stakingConfig.enabled && Boolean(wallet.address),
    refetchInterval: 30_000,
    retry: false,
  })

  const stakingUnbondsQuery = useQuery({
    queryKey: ['staking', 'unbonds', wallet.address],
    queryFn: async () => (await getStakingUnbonds(wallet.address!, { limit: 100, offset: 0 })).result,
    enabled: stakingConfig.enabled && Boolean(wallet.address),
    refetchInterval: 30_000,
    retry: false,
  })

  const feesQuery = useQuery({
    queryKey: ['fees'],
    queryFn: getRecommendedFees,
    refetchInterval: 60_000,
  })

  const bitcoinUsdQuery = useQuery({
    queryKey: ['bitcoin-usd'],
    queryFn: getBitcoinUsdPrice,
    refetchInterval: 60_000,
    retry: 2,
  })

  useEffect(() => {
    if (feesQuery.data?.halfHourFee) setFeeRate(feesQuery.data.halfHourFee)
  }, [feesQuery.data?.halfHourFee])

  const stats = statsQuery.data?.result
  const minter = useMemo<OpenMinter | null>(() => {
    return (minterQuery.data?.result ?? []).find(
      (item) => item.asset === ASSET && item.status === 'open' && item.divisible,
    ) ?? null
  }, [minterQuery.data])
  const allowanceState = useAddressMintAllowance(minter, wallet.address)
  const walletAcmeRaw = useMemo(() => {
    return (balancesQuery.data?.result ?? []).find((balance) => balance.asset === ASSET)?.quantity ?? 0
  }, [balancesQuery.data])

  const supplyWhole = stats?.divisible ? (stats.supply / SCALE) : stats?.supply
  const walletAcmeWhole = walletAcmeRaw / SCALE
  const capWhole = minter ? minter.hard_cap / SCALE : null
  const remainingRaw = minter ? Math.max(0, getRemainingMintQuantity(minter)) : 0
  const progress = minter && minter.hard_cap > 0
    ? Math.min(100, ((minter.earned_quantity + (minter.premint_quantity || 0)) / minter.hard_cap) * 100)
    : 0
  const pricing = minter ? getOpenMinterPricingInfo(minter) : null
  const qtyHuman = Number(quantity)
  const qtyRaw = qtyRawFromInput(quantity)
  const maxRaw = minter ? getEffectiveMaxMintRaw(minter, allowanceState.allowance.remainingRaw) : 0
  const overMax = qtyRaw > maxRaw
  const underMin = qtyRaw > 0 && qtyRaw < MIN_MINT_RAW
  const cost = minter && qtyRaw > 0
    ? Math.ceil(qtyHuman / (minter.quantity_by_price / SCALE)) * minter.price
    : 0
  const canMint = wallet.connected && minter && qtyRaw >= MIN_MINT_RAW && !overMax && !allowanceState.isBlocked && mintStatus !== 'composing' && mintStatus !== 'signing' && mintStatus !== 'broadcasting'

  const handleMint = async () => {
    if (!wallet.address || !minter) return
    setMintMessage(null)
    setTxid(null)
    setMintStatus('composing')
    try {
      if (underMin) throw new Error(`Minimum mint amount is ${formatNumber(MIN_MINT_ACME)} ACME.`)
      if (overMax) throw new Error('Quantity is above the mintable maximum.')
      const utxos = await wallet.getUtxos()
      if (utxos.length === 0) throw new Error('No UTXOs available in the connected wallet.')
      const result = await composeOpenMint({
        source: wallet.address,
        asset: ASSET,
        openminter_tx_hash: minter.tx_hash,
        quantity: qtyRaw,
        build_transaction: true,
        utxos: utxos.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          script_pubkey: utxo.scriptPubKey,
        })),
        fee_rate: feeRate,
      })
      const psbt = result.result?.transaction?.psbt
      if (!psbt) throw new Error('The compose API did not return a PSBT.')
      setMintStatus('signing')
      const signed = await wallet.signPsbt(psbt, { autoFinalized: true })
      setMintStatus('broadcasting')
      const broadcastTxid = await wallet.pushPsbt(signed)
      allowanceState.recordPendingMint(qtyRaw)
      allowanceState.refetch()
      void statsQuery.refetch()
      void minterQuery.refetch()
      void balancesQuery.refetch()
      setTxid(broadcastTxid)
      setMintStatus('success')
      setMintMessage(`${formatNumber(qtyHuman, 8)} ACME mint broadcast.`)
    } catch (error) {
      setMintStatus('error')
      setMintMessage(error instanceof Error ? error.message : 'Mint failed.')
    }
  }

  const ctx: AcmeContext = {
    wallet,
    stats,
    minter,
    supplyWhole,
    capWhole,
    remainingRaw,
    progress,
    walletAcmeRaw,
    walletAcmeWhole,
    bitcoinUsd: bitcoinUsdQuery.data?.usd ?? null,
    stakingConfig,
    stakingPool: stakingPoolQuery.data ?? null,
    stakingPosition: stakingPositionQuery.data ?? null,
    stakingRewards: stakingRewardsQuery.data ?? null,
    stakingUnbonds: stakingUnbondsQuery.data ?? [],
    stakingLoading: stakingPoolQuery.isLoading || stakingPositionQuery.isLoading || stakingRewardsQuery.isLoading || stakingUnbondsQuery.isLoading,
    holders: holdersQuery.data?.result ?? [],
    sends: sendsQuery.data?.result ?? [],
    listings: listingsQuery.data?.result ?? [],
    marketplaceOrders: marketplaceOrdersQuery.data?.result ?? [],
    reportLoading: holdersQuery.isLoading || sendsQuery.isLoading || listingsQuery.isLoading,
    marketplaceLoading: marketplaceOrdersQuery.isLoading,
    pricing,
    quantity,
    setQuantity,
    feeRate,
    setFeeRate,
    mintStatus,
    mintMessage,
    txid,
    maxRaw,
    overMax,
    cost,
    canMint,
    allowanceState,
    handleMint,
  }

  const tokenPages: Record<TabKey, ReactNode> = {
    invest: <InvestPage ctx={ctx} />,
    portfolio: <PortfolioPage ctx={ctx} />,
    programs: <ProgramsPage ctx={ctx} />,
    reports: <ReportsPage ctx={ctx} />,
    manifesto: <ManifestoPage ctx={ctx} />,
  }

  return (
    <div className="app-shell">
      <div className="side-column">
        <aside className="side-nav" aria-label="ACME navigation">
          <div className="side-brand">
            <span>ACME</span>
            <strong>Protocol</strong>
          </div>
          <button type="button" className={activeAppPage === 'home' ? 'active' : ''} onClick={() => setActiveAppPage('home')}>
            Home
          </button>
          <button type="button" className={activeAppPage === 'token' ? 'active' : ''} onClick={() => setActiveAppPage('token')}>
            Token Dashboard
          </button>
          <button type="button" className={activeAppPage === 'docs' ? 'active' : ''} onClick={() => setActiveAppPage('docs')}>
            Documentation
          </button>
        </aside>

        <div className="side-wallet" aria-label="Wallet connection">
          <span>Wallet</span>
          <WalletPicker />
        </div>
      </div>

      <main className="dashboard">
        <div className="ticker">ACME IS LIVE · ART CODED ON THE MONETARY ENGINE · TOKEN MINT TERMINAL</div>
        <header className="masthead">
          <div>
            <h1>{activeAppPage === 'home' ? 'ACME Protocol' : activeAppPage === 'docs' ? 'Documentation' : 'ACME Token Dashboard'}</h1>
            <p>{activeAppPage === 'home' ? 'Assets Coded on the Monetary Engine · Bitcoin-native protocol overview' : activeAppPage === 'docs' ? 'Protocol references, creator guides, runtime docs, and market notes' : `Shareholder services terminal · live ACME mint and tokenomics pages · asset ${ASSET}`}</p>
          </div>
        </header>

        {activeAppPage === 'token' && wallet.connected && (
          <>
            <nav className="tabs">
              {NAV_ITEMS.map(([key, label]) => (
                <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>
                  {label}
                </button>
              ))}
            </nav>

            <nav className="mobile-nav" aria-label="Mobile page navigation">
              <button
                type="button"
                className="mobile-menu-toggle"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-page-menu"
                onClick={() => setMobileMenuOpen((value) => !value)}
              >
                <span className="menu-bars" aria-hidden="true"><i /><i /><i /></span>
                <strong>{NAV_ITEMS.find(([key]) => key === activeTab)?.[1]}</strong>
              </button>
              <div id="mobile-page-menu" className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
                {NAV_ITEMS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={activeTab === key ? 'active' : ''}
                    onClick={() => {
                      setActiveTab(key)
                      setMobileMenuOpen(false)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </nav>
          </>
        )}

        {activeAppPage === 'home' && (
          <HomePage ctx={ctx} onOpenTokenDashboard={() => setActiveAppPage('token')} onOpenMintDashboard={() => {
            setActiveAppPage('token')
            setActiveTab('invest')
          }} />
        )}
        {activeAppPage === 'docs' && <DocumentationPage />}
        {activeAppPage === 'token' && (wallet.connected ? tokenPages[activeTab] : <TokenLockedPage />)}

        <footer className="terminal-footer">
          <span><i /> CONNECTED</span>
          <span>LIVE FEED</span>
          <a href="https://acme.pics/" target="_blank" rel="noreferrer">BITCOIN · ACME</a>
          <span>BLOCK {formatNumber(stats?.as_of_block)}</span>
        </footer>
      </main>
    </div>
  )
}
