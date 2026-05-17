const mqtt = require('mqtt')
const {
  pushLog,
  saveCurrentData,
  saveDeviceStatus,
} = require('./firebase')
require('dotenv').config()

const TOPICS = {
  sensorsData: 'smarthome/sensors/data',
  devicesStatus: 'smarthome/devices/status',
  alerts: 'smarthome/alerts',
  modeControl: 'smarthome/mode/control',
  devicesControl: 'smarthome/devices/control',
}

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883'
const qos = Number(process.env.MQTT_QOS || 1)
const retainControl = process.env.MQTT_CONTROL_RETAIN === 'true'
const GAS_THRESHOLD = 2000
const HUMIDITY_THRESHOLD = 70
const LIGHT_THRESHOLD = 2000
const TEMP_THRESHOLD = 35

let client

function parseJsonMessage(topic, message) {
  try {
    return JSON.parse(message.toString())
  } catch (error) {
    console.error(`[MQTT] Payload khong phai JSON o topic ${topic}:`, error)
    return null
  }
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBinary(value) {
  return toNumber(value) >= 1 ? 1 : 0
}

function hasField(data, field) {
  return Object.prototype.hasOwnProperty.call(data, field)
}

function normalizeMode(value) {
  return value === 'manual' ? 'manual' : 'auto'
}

function normalizeSensorPayload(data) {
  const temperature = toNumber(data.temperature)
  const humidity = toNumber(data.humidity)
  const gas = toNumber(data.gas)
  const light = toNumber(data.light)
  const rain = toBinary(data.rain)
  const motion = toBinary(data.motion)
  const gasWarning = toBinary(data.gasWarning) || (gas > GAS_THRESHOLD ? 1 : 0)
  const tempWarning =
    toBinary(data.tempWarning) || (temperature > TEMP_THRESHOLD ? 1 : 0)
  const mode = normalizeMode(data.mode)
  const usePayloadOutputs = mode === 'manual'
  const autoOutputs = {
    lamp: light < LIGHT_THRESHOLD ? 1 : 0,
    awning: rain,
    window: rain ? 1 : 0,
    fan: tempWarning,
    dehumidifier: humidity > HUMIDITY_THRESHOLD ? 1 : 0,
    securityAlarm: motion,
    gasAlarm: gasWarning,
    gasValve: gasWarning ? 0 : 1,
  }

  return {
    temperature,
    humidity,
    gas,
    light,
    rain,
    motion,
    lamp: usePayloadOutputs && hasField(data, 'lamp')
      ? toBinary(data.lamp)
      : autoOutputs.lamp,
    awning: usePayloadOutputs && hasField(data, 'awning')
      ? toBinary(data.awning)
      : autoOutputs.awning,
    window: usePayloadOutputs && hasField(data, 'window')
      ? toBinary(data.window)
      : autoOutputs.window,
    fan: usePayloadOutputs && hasField(data, 'fan')
      ? toBinary(data.fan)
      : autoOutputs.fan,
    dehumidifier: usePayloadOutputs && hasField(data, 'dehumidifier')
      ? toBinary(data.dehumidifier)
      : autoOutputs.dehumidifier,
    securityAlarm: usePayloadOutputs && hasField(data, 'securityAlarm')
      ? toBinary(data.securityAlarm)
      : autoOutputs.securityAlarm,
    gasAlarm: usePayloadOutputs && hasField(data, 'gasAlarm')
      ? toBinary(data.gasAlarm)
      : autoOutputs.gasAlarm,
    gasValve: usePayloadOutputs && hasField(data, 'gasValve')
      ? toBinary(data.gasValve)
      : autoOutputs.gasValve,
    gasWarning,
    tempWarning,
    mode,
    timestamp: Date.now(),
  }
}

function normalizeDeviceStatusPayload(data) {
  const rainLed = toBinary(data.rainLed)
  const motionLed = toBinary(data.motionLed)
  const gasLed = toBinary(data.gasLed)
  const tempLed = toBinary(data.tempLed)
  const awning = toBinary(data.awning) || rainLed
  const mode = normalizeMode(data.mode)
  const usePayloadOutputs = mode === 'manual'

  return {
    lamp: toBinary(data.lamp),
    awning,
    window: usePayloadOutputs && hasField(data, 'window')
      ? toBinary(data.window)
      : awning
        ? 1
        : 0,
    fan: toBinary(data.fan) || tempLed,
    dehumidifier: toBinary(data.dehumidifier),
    securityAlarm: toBinary(data.securityAlarm) || motionLed,
    gasAlarm: toBinary(data.gasAlarm) || gasLed,
    gasValve: hasField(data, 'gasValve')
      ? toBinary(data.gasValve)
      : gasLed
        ? 0
        : 1,
    mode,
  }
}

async function handleMessage(topic, message) {
  const payload = parseJsonMessage(topic, message)
  if (!payload) return

  try {
    if (topic === TOPICS.sensorsData) {
      const currentData = normalizeSensorPayload(payload)
      await saveCurrentData(currentData)
      console.log('[Firebase] Da ghi smarthome/current:', currentData)
      return
    }

    if (topic === TOPICS.devicesStatus) {
      const deviceStatus = normalizeDeviceStatusPayload(payload)
      await saveDeviceStatus(deviceStatus)
      console.log('[Firebase] Da ghi smarthome/devices/status:', deviceStatus)
      return
    }

    if (topic === TOPICS.alerts) {
      const log = await pushLog(payload)
      console.log('[Firebase] Da push smarthome/logs:', log)
    }
  } catch (error) {
    console.error(`[MQTT] Xu ly message loi o topic ${topic}:`, error)
  }
}

function connectMqtt() {
  if (client) return client

  const clientIdBase = process.env.MQTT_CLIENT_ID || 'smarthome-backend'
  const clientId = `${clientIdBase}-${Math.random().toString(16).slice(2, 8)}`

  client = mqtt.connect(brokerUrl, {
    clean: true,
    clientId,
    connectTimeout: 10_000,
    keepalive: 60,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 3000,
    username: process.env.MQTT_USERNAME || undefined,
  })

  client.on('connect', () => {
    console.log(`[MQTT] Da ket noi broker ${brokerUrl} voi clientId ${clientId}`)

    client.subscribe(
      [TOPICS.sensorsData, TOPICS.devicesStatus, TOPICS.alerts],
      { qos },
      (error, granted) => {
        if (error) {
          console.error('[MQTT] Subscribe loi:', error)
          return
        }

        console.log('[MQTT] Da subscribe:', granted.map((item) => item.topic))
      },
    )
  })

  client.on('message', handleMessage)
  client.on('error', (error) => console.error('[MQTT] Loi ket noi:', error))
  client.on('reconnect', () => console.log('[MQTT] Dang reconnect...'))

  return client
}

function publishJson(topic, payload) {
  if (!client) {
    throw new Error('MQTT client chua duoc khoi tao')
  }

  return new Promise((resolve, reject) => {
    const message = JSON.stringify(payload)

    client.publish(topic, message, { qos, retain: retainControl }, (error) => {
      if (error) {
        reject(error)
        return
      }

      console.log(`[MQTT] Publish ${topic}: ${message}`)
      resolve()
    })
  })
}

module.exports = {
  TOPICS,
  connectMqtt,
  publishJson,
}
