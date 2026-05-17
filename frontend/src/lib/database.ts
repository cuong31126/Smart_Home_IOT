import { onValue, ref } from 'firebase/database'
import { db } from './firebase'
import type { DeviceStatus, SmartHomeTelemetry } from './types'

export const CURRENT_TELEMETRY_PATH = 'smarthome/current'
export const DEVICE_STATUS_PATH = 'smarthome/devices/status'

export const EMPTY_TELEMETRY: SmartHomeTelemetry = {
  temperature: 0,
  humidity: 0,
  gas: 0,
  light: 0,
  rain: 0,
  motion: 0,
  lamp: 0,
  awning: 0,
  window: 0,
  fan: 0,
  dehumidifier: 0,
  securityAlarm: 0,
  gasAlarm: 0,
  gasValve: 0,
  gasWarning: 0,
  tempWarning: 0,
  mode: 'auto',
}

export const EMPTY_DEVICE_STATUS: DeviceStatus = {
  lamp: 0,
  awning: 0,
  window: 0,
  fan: 0,
  dehumidifier: 0,
  securityAlarm: 0,
  gasAlarm: 0,
  gasValve: 0,
  mode: 'auto',
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toMode(value: unknown): SmartHomeTelemetry['mode'] {
  return value === 'manual' ? 'manual' : 'auto'
}

export function normalizeTelemetry(value: unknown): SmartHomeTelemetry {
  const data =
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}

  return {
    temperature: toNumber(data.temperature),
    humidity: toNumber(data.humidity),
    gas: toNumber(data.gas),
    light: toNumber(data.light),
    rain: toNumber(data.rain),
    motion: toNumber(data.motion),
    lamp: toNumber(data.lamp),
    awning: toNumber(data.awning),
    window: toNumber(data.window),
    fan: toNumber(data.fan),
    dehumidifier: toNumber(data.dehumidifier),
    securityAlarm: toNumber(data.securityAlarm),
    gasAlarm: toNumber(data.gasAlarm),
    gasValve: toNumber(data.gasValve),
    gasWarning: toNumber(data.gasWarning),
    tempWarning: toNumber(data.tempWarning),
    mode: toMode(data.mode),
    timestamp: toNumber(data.timestamp) || undefined,
  }
}

export function normalizeDeviceStatus(value: unknown): DeviceStatus {
  const data =
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  const rainLed = toNumber(data.rainLed)
  const motionLed = toNumber(data.motionLed)
  const gasLed = toNumber(data.gasLed)
  const tempLed = toNumber(data.tempLed)
  const awning = toNumber(data.awning) || rainLed

  return {
    lamp: toNumber(data.lamp),
    awning,
    window: Object.prototype.hasOwnProperty.call(data, 'window')
      ? toNumber(data.window)
      : awning
        ? 1
        : 0,
    fan: toNumber(data.fan) || tempLed,
    dehumidifier: toNumber(data.dehumidifier),
    securityAlarm: toNumber(data.securityAlarm) || motionLed,
    gasAlarm: toNumber(data.gasAlarm) || gasLed,
    gasValve: Object.prototype.hasOwnProperty.call(data, 'gasValve')
      ? toNumber(data.gasValve)
      : gasLed
        ? 0
        : 1,
    mode: toMode(data.mode),
    timestamp: toNumber(data.timestamp) || undefined,
  }
}

export function subscribeToTelemetry(
  callback: (telemetry: SmartHomeTelemetry) => void,
  onError?: (error: Error) => void,
) {
  const telemetryRef = ref(db, CURRENT_TELEMETRY_PATH)

  return onValue(
    telemetryRef,
    (snapshot) => {
      callback(normalizeTelemetry(snapshot.val()))
    },
    (error) => {
      onError?.(error)
    },
  )
}

export function subscribeToDeviceStatus(
  callback: (status: DeviceStatus) => void,
  onError?: (error: Error) => void,
) {
  const statusRef = ref(db, DEVICE_STATUS_PATH)

  return onValue(
    statusRef,
    (snapshot) => {
      callback(normalizeDeviceStatus(snapshot.val()))
    },
    (error) => {
      onError?.(error)
    },
  )
}
