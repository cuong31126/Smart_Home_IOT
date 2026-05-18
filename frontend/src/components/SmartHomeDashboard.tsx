import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  CloudRain,
  Database,
  Droplets,
  Flame,
  Gauge,
  Home,
  Lightbulb,
  RadioTower,
  SlidersHorizontal,
  Sun,
  Thermometer,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { sendDeviceControl, sendModeControl } from '@/lib/api'
import {
  CURRENT_TELEMETRY_PATH,
  DEVICE_STATUS_PATH,
  EMPTY_DEVICE_STATUS,
  EMPTY_TELEMETRY,
  normalizeDeviceStatus,
  subscribeToDeviceStatus,
  subscribeToTelemetry,
} from '@/lib/database'
import type {
  DeviceControl,
  DeviceStatus,
  SmartHomeMode,
  SmartHomeTelemetry,
  TelemetryEvent,
} from '@/lib/types'

const ADC_MAX = 4095
const GAS_THRESHOLD = 2000
const HUMIDITY_THRESHOLD = 70
const LIGHT_THRESHOLD = 2000
const TEMP_THRESHOLD = 35
const STALE_AFTER_MS = 10_000
const MAX_HISTORY = 48

type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'zinc'
type HistoryPoint = SmartHomeTelemetry & { timestamp: number }
type DeviceControlKey = keyof DeviceControl
type DevicePanelItem = {
  active: boolean
  blocked?: boolean
  blockedLabel?: string
  key: DeviceControlKey
  icon: ReactNode
  name: string
  offAction: string
  offLabel: string
  onAction: string
  onLabel: string
  tone: Tone
}

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function percent(value: number, max = ADC_MAX) {
  return clamp((value / max) * 100)
}

function isOn(value: number) {
  return value >= 1
}

function formatNumber(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)
}

function createEvent(
  message: string,
  type: TelemetryEvent['type'],
  timestamp: number,
): TelemetryEvent {
  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
    message,
    timestamp,
    type,
  }
}

function getTelemetryEvents(
  previous: SmartHomeTelemetry,
  current: SmartHomeTelemetry,
  timestamp: number,
) {
  const events: TelemetryEvent[] = []
  const wasGasDanger = isOn(previous.gasWarning) || previous.gas > GAS_THRESHOLD
  const hasGasDanger = isOn(current.gasWarning) || current.gas > GAS_THRESHOLD
  const wasTempDanger =
    isOn(previous.tempWarning) || previous.temperature > TEMP_THRESHOLD
  const hasTempDanger =
    isOn(current.tempWarning) || current.temperature > TEMP_THRESHOLD
  const wasHumidityDanger = previous.humidity > HUMIDITY_THRESHOLD
  const hasHumidityDanger = current.humidity > HUMIDITY_THRESHOLD

  if (!wasGasDanger && hasGasDanger) {
    events.push(createEvent('Canh bao gas vuot nguong an toan', 'warning', timestamp))
  }

  if (wasGasDanger && !hasGasDanger) {
    events.push(createEvent('Nong do gas da tro lai binh thuong', 'success', timestamp))
  }

  if (!isOn(previous.rain) && isOn(current.rain)) {
    events.push(createEvent('Phat hien mua tu nut rain GPIO 18', 'info', timestamp))
  }

  if (isOn(previous.rain) && !isOn(current.rain)) {
    events.push(createEvent('Trang thai mua da tat', 'success', timestamp))
  }

  if (!isOn(previous.motion) && isOn(current.motion)) {
    events.push(createEvent('Phat hien chuyen dong tu PIR', 'warning', timestamp))
  }

  if (isOn(previous.motion) && !isOn(current.motion)) {
    events.push(createEvent('PIR khong con phat hien chuyen dong', 'success', timestamp))
  }

  if (!wasTempDanger && hasTempDanger) {
    events.push(createEvent('Nhiet do vuot nguong an toan', 'warning', timestamp))
  }

  if (wasTempDanger && !hasTempDanger) {
    events.push(createEvent('Nhiet do da tro lai binh thuong', 'success', timestamp))
  }

  if (!wasHumidityDanger && hasHumidityDanger) {
    events.push(createEvent('Do am cao, can thong gio hoac hut am', 'warning', timestamp))
  }

  if (wasHumidityDanger && !hasHumidityDanger) {
    events.push(createEvent('Do am da tro lai binh thuong', 'success', timestamp))
  }

  if (!isOn(previous.lamp) && isOn(current.lamp)) {
    events.push(createEvent('Den tu bat vi anh sang thap', 'info', timestamp))
  }

  if (isOn(previous.lamp) && !isOn(current.lamp)) {
    events.push(createEvent('Den tu tat vi anh sang du', 'info', timestamp))
  }

  return events
}

