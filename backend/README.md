# Smart Home MQTT Backend

Backend nay dong vai tro middleware trong kien truc IoT 4 lop:

- Subscribe MQTT tu ESP32.
- Ghi du lieu cam bien vao Firebase Realtime Database path `smarthome/current`.
- Ghi canh bao vao `smarthome/logs`.
- Cung cap API cho dashboard React doi mode va dieu khien rieng den chinh GPIO2.
- Cac LED canh bao rain/motion/gas/temp do ESP32 tu dong bat/tat theo cam bien, khong dieu khien thu cong tu dashboard.

## Cai dat

```bash
cd backend
npm install
copy .env.example .env
copy serviceAccountKey.example.json serviceAccountKey.json
npm run dev
```

Sau do mo file `.env` va `serviceAccountKey.json`, dien thong tin Firebase Admin SDK that.

## MQTT topics

ESP32 publish:

- `smarthome/sensors/data`
- `smarthome/devices/status`
- `smarthome/alerts`

ESP32 subscribe:

- `smarthome/mode/control`
- `smarthome/devices/control`

## API

```http
GET /api/current
POST /api/control
POST /api/mode
```

Vi du doi manual mode:

```bash
curl -X POST http://localhost:4000/api/mode ^
  -H "Content-Type: application/json" ^
  -d "{\"mode\":\"manual\"}"
```

Vi du bat den chinh:

```bash
curl -X POST http://localhost:4000/api/control ^
  -H "Content-Type: application/json" ^
  -d "{\"lamp\":1}"
```

`POST /api/control` chi nhan field `lamp` va chi hop le khi mode hien tai la `manual`.
Cac field `rainLed`, `motionLed`, `gasLed`, `tempLed` khong con la lenh dieu khien vi chung la LED canh bao tu dong.
