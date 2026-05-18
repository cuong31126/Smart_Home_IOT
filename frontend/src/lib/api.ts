import type { DeviceControl, DeviceStatus, SmartHomeMode } from './types'

type ApiControlResponse = {
  control?: Record<string, unknown>
  message?: string
  status?: Partial<DeviceStatus>
  topic?: string
}

const configuredApiBaseUrl = import.meta.env.VITE_BACKEND_API_URL?.trim()
const API_BASE_URL =
  configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000' : '')

function getApiBaseUrl() {
  if (API_BASE_URL) return API_BASE_URL.replace(/\/+$/, '')

  throw new Error(
    'Chua cau hinh VITE_BACKEND_API_URL cho ban deploy. Hay dat URL HTTPS cua backend, vi frontend production khong the goi localhost:4000.',
  )
}

function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`
}

function getNetworkErrorMessage(path: string) {
  return [
    `Khong ket noi duoc backend ${path}.`,
    'Kiem tra VITE_BACKEND_API_URL co dung URL HTTPS backend deploy khong, backend co dang chay khong, va CORS_ORIGIN co cho phep domain frontend khong.',
  ].join(' ')
}

async function postJson<TResponse, TBody extends object>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  let response: Response

  try {
    response = await fetch(buildApiUrl(path), {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  } catch (error) {
    throw new Error(getNetworkErrorMessage(path), { cause: error })
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new Error(errorBody?.message || `API ${path} failed`)
  }

  return response.json()
}

export function sendDeviceControl(control: DeviceControl) {
  return postJson<ApiControlResponse, DeviceControl>('/api/control', control)
}

export function sendModeControl(mode: SmartHomeMode) {
  return postJson<ApiControlResponse, { mode: SmartHomeMode }>('/api/mode', {
    mode,
  })
}
