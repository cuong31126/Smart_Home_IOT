const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
require('dotenv').config()

const DEFAULT_DATABASE_URL =
  'https://iotdemo31126-default-rtdb.asia-southeast1.firebasedatabase.app'

function readServiceAccountFromFile(filePath) {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Khong tim thay Firebase service account tai: ${resolvedPath}. Hay copy serviceAccountKey.example.json thanh serviceAccountKey.json va dien key that.`,
    )
  }

  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
}

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      'base64',
    ).toString('utf8')
    return JSON.parse(json)
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return readServiceAccountFromFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  }

  const serviceAccountCandidates = [
    './serviceAccountKey.json',
    './ServiceAccountKey.json',
    '/etc/secrets/serviceAccountKey.json',
    '/etc/secrets/ServiceAccountKey.json',
  ]

  const existingPath = serviceAccountCandidates.find((filePath) => {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath)

    return fs.existsSync(resolvedPath)
  })

  return readServiceAccountFromFile(
    existingPath || serviceAccountCandidates[0],
  )
}

function normalizePrivateKey(serviceAccount) {
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  }

  return serviceAccount
}

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.app()
  }

  const serviceAccount = normalizePrivateKey(loadServiceAccount())
  const databaseURL = process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL,
  })
}

initFirebase()

const database = admin.database()

const paths = {
  current: 'smarthome/current',
  control: 'smarthome/control',
  logs: 'smarthome/logs',
  deviceStatus: 'smarthome/devices/status',
}

const legacyDeviceStatusFields = ['rainLed', 'motionLed', 'gasLed', 'tempLed']

async function getCurrentData() {
  const snapshot = await database.ref(paths.current).once('value')
  return snapshot.val()
}

async function getDeviceStatus() {
  const snapshot = await database.ref(paths.deviceStatus).once('value')
  return snapshot.val()
}

async function saveCurrentData(data) {
  await database.ref(paths.current).set(data)
  return data
}

async function updateControlData(data) {
  const payload = {
    ...data,
    updatedAt: Date.now(),
  }

  await database.ref(paths.control).update(payload)
  return payload
}

async function saveDeviceStatus(data) {
  const payload = {
    ...data,
    timestamp: Date.now(),
  }

  await database.ref(paths.deviceStatus).set(payload)
  return payload
}

async function updateDeviceStatus(data) {
  const payload = {
    ...data,
    timestamp: Date.now(),
  }
  const updatePayload = { ...payload }

  for (const field of legacyDeviceStatusFields) {
    updatePayload[field] = null
  }

  await database.ref(paths.deviceStatus).update(updatePayload)
  return payload
}

async function pushLog(data) {
  const payload = {
    ...data,
    timestamp: Date.now(),
  }

  const ref = await database.ref(paths.logs).push(payload)
  return {
    id: ref.key,
    ...payload,
  }
}

module.exports = {
  database,
  getCurrentData,
  getDeviceStatus,
  paths,
  pushLog,
  saveCurrentData,
  saveDeviceStatus,
  updateDeviceStatus,
  updateControlData,
}
