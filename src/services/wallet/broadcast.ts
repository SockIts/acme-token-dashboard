import { adminApiClient } from '@/services/api/client'

interface BroadcastResponse {
  txid?: string
}

interface BroadcastEnvelope {
  data?: BroadcastResponse | {
    result?: BroadcastResponse
    data?: BroadcastResponse
  }
}

function unwrapBroadcastResponse(response: BroadcastEnvelope): BroadcastResponse {
  const data = response.data
  if (!data) return {}
  if ('result' in data && data.result) return data.result
  if ('data' in data && data.data) return data.data
  if ('txid' in data) return data
  return {}
}

export async function broadcastRawTransaction(rawHex: string): Promise<string> {
  const response = await adminApiClient.post('/bitcoin/transactions', { hex: rawHex })
  const result = unwrapBroadcastResponse(response)
  const txid = typeof result.txid === 'string' ? result.txid.trim() : ''
  if (!txid) {
    throw new Error('Broadcast failed: backend returned no txid')
  }
  return txid
}
