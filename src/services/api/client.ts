import axios, { type AxiosError, type AxiosInstance } from 'axios'
import type { ApiError, ApiResponse } from '@/types/api'

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'https://acme.pics/api')

const ADMIN_API_BASE_URL =
  import.meta.env.VITE_ADMIN_API_URL || (import.meta.env.DEV ? '/admin' : 'https://acme.pics/admin')

function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 300000,
    headers: { 'Content-Type': 'application/json' },
  })

  client.interceptors.response.use(
    (response) => {
      const data = response.data as ApiResponse<unknown>
      if (data?.error) {
        return Promise.reject({
          code: 'API_ERROR',
          message: data.error,
          requestId: response.headers['x-request-id'],
        } satisfies ApiError)
      }
      return response
    },
    (error: AxiosError<ApiResponse<unknown>>) => {
      const apiError: ApiError = {
        code: error.response ? `HTTP_${error.response.status}` : 'NETWORK_ERROR',
        message: error.response?.data?.error || error.message || 'Network error',
      }
      const requestId = error.response?.headers['x-request-id']
      if (typeof requestId === 'string' && requestId) apiError.requestId = requestId
      return Promise.reject(apiError)
    },
  )

  return client
}

export const apiClient = createApiClient(API_BASE_URL)
export const adminApiClient = createApiClient(ADMIN_API_BASE_URL)
