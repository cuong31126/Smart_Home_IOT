// file này tạo api cho các web dashboard để lấy dữ liệu hiện tại và gửi lệnh điều khiển thiết bị qua MQTT 
const express = require('express') // import thư viẹn express => tạo router api 
// import các hàm làm việc vs firebase 
// getcurrentdata -> lấy data hiện tại của firebase ví dụ smarthomw/current 
// getdevicestatus -> lấy trạng thái hiện tại của thiết bị  mode , lamp , fan ,... 
// gửi lệnh điều khiển lên firebase  control 
// cập nhật trạng thái lên firebase  current 
const {
  getCurrentData,
  getDeviceStatus,
  updateControlData,
  updateDeviceStatus,
} = require('../firebase')
const { TOPICS, publishJson } = require('../mqttClient')
// lấy từ file mqttClient.js 
// Topics -> chứa tên các mqtt topic smarthome/devices/control 
// publishJson gửi data json lên mqtt broker 


const router = express.Router() // tạo 1 router để khai báo api 

const GAS_THRESHOLD = 2000 // ngưỡng cảnh báo gas, nếu giá trị gas vượt quá ngưỡng này thì sẽ không cho mở van gas để đảm bảo an toàn
const HUMIDITY_THRESHOLD = 70
const TEMP_THRESHOLD = 35
// danh sách thiết bị đc phép control đèn chính , mái hiên , cửa sổ , quạt thông gió , máy hút ẩm , cảnh báo an ninh , còi ga , van ga 
const DEVICE_FIELDS = [
  'lamp',
  'awning',
  'window',
  'fan',
  'dehumidifier',
  'securityAlarm',
  'gasAlarm',
  'gasValve',
]

// hàm ép data về dạng 0 or 1 để dễ dàng gửi lệnh điều khiển qua mqtt và lưu trữ trong firebase
function toBinary(value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 1 ? 1 : 0
}

// kt gas có đang nguy hiểm ko 
function isGasDanger(data) {
  if (!data) return false
  return toBinary(data.gasWarning) === 1 || Number(data.gas) > GAS_THRESHOLD
}

function isRaining(data) {
  return toBinary(data?.rain) === 1
}

function isTempDanger(data) {
  return toBinary(data?.tempWarning) === 1 || Number(data?.temperature) > TEMP_THRESHOLD
}

function isHumidityDanger(data) {
  return Number(data?.humidity) > HUMIDITY_THRESHOLD
}

function isMotionActive(data) {
  return toBinary(data?.motion) === 1
}

function getControlBlockReason(field, payload, currentData, currentStatus) {
  if (field === 'lamp') return null

  if (field === 'awning' && !isRaining(currentData)) {
    return 'Mai hien chi dieu khien khi dang co canh bao mua'
  }

  if (field === 'window' && !isRaining(currentData)) {
    return 'Cua so chi dieu khien khi dang co canh bao mua'
  }

  if (field === 'fan' && !isTempDanger(currentData)) {
    return 'Quat chi dieu khien khi nhiet do vuot nguong'
  }

  if (field === 'dehumidifier' && !isHumidityDanger(currentData)) {
    return 'May hut am chi dieu khien khi do am cao'
  }

  if (field === 'securityAlarm' && !isMotionActive(currentData)) {
    return 'Coi an ninh chi dieu khien khi PIR phat hien chuyen dong'
  }

  if (field === 'gasValve' && payload.gasValve === 1 && isGasDanger(currentData)) {
    return 'Dang co canh bao gas nen khong the mo van gas'
  }

  if (field === 'gasAlarm') {
    if (!isGasDanger(currentData)) {
      return 'Coi gas chi dieu khien khi dang co canh bao gas'
    }

    const hasGasValveCommand = Object.prototype.hasOwnProperty.call(
      payload,
      'gasValve',
    )
    const hasGasValveStatus =
      currentStatus &&
      Object.prototype.hasOwnProperty.call(currentStatus, 'gasValve')

    if (!hasGasValveCommand && !hasGasValveStatus) {
      return 'Hay khoa van gas thanh cong truoc khi dieu khien coi gas'
    }

    const gasValveAfterCommand = hasGasValveCommand
      ? payload.gasValve
      : currentStatus?.gasValve

    if (toBinary(gasValveAfterCommand) !== 0) {
      return 'Hay khoa van gas thanh cong truoc khi dieu khien coi gas'
    }
  }

  return null
}

function getControlBlockReasons(payload, currentData, currentStatus) {
  const reasons = []

  for (const field of Object.keys(payload)) {
    const reason = getControlBlockReason(field, payload, currentData, currentStatus)
    if (reason) reasons.push(reason)
  }

  return reasons
}
// safety override 

// api get /current lấy data hiện tại của firebase 
router.get('/current', async (_req, res, next) => {
  try {
    const data = await getCurrentData()
    res.json(data || null)
  } catch (error) {
    next(error)
  }
})

// api post /control fontend sẽ gọi api này để user bật tắt thiết bị 
router.post('/control', async (req, res, next) => {
  try {
    const payload = {}

    for (const field of DEVICE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        payload[field] = toBinary(req.body[field])
      }
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        message: `Body can co it nhat mot field: ${DEVICE_FIELDS.join(', ')}`,
      })
    }

    const currentStatus = await getDeviceStatus()
    if (currentStatus?.mode !== 'manual') {
      return res.status(409).json({
        message: 'Hay chuyen sang Manual truoc khi dieu khien thiet bi',
      })
    }

    const currentData = await getCurrentData()
    const blockedReasons = getControlBlockReasons(
      payload,
      currentData,
      currentStatus,
    )

    if (blockedReasons.length > 0) {
      return res.status(409).json({
        message: blockedReasons[0],
        reasons: blockedReasons,
      })
    }
    
    // publish lệnh mqtt xuống esp32 
    // Frontend → Backend /control → MQTT → ESP32 → LED Wokwi

    await publishJson(TOPICS.devicesControl, payload)

    // cập nhật firebase 
    const control = await updateControlData(payload)
    const status = await updateDeviceStatus(payload)
    // trả kết quả về frontend 
    return res.json({
      message: 'Da gui lenh dieu khien thiet bi qua MQTT',
      control,
      status,
      topic: TOPICS.devicesControl,
    })
  } catch (error) {
    next(error)
  }
})

// api post /mode để chuyển đổi giữa 2 chế độ auto và manual
router.post('/mode', async (req, res, next) => {
  try {
    const mode = req.body.mode

    if (mode !== 'auto' && mode !== 'manual') {
      return res.status(400).json({
        message: 'mode chi duoc la "auto" hoac "manual"',
      })
    }

    const payload = { mode }

    await publishJson(TOPICS.modeControl, payload)
    // cập nhật firebase 
    const control = await updateControlData(payload)
    const status = await updateDeviceStatus(payload)

    return res.json({
      message: 'Da gui lenh doi mode qua MQTT',
      control,
      status,
      topic: TOPICS.modeControl,
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router // export router để sử dụng trong file app.js