function getFallbackDeviceStatus(telemetry: SmartHomeTelemetry): DeviceStatus {
  return {
    lamp: telemetry.lamp,
    awning: telemetry.awning,
    window: telemetry.window,
    fan: telemetry.fan,
    dehumidifier: telemetry.dehumidifier,
    securityAlarm: telemetry.securityAlarm,
    gasAlarm: telemetry.gasAlarm,
    gasValve: telemetry.gasValve,
    mode: telemetry.mode,
    timestamp: telemetry.timestamp,
  }
}

function getGasDanger(telemetry: SmartHomeTelemetry) {
  return isOn(telemetry.gasWarning) || telemetry.gas > GAS_THRESHOLD
}

function getTempDanger(telemetry: SmartHomeTelemetry) {
  return isOn(telemetry.tempWarning) || telemetry.temperature > TEMP_THRESHOLD
}

function getAutoDeviceStatus(telemetry: SmartHomeTelemetry): DeviceStatus {
  const gasDanger = getGasDanger(telemetry)
  const raining = isOn(telemetry.rain)
  const motionActive = isOn(telemetry.motion)
  const tempDanger = getTempDanger(telemetry)

  return {
    lamp: telemetry.light < LIGHT_THRESHOLD ? 1 : 0,
    awning: raining ? 1 : 0,
    window: raining ? 1 : 0,
    fan: tempDanger ? 1 : 0,
    dehumidifier: telemetry.humidity > HUMIDITY_THRESHOLD ? 1 : 0,
    securityAlarm: motionActive ? 1 : 0,
    gasAlarm: gasDanger ? 1 : 0,
    gasValve: gasDanger ? 0 : 1,
    mode: 'auto',
    timestamp: telemetry.timestamp,
  }
}

function getDeviceControlValue(
  deviceStatus: DeviceStatus,
  key: DeviceControlKey,
) {
  return deviceStatus[key] ?? 0
}

function mergeDeviceStatusPatch(
  currentStatus: DeviceStatus,
  patch: Partial<DeviceStatus>,
) {
  return normalizeDeviceStatus({
    ...currentStatus,
    ...patch,
  })
}

