export interface BitcoinUsdPrice {
  usd: number
}

export async function getBitcoinUsdPrice(): Promise<BitcoinUsdPrice> {
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
  if (!response.ok) throw new Error(`Bitcoin price request failed: ${response.status}`)

  const data = await response.json() as { bitcoin?: { usd?: number } }
  const usd = data.bitcoin?.usd
  if (typeof usd !== 'number' || !Number.isFinite(usd)) {
    throw new Error('Bitcoin price response did not include a USD price.')
  }

  return { usd }
}
