import type { DeviceControl, SmartHomeMode } from './types'

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:4000'

async function postJson<TBody extends object>(path: string, body: TBody) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new Error(errorBody?.message || `API ${path} failed`)
  }

  return response.json()
}

export function sendDeviceControl(control: DeviceControl) {
  return postJson('/api/control', control)
}

export function sendModeControl(mode: SmartHomeMode) {
  return postJson('/api/mode', { mode })
}
