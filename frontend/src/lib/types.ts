export type SmartHomeMode = 'auto' | 'manual'

export interface SmartHomeData {
  temperature: number
  humidity: number
  gas: number
  light: number
  rain: number
  motion: number
  lamp: number
  awning: number
  window: number
  fan: number
  dehumidifier: number
  securityAlarm: number
  gasAlarm: number
  gasValve: number
  gasWarning: number
  tempWarning: number
  mode: SmartHomeMode
  timestamp?: number
}

export type SmartHomeTelemetry = SmartHomeData

export interface DeviceControl {
  lamp?: number
  awning?: number
  window?: number
  fan?: number
  dehumidifier?: number
  securityAlarm?: number
  gasAlarm?: number
  gasValve?: number
}

export interface DeviceStatus {
  lamp: number
  awning: number
  window: number
  fan: number
  dehumidifier: number
  securityAlarm: number
  gasAlarm: number
  gasValve: number
  mode: SmartHomeMode
  timestamp?: number
}

export interface TelemetryEvent {
  id: string
  message: string
  timestamp: number
  type: 'info' | 'warning' | 'success'
}
