const cors = require('cors')
const express = require('express')
require('dotenv').config()

const controlRoutes = require('./routes/controlRoutes')
const { connectMqtt } = require('./mqttClient')

const app = express()
const port = Number(process.env.PORT || 4000)
const corsOrigin = process.env.CORS_ORIGIN || '*'

function parseCorsOrigin(value) {
  if (!value || value === '*') return true

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length === 0) return true
  if (origins.length === 1) return origins[0]

  return origins
}

app.use(
  cors({
    origin: parseCorsOrigin(corsOrigin),
  }),
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    mqttBroker: process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883',
    status: 'ok',
    timestamp: Date.now(),
  })
})

app.use('/api', controlRoutes)

app.use((error, _req, res, _next) => {
  console.error('[Express] Loi API:', error)
  res.status(500).json({
    message: error.message || 'Internal Server Error',
  })
})

connectMqtt()

app.listen(port, () => {
  console.log(`[Express] Backend dang chay tai http://localhost:${port}`)
})
