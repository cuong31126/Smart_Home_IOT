# AGENTS.md

## Project Overview

Smart Home IoT Dashboard — a capstone student project. A TanStack Start (React + Vite) application that displays and controls smart home devices in real time via Firebase Realtime Database. An ESP32 microcontroller acts as the hardware layer, reading sensors and actuating devices based on commands stored in Firebase.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start |
| Frontend | React 19, TanStack Router v1 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Realtime DB | Firebase Realtime Database |
| Icons | Lucide React |
| Language | TypeScript 5.7 (strict mode) |
| Deployment | Netlify |
| Hardware | ESP32 (Arduino sketch) |

## Directory Structure

```
esp32/
  smart_home.ino       # Arduino sketch for ESP32 hardware client
src/
  components/
    SmartHomeDashboard.tsx  # Main dashboard UI (all sections in one file)
  lib/
    firebase.ts        # Firebase app + db initialization (reads VITE_ env vars)
    database.ts        # Firebase RTDB helpers: subscribe, setDevice, addLog
    types.ts           # TypeScript interfaces: SmartHomeState, Sensors, Devices
  routes/
    __root.tsx         # Root HTML shell + TanStack Router setup
    index.tsx          # Route "/" → renders SmartHomeDashboard
  styles.css           # Tailwind CSS 4 global import
  router.tsx           # TanStack Router instance
.env.example           # Template for Firebase env vars (never commit .env)
README.md              # Setup guide (Firebase, ESP32, Netlify deploy)
```

## Key Architectural Decisions

### Firebase as the single source of truth
All state (sensors, devices, mode, logs) lives in Firebase RTDB. The dashboard reads from and writes to Firebase — no local state drives device status. `subscribeToState()` in `database.ts` attaches a single root-level `onValue` listener.

### Automation runs client-side
When `mode === 'auto'`, the dashboard compares current vs. previous sensor state and calls `setDevice()` / `addLog()` to update Firebase. For production, consider moving automation to a Firebase Cloud Function.

### Environment variables
All Firebase config is injected at build time via Vite's `import.meta.env.VITE_*` mechanism. The `.env` file is git-ignored; `.env.example` documents required keys.

### No backend / no Netlify Functions
Pure static front-end that talks directly to Firebase RTDB. Netlify is used only for static hosting.

## Firebase Data Structure

```json
{
  "sensors": { "motion": false, "gas": false, "rain": false },
  "devices": { "light": false, "fan": false, "window": false, "roof": false },
  "mode": "auto",
  "logs": { "<push_id>": { "message": "...", "timestamp": 0, "type": "info" } }
}
```

## Coding Conventions

- Components: PascalCase files and function names
- Utilities: camelCase
- `cn()` is a local helper (not a library) for conditional class merging
- Tailwind CSS 4 utility classes; dark theme via `bg-slate-900` base
- TypeScript strict mode; `type` keyword for type-only imports
- No comment blocks — names and types are self-documenting

## File-Based Routing (TanStack Router)

Routes are defined by files in `src/routes/`:
- `__root.tsx` — root layout wrapping all pages
- `index.tsx` — route for `/`
- `api.*.ts` — server API endpoints

## Development Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build → dist/client
```

## Adding Features

- **New sensor**: add field to `Sensors` in `types.ts`, update ESP32 sketch, add `SensorCard` in `SmartHomeDashboard.tsx`
- **New device**: add field to `Devices`, add `DeviceCard`, add automation rule in `runAutomation()`
- **Auth**: add Firebase Auth; wrap `subscribeToState` with auth guard; update RTDB security rules
