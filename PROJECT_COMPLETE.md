# FamilyGuard Parental Control App

## Current status

The original proof of concept has been upgraded into a **secure, consent-based parental-control MVP foundation** with three components:

- `backend/` — Node.js, Express and MongoDB API
- `admin-app/` — React/Vite parent dashboard
- `client-app/` — React Native Android enrolled-device client

> Important: credentials previously written in this document must be considered compromised. Rotate the MongoDB password, JWT secret, Agora certificate and any related keys before running or deploying the system. Real secrets belong only in untracked `.env` files.

## Implemented

### Security and accounts
- Parent registration, login, current-session and logout APIs
- Password hashing and JWT validation with session revocation versioning
- Helmet, CORS allow-list, request-size limits and API rate limiting
- Protected device and streaming routes
- Parent ownership checks on all enrolled-device resources
- Environment template at `backend/.env.example`

### Multi-device management
- Enroll, list, inspect, rename, enable/disable monitoring and revoke devices
- Case-consistent 10-character device identifiers
- Device heartbeat, last-seen and permission/status metadata
- Per-device screen-time policy, bedtime, app limits, location/usage sharing flags and safe command allow-list
- Safe command queue and audit history

### Parent dashboard
- Parent sign-up/sign-in and protected routes
- Multi-device dashboard
- Device overview, screen-time settings, location/usage summaries and command history
- Safe remote actions: status refresh, ring, location refresh, visible live-session request, policy sync and session end
- Authenticated Agora live-view flow

### Android client
- Session restoration and enrolled-device persistence
- Authenticated API requests and heartbeat foundation
- Camera/microphone permissions requested without unused contacts access
- Visible user approval button for live monitoring
- Foreground-service and reboot-recovery native foundations with persistent notification
- Permission review and clear Android distribution limitations
- Agora App ID obtained from backend token response rather than hardcoded certificate material

### Data APIs
- Location events (only while policy allows sharing)
- Aggregated app-usage snapshots (only while policy allows sharing)
- Device policies and commands

## Consent and platform rules

This application does not implement covert monitoring. Camera, microphone, screen sharing and location collection must be visible, permission-based and revocable.

- **Screen sharing/recording:** Android MediaProjection must show its system confirmation for each required session. No hidden capture is permitted.
- **App usage:** Requires the user to grant Usage Access in Android settings.
- **App blocking:** Reliable enforcement requires Android managed-device/device-owner deployment. Standard Play Store installs should use reminders and alerts.
- **SMS and call logs:** Restricted by Google Play policy. They remain disabled in standard builds and may only be developed for an eligible managed/enterprise distribution with explicit consent and legal review.
- **Boot restore:** Only restores a service the device user explicitly enabled; it must not silently activate camera, microphone or screen capture.

## Setup

1. Copy `backend/.env.example` to `backend/.env` and provide newly rotated credentials.
2. Install and run the backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
3. Configure `admin-app/.env` with `VITE_BACKEND_URL`, then run:
   ```bash
   cd admin-app
   npm install
   npm run dev
   ```
4. Configure the Android client's backend URL for emulator, LAN or staging in `client-app/src/services/api.js`, then run Metro and Android from `client-app/`.

## API summary

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/devices`, `POST /api/devices/enroll`
- `GET|PATCH|DELETE /api/devices/:deviceId`
- `POST /api/devices/:deviceId/heartbeat`
- `PUT /api/devices/:deviceId/policy`
- `GET|POST /api/devices/:deviceId/commands`
- `GET|POST /api/devices/:deviceId/locations`
- `GET|POST /api/devices/:deviceId/usage`
- `GET /api/stream/verify/:deviceId`
- `GET /api/stream/token/admin/:deviceId`
- `GET /api/stream/token/client/:deviceId`

All device and stream APIs require a valid parent bearer token and ownership. Admin live tokens additionally require monitoring to be enabled and an accepted, unexpired visible live-session request.

## Remaining production work

The following require provider credentials, physical Android validation, or a selected distribution model and therefore are not claimed complete:

- Firebase Cloud Messaging credentials and production push delivery
- Full native UsageStats collection and managed-device enforcement
- Full MediaProjection screen stream implementation and optional encrypted recording retention
- Background location implementation with tested retention/deletion controls
- Managed-distribution SMS/call-log adapter (not allowed in standard build)
- Cloud hosting, HTTPS domain/certificate, observability and backups
- Android signing, Play data-safety declaration and privacy-policy publication
- Complete physical-device end-to-end and network interruption test matrix

## Definition of production-ready

Do not label the product production-ready until backend tests, admin lint/build/tests, mobile tests, Android debug/release builds, physical-device enrollment, permission denial/revocation, network loss, token expiry, multiple devices, and live-session approval/rejection all pass with newly rotated secrets and HTTPS.
