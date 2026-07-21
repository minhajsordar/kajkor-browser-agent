# Device Activation & Desktop App Startup Flow — Implementation Plan

## Goal

Implement the complete device activation lifecycle:
1. **Web (api-inventory)**: Super-admin UI to create/manage device activation codes per shop/branch
2. **Desktop (desktop-app)**: Activation screen on first launch → initial data sync → local login → offline operation

---

## Current State Summary

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| **Backend: `DeviceActivation` model** | ✅ Done | `backend/modules/device-activation/device-activation-model.js` — Mongoose schema with `activationCode`, `deviceId`, `status`, `shopId`, `branchId`, `branchName`, `apiToken` |
| **Backend: Activation controller** | ✅ Done | `device-activation-controller.js` — `generateCode`, `getCodes`, `revokeCode`, `activateDevice`, `verifyDevice` |
| **Backend: Device routes** | ✅ Done | `/api/device/activate` (POST), `/api/device/verify` (POST) |
| **Backend: Activation management routes** | ✅ Done | `/api/device-activation/` (GET), `/api/device-activation/generate` (POST), `/api/device-activation/:id` (DELETE) |
| **Desktop: `ActivationService`** | ✅ Done | `src/main/sync/activation-service.ts` — calls API, stores activation, triggers initial sync |
| **Desktop: `ApiClient`** | ✅ Done | `src/main/sync/api-client.ts` — `activateDevice`, `verifyDevice`, `syncExchange`, `initialSync` |
| **Desktop: `DeviceInfoRepository`** | ✅ Done | `src/main/database/repositories/device-info-repository.ts` — SQLite CRUD for device_info table |
| **Desktop: IPC handlers** | ✅ Done | `activation:activate`, `activation:verify`, `device:getInfo`, `device:isActivated` — all wired up |
| **Desktop: Preload API** | ✅ Done | `window.api.activation.activate(code)`, `window.api.device.isActivated()` exposed to renderer |
| **Desktop: SyncEngine** | ✅ Done | Full sync exchange + initial sync logic |

### What's Missing

| Component | Status | What's Needed |
|-----------|--------|---------------|
| **Backend: Routes NOT registered in main router** | ❌ Missing | `device-activation` and `device` routes not added to `routes/routes.js` — API endpoints are unreachable! |
| **Backend: `protect` middleware not applied** | ❌ Missing | Activation management routes should require super-admin auth |
| **Web Frontend: Device Management pages** | ❌ Missing | No super-admin UI to generate/view/revoke activation codes |
| **Web Frontend: Routes for device management** | ❌ Missing | No routes in `router/index.js` for device pages |
| **Web Frontend: Sidebar menu link** | ❌ Missing | No "Device Management" entry in `superAdminSidebarMenuLinks.js` |
| **Desktop: Activation screen (Vue page)** | ❌ Missing | No page that shows activation UI on first launch |
| **Desktop: Login screen (local auth)** | ❌ Missing | No local login after activation (users table has `passwordHash` but no login flow) |
| **Desktop: Router guard** | ❌ Missing | No navigation guard to redirect to activation/login when needed |
| **Desktop: Router mode broken** | ❌ Broken | Uses `createWebHistory` which fails in Electron's file:// protocol — needs `createWebHashHistory` |

---

## Proposed Changes

### Component 1: API Backend — Register Routes

#### [MODIFY] [routes.js](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/api-inventory/backend/routes/routes.js)

- Import `deviceActivationRoutes` and `deviceRoutes`
- Add to routes array:
  - `/device-activation` → `deviceActivationRoutes`
  - `/device` → `deviceRoutes`

#### [MODIFY] [device-activation-routes.js](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/api-inventory/backend/modules/device-activation/device-activation-routes.js)

- Add `checkPermission` middleware (super-admin auth) to management routes (`GET /`, `POST /generate`, `DELETE /:id`)

---

### Component 2: Web Frontend — Super Admin Device Management UI

