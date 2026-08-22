/**
 * ACME API Response Types
 * Based on the REST API at localhost:3333
 */

/** Standard API response wrapper */
export interface ApiResponse<T> {
  result: T
  error: string | null
  next_cursor: number | string | null
  result_count: number
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  nextCursor: number | string | null
  hasMore: boolean
}

/** Pagination parameters for API requests */
export interface PaginationParams {
  cursor?: number | string
  limit?: number
  offset?: number
}

/** API error response */
export interface ApiError {
  code: string
  message: string
  requestId?: string
  details?: Record<string, unknown>
}

/** Compose request base with optional PSBT building */
export interface ComposeRequestBase {
  build_transaction?: boolean
  utxos?: ComposeUtxoInput[]
  fee_rate?: number
  change_address?: string
}

/** UTXO input for PSBT building */
export interface ComposeUtxoInput {
  txid: string
  vout: number
  value: number
  script_pubkey: string
}

/** Compose result from API */
export interface ComposeResult {
  envelope: EnvelopeData
  message: MessageMetadata
  transaction: TransactionMetadata
  validation: ValidationInfo
}

/** Envelope data in hex and base64 */
export interface EnvelopeData {
  hex: string
  base64: string
}

/** Message metadata */
export interface MessageMetadata {
  msg_type: string
  type_id: number
  source: string
  destination: string | null
  params: Record<string, unknown>
}

/** Transaction metadata */
export interface TransactionMetadata {
  estimated_size: number
  min_fee_rate: number
  recommended_fee: number
  dust_limit: number
  psbt?: string
  fee?: number
  size?: number
  inputs?: TransactionInput[]
  outputs?: TransactionOutput[]
  change?: ChangeOutput
  olga_chunks?: number
  olga_value?: number
}

export interface TransactionInput {
  txid: string
  vout: number
  value: number
}

export interface TransactionOutput {
  value: number
  address: string | null
  output_type: string
}

export interface ChangeOutput {
  address: string
  amount: number
}

/** Validation info */
export interface ValidationInfo {
  status: string
  warnings: string[]
  balance_required?: number
  balance_available?: number
}

/** Submit request for signed PSBT */
export interface SubmitRequest {
  psbt: string
  broadcast: boolean
}

/** Submit result */
export interface SubmitResult {
  txid: string
  hex: string
  broadcasted: boolean
}