export default function SmartHomeDashboard() {
  const [telemetry, setTelemetry] = useState<SmartHomeTelemetry>(EMPTY_TELEMETRY)
  const [deviceStatus, setDeviceStatus] =
    useState<DeviceStatus>(EMPTY_DEVICE_STATUS)
  const [telemetryConnected, setTelemetryConnected] = useState(false)
  const [deviceStatusConnected, setDeviceStatusConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [events, setEvents] = useState<TelemetryEvent[]>([])
  const [controlPending, setControlPending] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)
  const previousTelemetryRef = useRef<SmartHomeTelemetry | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let unsubscribeTelemetry: (() => void) | undefined
    let unsubscribeDeviceStatus: (() => void) | undefined

    try {
      unsubscribeTelemetry = subscribeToTelemetry(
        (nextTelemetry) => {
          const timestamp = nextTelemetry.timestamp ?? Date.now()
          const previousTelemetry = previousTelemetryRef.current

          setTelemetryConnected(true)
          setTelemetry(nextTelemetry)
          setLastUpdated(timestamp)
          setHistory((items) =>
            [...items, { ...nextTelemetry, timestamp }].slice(-MAX_HISTORY),
          )

          if (previousTelemetry) {
            const nextEvents = getTelemetryEvents(
              previousTelemetry,
              nextTelemetry,
              timestamp,
            )

            if (nextEvents.length > 0) {
              setEvents((items) => [...nextEvents, ...items].slice(0, 10))
            }
          }

          previousTelemetryRef.current = nextTelemetry
        },
        (error) => {
          console.error('Firebase telemetry subscription failed', error)
          setTelemetryConnected(false)
        },
      )

      unsubscribeDeviceStatus = subscribeToDeviceStatus(
        (nextStatus) => {
          setDeviceStatusConnected(true)
          setDeviceStatus(nextStatus)
        },
        (error) => {
          console.error('Firebase device status subscription failed', error)
          setDeviceStatusConnected(false)
        },
      )
    } catch (error) {
      console.error('Firebase setup failed', error)
      setTelemetryConnected(false)
      setDeviceStatusConnected(false)
    }

    return () => {
      unsubscribeTelemetry?.()
      unsubscribeDeviceStatus?.()
    }
  }, [])

  const rawDeviceStatus = deviceStatusConnected
    ? deviceStatus
    : getFallbackDeviceStatus(telemetry)
  const activeMode = rawDeviceStatus.mode

  const liveDeviceStatus = useMemo(() => {
    if (activeMode === 'auto') {
      return getAutoDeviceStatus(telemetry)
    }

    return rawDeviceStatus
  }, [activeMode, rawDeviceStatus, telemetry])

  const status = useMemo(() => {
    const gasDanger = getGasDanger(telemetry)
    const raining = isOn(telemetry.rain)
    const motionActive = isOn(telemetry.motion)
    const lampOn = isOn(liveDeviceStatus.lamp)
    const humidityDanger = telemetry.humidity > HUMIDITY_THRESHOLD
    const lowLight = telemetry.light < LIGHT_THRESHOLD
    const tempDanger = getTempDanger(telemetry)
    const alertOn = gasDanger || raining || motionActive || tempDanger || humidityDanger
    const healthyAir =
      !gasDanger && !humidityDanger && telemetry.gas <= GAS_THRESHOLD * 0.75
    const comfortable =
      telemetry.temperature >= 22 &&
      telemetry.temperature <= 31 &&
      telemetry.humidity >= 40 &&
      telemetry.humidity <= HUMIDITY_THRESHOLD &&
      healthyAir &&
      !tempDanger

    return {
      alertOn,
      comfortable,
      gasDanger,
      healthyAir,
      humidityDanger,
      lampOn,
      lowLight,
      motionActive,
      raining,
      tempDanger,
    }
  }, [liveDeviceStatus.lamp, telemetry])

  const devicePanelItems = useMemo<DevicePanelItem[]>(
    () => [
      {
        active: isOn(liveDeviceStatus.lamp),
        key: 'lamp',
        icon: <Lightbulb className="size-5" />,
        name: 'Den trong nha',
        offAction: 'Bat den',
        offLabel: 'Dang tat',
        onAction: 'Tat den',
        onLabel: 'Dang bat',
        tone: 'amber',
      },
      {
        active: isOn(liveDeviceStatus.awning),
        blocked: !status.raining,
        blockedLabel: 'Chua co canh bao mua',
        key: 'awning',
        icon: <CloudRain className="size-5" />,
        name: 'Mai hien tu dong',
        offAction: 'Keo mai hien ra',
        offLabel: 'Dang thu vao',
        onAction: 'Thu mai hien',
        onLabel: 'Dang mo ra',
        tone: 'sky',
      },
      {
        active: isOn(liveDeviceStatus.window),
        blocked: !status.raining,
        blockedLabel: 'Chua co canh bao mua',
        key: 'window',
        icon: <Home className="size-5" />,
        name: 'Cua so tu dong',
        offAction: 'Dong cua so',
        offLabel: 'Dang mo',
        onAction: 'Mo cua so',
        onLabel: 'Da dong',
        tone: 'sky',
      },
      {
        active: isOn(liveDeviceStatus.fan),
        blocked: !status.tempDanger,
        blockedLabel: 'Nhiet do chua vuot nguong',
        key: 'fan',
        icon: <Thermometer className="size-5" />,
        name: 'Quat lam mat',
        offAction: 'Bat quat',
        offLabel: 'Dang tat',
        onAction: 'Tat quat',
        onLabel: 'Dang bat',
        tone: 'emerald',
      },
      {
        active: isOn(liveDeviceStatus.dehumidifier),
        blocked: !status.humidityDanger,
        blockedLabel: 'Do am chua cao',
        key: 'dehumidifier',
        icon: <Droplets className="size-5" />,
        name: 'May hut am',
        offAction: 'Bat may hut am',
        offLabel: 'Dang tat',
        onAction: 'Tat may hut am',
        onLabel: 'Dang bat',
        tone: 'sky',
      },
      {
        active: isOn(liveDeviceStatus.securityAlarm),
        blocked: !status.motionActive,
        blockedLabel: 'Chua phat hien chuyen dong',
        key: 'securityAlarm',
        icon: <Bell className="size-5" />,
        name: 'Coi canh bao nguoi la',
        offAction: 'Bat coi',
        offLabel: 'Dang tat',
        onAction: 'Tat coi',
        onLabel: 'Dang keu',
        tone: 'rose',
      },
      {
        active: isOn(liveDeviceStatus.gasAlarm),
        blocked: !status.gasDanger || isOn(liveDeviceStatus.gasValve),
        blockedLabel: !status.gasDanger
          ? 'Chua co canh bao gas'
          : 'Van gas chua khoa',
        key: 'gasAlarm',
        icon: <Flame className="size-5" />,
        name: 'Coi canh bao gas',
        offAction: 'Bat coi gas',
        offLabel: 'Dang tat',
        onAction: 'Tat coi gas',
        onLabel: 'Dang keu',
        tone: 'rose',
      },
      {
        active: isOn(liveDeviceStatus.gasValve),
        blocked: status.gasDanger && !isOn(liveDeviceStatus.gasValve),
        blockedLabel: 'Dang canh bao gas',
        key: 'gasValve',
        icon: <Flame className="size-5" />,
        name: 'Van gas an toan',
        offAction: 'Mo van gas',
        offLabel: 'Da khoa',
        onAction: 'Khoa van gas',
        onLabel: 'Dang mo',
        tone: status.gasDanger ? 'rose' : 'emerald',
      },
    ],
    [liveDeviceStatus, status],
  )

  const handleModeChange = async (mode: SmartHomeMode) => {
    setControlPending(true)
    setControlError(null)

    try {
      const response = await sendModeControl(mode)

      setDeviceStatus((currentStatus) =>
        mergeDeviceStatusPatch(currentStatus, {
          ...(response.status ?? {}),
          mode,
        }),
      )
      setDeviceStatusConnected(true)
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Khong gui duoc mode')
    } finally {
      setControlPending(false)
    }
  }

  const handleDeviceToggle = async (key: DeviceControlKey) => {
    setControlPending(true)
    setControlError(null)

    try {
      const device = devicePanelItems.find((item) => item.key === key)
      if (device?.blocked) {
        setControlError(device.blockedLabel || 'Thiet bi dang bi khoa')
        return
      }

      const currentValue = getDeviceControlValue(liveDeviceStatus, key)
      if (key === 'gasValve' && status.gasDanger && currentValue < 1) {
        setControlError('Dang co canh bao gas nen khong the mo van gas')
        return
      }

      const nextValue = currentValue >= 1 ? 0 : 1
      const payload: DeviceControl = { [key]: nextValue }
      const response = await sendDeviceControl(payload)

      setDeviceStatus((currentStatus) =>
        mergeDeviceStatusPatch(currentStatus, {
          ...payload,
          ...(response.status ?? {}),
        }),
      )
      setDeviceStatusConnected(true)
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Khong gui duoc lenh')
    } finally {
      setControlPending(false)
    }
  }

  const isLive =
    telemetryConnected && lastUpdated !== null && now - lastUpdated < STALE_AFTER_MS

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('vi-VN', { hour12: false })
    : 'Chua co du lieu'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-emerald-500 text-zinc-950">
              <Home className="size-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-normal text-white">
                Smart Home Wokwi
              </h1>
              <p className="truncate text-sm text-zinc-400">
                ESP32 + MQTT + Firebase Realtime Database
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {status.gasDanger && (
              <div className="gas-danger-pulse flex items-center gap-2 rounded-lg border border-red-400/50 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100">
                <AlertTriangle className="size-4" />
                GAS DANGER
              </div>
            )}

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200">
              <SlidersHorizontal className="size-4" />
              {activeMode === 'manual' ? 'Manual Mode' : 'Auto Mode'}
            </div>

            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                isLive
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-400/40 bg-amber-500/10 text-amber-200',
              )}
            >
              {isLive ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
              {isLive ? 'Live MQTT -> Firebase' : 'Dang cho du lieu'}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
                <RadioTower className="size-4" />
                MQTT bridge: /{CURRENT_TELEMETRY_PATH} va /{DEVICE_STATUS_PATH}
              </p>
              <h2 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Du lieu ESP32 dang di qua MQTT truoc khi ghi vao Firebase.
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Sensor publish len topic smarthome/sensors/data. Trang thai LED
                publish len smarthome/devices/status. Dashboard gui lenh dieu
                khien thiet bi xuong Wokwi khi he thong o Manual mode.
              </p>
            </div>

            <div className="min-w-48 rounded-lg border border-white/10 bg-zinc-900/70 p-4">
              <p className="text-xs uppercase text-zinc-500">Cap nhat cuoi</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {lastUpdatedLabel}
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {history.length} mau trong phien nay
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatusPill
              icon={<CheckCircle2 className="size-4" />}
              label="Khong khi"
              value={status.healthyAir ? 'On dinh' : 'Can chu y'}
              tone={status.healthyAir ? 'emerald' : 'rose'}
            />
            <StatusPill
              icon={<Gauge className="size-4" />}
              label="Nguong gas"
              value={`>${GAS_THRESHOLD} ADC`}
              tone="amber"
            />
            <StatusPill
              icon={<Droplets className="size-4" />}
              label="Nguong am"
              value={`>${HUMIDITY_THRESHOLD}%`}
              tone={status.humidityDanger ? 'rose' : 'sky'}
            />
            <StatusPill
              icon={<Sun className="size-4" />}
              label="Nguong den"
              value={`<${LIGHT_THRESHOLD} ADC`}
              tone="sky"
            />
          </div>
        </section>

        <ControlPanel
          controlError={controlError}
          devices={devicePanelItems}
          mode={activeMode}
          onDeviceToggle={handleDeviceToggle}
          onModeChange={handleModeChange}
          pending={controlPending}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Thermometer className="size-6" />}
            label="Nhiet do"
            value={formatNumber(telemetry.temperature, 1)}
            unit="C"
            helper={status.tempDanger ? 'Nhiet do cao' : 'Theo DHT22'}
            progress={clamp((telemetry.temperature / 50) * 100)}
            tone={status.tempDanger ? 'rose' : status.comfortable ? 'emerald' : 'amber'}
            danger={status.tempDanger}
          />
          <MetricCard
            icon={<Droplets className="size-6" />}
            label="Do am"
            value={formatNumber(telemetry.humidity, 1)}
            unit="%"
            helper={status.humidityDanger ? 'Do am cao' : 'DHT22 humidity'}
            progress={clamp(telemetry.humidity)}
            tone={status.humidityDanger ? 'rose' : 'sky'}
            danger={status.humidityDanger}
          />
          <MetricCard
            icon={<Flame className="size-6" />}
            label="Gas MQ-2"
            value={formatNumber(telemetry.gas)}
            unit="ADC"
            helper={status.gasDanger ? 'Vuot nguong' : 'Duoi nguong'}
            progress={percent(telemetry.gas)}
            tone={status.gasDanger ? 'rose' : 'emerald'}
            danger={status.gasDanger}
          />
          <MetricCard
            icon={<Sun className="size-6" />}
            label="Anh sang"
            value={formatNumber(telemetry.light)}
            unit="ADC"
            helper={
              status.lampOn
                ? activeMode === 'manual'
                  ? 'Manual dang bat den'
                  : 'Auto dang bat den'
                : status.lowLight
                  ? 'Anh sang thap'
                  : 'Du sang'
            }
            progress={percent(telemetry.light)}
            tone={status.lampOn || status.lowLight ? 'amber' : 'sky'}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <StatusTile
              icon={<CloudRain className="size-6" />}
              label="Nut rain"
              value={status.raining ? 'Dang mua' : 'Khong mua'}
              helper={status.raining ? 'Rain toggle dang bat' : 'Rain toggle dang tat'}
              active={status.raining}
              tone={status.raining ? 'sky' : 'zinc'}
            />
            <StatusTile
              icon={<Activity className="size-6" />}
              label="PIR Motion"
              value={status.motionActive ? 'Co chuyen dong' : 'Khong co chuyen dong'}
              helper="Doc tu GPIO 19"
              active={status.motionActive}
              tone={status.motionActive ? 'rose' : 'zinc'}
            />
            <StatusTile
              icon={<Thermometer className="size-6" />}
              label="Canh bao nhiet"
              value={status.tempDanger ? 'Nhiet do cao' : 'Binh thuong'}
              helper={`Nguong > ${TEMP_THRESHOLD} C`}
              active={status.tempDanger}
              tone={status.tempDanger ? 'rose' : 'emerald'}
            />
            <StatusTile
              icon={<Bell className="size-6" />}
              label="Tong canh bao"
              value={status.alertOn ? 'Dang co canh bao' : 'An toan'}
              helper={status.alertOn ? 'Co it nhat mot dieu kien bat thuong' : 'Khong co canh bao'}
              active={status.alertOn}
              tone={status.alertOn ? 'rose' : 'emerald'}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.75fr]">
            <HistoryPanel history={history} />
            <EventPanel events={events} />
          </div>
        </section>
      </main>
    </div>
  )
}