#### [NEW] `frontend/src/pages/super-admin/device-activation/DeviceActivationView.vue`

Device activation code management page with:
- **Generate New Code**: Form with shop/branch selectors → POST `/api/device-activation/generate`
- **Codes Table**: List all activation codes with columns: Code, Branch, Status (pending/activated/revoked), Created, Device Name
- **Actions**: Copy code, Revoke code
- Status badges: Green = activated, Yellow = pending, Red = revoked

#### [MODIFY] [superAdminSidebarMenuLinks.js](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/api-inventory/frontend/src/constants/superAdminSidebarMenuLinks.js)

Add "Device Management" menu with sub-items:
- "Activation Codes" → `/super-admin/device-activation`

#### [MODIFY] [router/index.js](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/api-inventory/frontend/src/router/index.js)

Add route under `/super-admin` children:
- `device-activation` → `DeviceActivationView.vue`

---

### Component 3: Desktop App — Activation & Login Screens

#### [NEW] `src/renderer/src/pages/DeviceActivationView.vue`

Full-screen activation page with:
- Server URL input (default: `http://localhost:5004`)
- Activation code input (large, centered)
- Optional device name input
- "Activate" button → calls `window.api.activation.activate(code, deviceName)`
- Progress indicator during activation + initial sync
- Error display with retry
- Success → redirect to login page

#### [NEW] `src/renderer/src/pages/LocalLoginView.vue`

Local login page (works offline):
- Email + password input
- Authenticates against local SQLite `users` table
- On success, stores user session in Pinia store + localStorage
- Redirects to dashboard

#### [MODIFY] [desktop router/index.js](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/desktop-app/src/renderer/src/router/index.js)

- **Fix**: Change `createWebHistory` → `createWebHashHistory` (critical for Electron)
- Add `/activate` route → `DeviceActivationView.vue`
- Add `/local-login` route → `LocalLoginView.vue`
- Add navigation guard: 
  - If device not activated → redirect to `/activate`
  - If device activated but not logged in → redirect to `/local-login`
  - Otherwise → allow navigation

---

### Component 4: Desktop App — Local Auth IPC

#### [NEW] `src/main/ipc/auth-handlers.ts`

New IPC handlers for local authentication:
- `auth:localLogin` — validates email + passwordHash against SQLite users table
- `auth:getSession` — returns current logged-in user info
- `auth:logout` — clears session

#### [MODIFY] [preload/index.ts](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/desktop-app/src/preload/index.ts)

Add `auth` namespace to window.api:
- `auth.localLogin(email, password)`
- `auth.getSession()`
- `auth.logout()`

#### [MODIFY] [ipc/index.ts](file:///Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/desktop-app/src/main/ipc/index.ts)

Register the new auth handlers

---

## Open Questions

> [!IMPORTANT]
> 1. **Password verification**: The web backend stores user passwords as bcrypt hashes. Should desktop login use bcrypt verification (requires adding `bcryptjs` dependency), or a simpler comparison?
> 2. **Server URL**: Should the default server URL be `http://localhost:5004` for local dev, or the production URL `https://easypos.softrking.com`? Should it be configurable by the user during activation?
> 3. **Shop/Branch selector**: For the super-admin code generation form — should it show all shops with their branches, or just branches?

---

## Verification Plan

### Automated Tests  
- Start API backend → `POST /api/device-activation/generate` with valid shopId/branchId → verify 201 response with code
- Start API backend → `POST /api/device/activate` with valid code → verify 200 response with branchId/apiToken
- Run desktop app in dev mode → verify activation screen appears on first launch

### Manual Verification
1. **Web**: Log into super-admin panel → navigate to Device Management → generate code → see it in table → copy code
2. **Desktop**: Launch app → see activation screen → enter code → watch initial data sync progress → see login page
3. **Desktop Login**: Enter credentials → verify login works → see dashboard with synced data
4. **Offline**: Disconnect network → restart desktop app → verify local login still works → verify data is accessible
