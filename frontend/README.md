# Smart Home Wokwi Dashboard

Dashboard realtime cho mô hình nhà thông minh ESP32 trên Wokwi. ESP32 đọc DHT22, MQ-2, LDR và nút mưa, sau đó PUT dữ liệu lên Firebase Realtime Database. Web app TanStack Start lắng nghe Firebase và hiển thị trạng thái cảm biến, cảnh báo gas, mưa, đèn và còi.

## Firebase Path

Sketch ESP32 ghi dữ liệu vào:

```text
/smarthome/current
```

Object hiện tại:

```json
{
  "temperature": 25.4,
  "humidity": 61.2,
  "gas": 1850,
  "light": 1600,
  "rain": 0,
  "lamp": 1,
  "gasWarning": 0
}
```

## Features

- Theo dõi realtime nhiệt độ, độ ẩm, gas MQ-2 và ánh sáng LDR.
- Hiển thị trạng thái mưa, đèn LED và còi báo.
- Cảnh báo khi gas vượt ngưỡng `2000` ADC.
- Lưu lịch sử phiên trong trình duyệt để vẽ biểu đồ nhanh.
- UI responsive cho desktop và mobile.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start, React 19, Vite 7 |
| Styling | Tailwind CSS 4 |
| Database | Firebase Realtime Database |
| Icons | Lucide React |
| Hardware | ESP32 Wokwi |

## Run Web App

```bash
npm install
npm run dev
```

Dev server chạy tại:

```text
http://localhost:3000
```

## Environment Variables

Tạo `.env` từ `.env.example` và điền Firebase config:

```bash
cp .env.example .env
```

Biến bắt buộc:

```text
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## ESP32 Wokwi

Các file Wokwi nằm trong `esp32/`:

```text
esp32/
  smart_home.ino
  diagram.json
  libraries.txt
```

### Pins

| Part | GPIO |
|------|------|
| DHT22 SDA | 4 |
| MQ-2 AOUT | 34 |
| LDR AO | 35 |
| Rain button | 18 |
| LED | 2 |
| Buzzer | 15 |

### Thresholds

```cpp
const int gasThreshold = 2000;
const int lightThreshold = 2000;
```

- `gas > 2000` bật cảnh báo gas và còi.
- `light < 2000` bật LED.
- Nút mưa nối `INPUT_PULLUP`, nhấn nút thì `rain = 1`.

## Build

```bash
npm run typecheck
npm run build
```

## Project Structure

```text
esp32/
  smart_home.ino
  diagram.json
  libraries.txt
src/
  components/
    SmartHomeDashboard.tsx
  lib/
    firebase.ts
    database.ts
    types.ts
  routes/
    __root.tsx
    index.tsx
  styles.css
```