function MetricCard({
  danger,
  helper,
  icon,
  label,
  progress,
  tone,
  unit,
  value,
}: {
  danger?: boolean
  helper: string
  icon: ReactNode
  label: string
  progress: number
  tone: Tone
  unit: string
  value: string
}) {
  const toneClass = toneStyles[tone]

  return (
    <article
      className={cn(
        'rounded-lg border bg-white/[0.04] p-4 transition',
        danger ? 'border-red-400/50 bg-red-500/10' : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid size-11 place-items-center rounded-lg', toneClass.icon)}>
          {icon}
        </div>
        <span className={cn('rounded px-2 py-1 text-xs font-semibold', toneClass.badge)}>
          {label}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold tracking-normal text-white">
            {value}
          </span>
          <span className="pb-1 text-sm text-zinc-400">{unit}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{helper}</p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded bg-white/10">
        <div
          className={cn('h-full rounded', toneClass.bar)}
          style={{ width: `${clamp(progress)}%` }}
        />
      </div>
    </article>
  )
}

function StatusTile({
  active,
  helper,
  icon,
  label,
  tone,
  value,
}: {
  active: boolean
  helper: string
  icon: ReactNode
  label: string
  tone: Tone
  value: string
}) {
  const toneClass = toneStyles[tone]

  return (
    <article
      className={cn(
        'rounded-lg border p-4',
        active ? toneClass.surface : 'border-white/10 bg-white/[0.04]',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('grid size-11 place-items-center rounded-lg', toneClass.icon)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-400">{label}</p>
          <p className="truncate text-lg font-semibold text-white">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-5 text-zinc-400">{helper}</p>
    </article>
  )
}

function StatusPill({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode
  label: string
  tone: Tone
  value: string
}) {
  const toneClass = toneStyles[tone]

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900/70 p-3">
      <div className={cn('grid size-9 place-items-center rounded', toneClass.icon)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-zinc-500">{label}</p>
        <p className="truncate text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  )
}

function ControlPanel({
  controlError,
  devices,
  mode,
  onDeviceToggle,
  onModeChange,
  pending,
}: {
  controlError: string | null
  devices: DevicePanelItem[]
  mode: SmartHomeMode
  onDeviceToggle: (key: DeviceControlKey) => void | Promise<void>
  onModeChange: (mode: SmartHomeMode) => void | Promise<void>
  pending: boolean
}) {
  const isManual = mode === 'manual'

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">Auto / Manual</h2>
          <p className="text-sm text-zinc-400">
            Auto de he thong tu xu ly. Manual cho phep dieu khien truc tiep cac
            thiet bi trong nha qua <span className="text-zinc-300">Firebase + MQTT</span>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['auto', 'manual'] as SmartHomeMode[]).map((nextMode) => {
            const active = mode === nextMode

            return (
              <button
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                  active
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/25',
                )}
                disabled={pending}
                key={nextMode}
                onClick={() => void onModeChange(nextMode)}
                type="button"
              >
                {nextMode === 'auto' ? 'Auto' : 'Manual'}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {devices.map((device) => (
          <DeviceControlCard
            device={device}
            isManual={isManual}
            key={device.key}
            onToggle={onDeviceToggle}
            pending={pending}
          />
        ))}
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        O Manual, den duoc bat/tat tuy y. Cac thiet bi gan voi canh bao chi
        mo khoa khi cam bien tuong ung dang bao bat thuong. Van gas khong duoc
        mo khi dang co GAS DANGER.
      </p>

      {controlError && (
        <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {controlError}
        </p>
      )}
    </section>
  )
}

function DeviceControlCard({
  device,
  isManual,
  onToggle,
  pending,
}: {
  device: DevicePanelItem
  isManual: boolean
  onToggle: (key: DeviceControlKey) => void | Promise<void>
  pending: boolean
}) {
  const toneClass = toneStyles[device.tone]
  const disabled = pending || !isManual || device.blocked
  const buttonLabel = !isManual
    ? 'Chuyen Manual'
    : device.blocked
      ? device.blockedLabel || 'Dang bi khoa'
      : device.active
        ? device.onAction
        : device.offAction

  return (
    <article
      className={cn(
        'flex min-h-44 flex-col rounded-lg border p-4',
        device.active ? toneClass.surface : 'border-white/10 bg-zinc-900/80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg', toneClass.icon)}>
            {device.icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5 text-white">{device.name}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {device.active ? device.onLabel : device.offLabel}
            </p>
          </div>
        </div>
        <span className={cn('shrink-0 rounded px-2 py-1 text-xs font-semibold', toneClass.badge)}>
          {device.active ? 'ON' : 'OFF'}
        </span>
      </div>

      <button
        className={cn(
          'mt-auto flex min-h-11 w-full items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
          device.active
            ? toneClass.surface
            : 'border-white/10 bg-zinc-950 text-zinc-200 hover:border-white/25',
        )}
        disabled={disabled}
        onClick={() => void onToggle(device.key)}
        type="button"
      >
        {buttonLabel}
      </button>
    </article>
  )
}

function HistoryPanel({ history }: { history: HistoryPoint[] }) {
  const temperatureLine = buildPolyline(
    history.map((point) => point.temperature),
    0,
    50,
  )
  const humidityLine = buildPolyline(
    history.map((point) => point.humidity),
    0,
    100,
  )
  const gasLine = buildPolyline(
    history.map((point) => point.gas),
    0,
    ADC_MAX,
  )

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Bieu do phien</h2>
          <p className="text-sm text-zinc-400">Toi da {MAX_HISTORY} mau gan nhat</p>
        </div>
        <Database className="size-5 text-zinc-500" />
      </div>

      <div className="mt-4 h-64 rounded-lg border border-white/10 bg-zinc-950 p-3">
        {history.length < 2 ? (
          <div className="grid h-full place-items-center text-sm text-zinc-500">
            Dang doi them du lieu tu Firebase
          </div>
        ) : (
          <svg className="h-full w-full" viewBox="0 0 100 56" role="img">
            <title>Lich su nhiet do, do am va gas</title>
            <line x1="0" x2="100" y1="48" y2="48" stroke="rgb(63 63 70)" strokeWidth="0.35" />
            <line x1="0" x2="100" y1="28" y2="28" stroke="rgb(39 39 42)" strokeWidth="0.25" />
            <line x1="0" x2="100" y1="8" y2="8" stroke="rgb(39 39 42)" strokeWidth="0.25" />
            <polyline points={humidityLine} fill="none" stroke="rgb(56 189 248)" strokeWidth="1.4" />
            <polyline points={temperatureLine} fill="none" stroke="rgb(52 211 153)" strokeWidth="1.4" />
            <polyline points={gasLine} fill="none" stroke="rgb(251 113 133)" strokeWidth="1.2" />
          </svg>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
        <LegendDot color="bg-emerald-400" label="Nhiet do" />
        <LegendDot color="bg-sky-400" label="Do am" />
        <LegendDot color="bg-rose-400" label="Gas" />
      </div>
    </section>
  )
}

function EventPanel({ events }: { events: TelemetryEvent[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Su kien</h2>
          <p className="text-sm text-zinc-400">Ghi nhan trong trinh duyet</p>
        </div>
        <Zap className="size-5 text-zinc-500" />
      </div>

      <div className="mt-4 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="grid h-40 place-items-center rounded-lg border border-dashed border-white/10 text-center text-sm text-zinc-500">
            Chua co thay doi trang thai
          </div>
        ) : (
          events.map((event) => <EventItem event={event} key={event.id} />)
        )}
      </div>
    </section>
  )
}

function EventItem({ event }: { event: TelemetryEvent }) {
  const tone =
    event.type === 'warning' ? 'rose' : event.type === 'success' ? 'emerald' : 'sky'
  const toneClass = toneStyles[tone]
  const time = new Date(event.timestamp).toLocaleTimeString('vi-VN', {
    hour12: false,
  })

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/70 p-3">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1 size-2 shrink-0 rounded-full', toneClass.dot)} />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-white">{event.message}</p>
          <p className="mt-1 text-xs text-zinc-500">{time}</p>
        </div>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn('size-2 rounded-full', color)} />
      {label}
    </span>
  )
}

function buildPolyline(values: number[], min: number, max: number) {
  if (values.length === 0) return ''

  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100
      const y = 50 - clamp((value - min) / (max - min), 0, 1) * 44
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

const toneStyles: Record<
  Tone,
  {
    badge: string
    bar: string
    dot: string
    icon: string
    surface: string
  }
> = {
  amber: {
    badge: 'bg-amber-500/15 text-amber-200',
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
    icon: 'bg-amber-500/15 text-amber-200',
    surface: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  },
  emerald: {
    badge: 'bg-emerald-500/15 text-emerald-200',
    bar: 'bg-emerald-400',
    dot: 'bg-emerald-400',
    icon: 'bg-emerald-500/15 text-emerald-200',
    surface: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
  },
  rose: {
    badge: 'bg-red-500/15 text-red-200',
    bar: 'bg-red-400',
    dot: 'bg-red-400',
    icon: 'bg-red-500/15 text-red-200',
    surface: 'border-red-400/40 bg-red-500/10 text-red-100',
  },
  sky: {
    badge: 'bg-sky-500/15 text-sky-200',
    bar: 'bg-sky-400',
    dot: 'bg-sky-400',
    icon: 'bg-sky-500/15 text-sky-200',
    surface: 'border-sky-400/40 bg-sky-500/10 text-sky-100',
  },
  zinc: {
    badge: 'bg-zinc-500/20 text-zinc-200',
    bar: 'bg-zinc-400',
    dot: 'bg-zinc-400',
    icon: 'bg-zinc-800 text-zinc-300',
    surface: 'border-white/10 bg-white/[0.04] text-zinc-100',
  },
}
