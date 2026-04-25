# AquaPin Field - Mobile App

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── DatabaseProvider.tsx
│   ├── NetworkStatus.tsx
│   └── SyncButton.tsx
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Supabase auth
├── hooks/               # Custom hooks
│   └── useOfflineData.ts
├── navigation/          # Navigation setup
│   └── AppNavigator.tsx
├── screens/             # App screens
│   ├── LoginScreen.tsx
│   ├── MapScreen.tsx
│   ├── DataEntryScreen.tsx
│   ├── SyncScreen.tsx
│   ├── ReportScreen.tsx
│   └── ProfileScreen.tsx
├── db/                  # Database layer
│   ├── index.ts
│   ├── models.ts
│   ├── schema.ts
│   └── sync.ts
└── config/              # Configuration
    └── index.ts
```

## Environment Variables

Create `.env` file:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Optional. Defaults to aquapin://auth/callback for standalone email confirmation links.
EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL=aquapin://auth/callback
```

## Supabase Auth Email Redirects

For standalone signup confirmation links, configure Supabase Auth URL settings:

1. Set **Site URL** to your production web/app landing URL, not `http://localhost:3000`.
2. Add `aquapin://auth/callback` to **Redirect URLs**.
3. If you override `EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL`, add that exact value to **Redirect URLs** too.

## Standalone Map Troubleshooting

If the map works in Expo Go but shows a white screen in a standalone build, check:

1. **Google Cloud APIs**: Enable **Maps SDK for Android** (and **Maps SDK for iOS** if using Google provider on iOS).
2. **API key restrictions**: For Android app restrictions, add:
   - package name: `com.aquapin.mobile`
   - SHA-1 fingerprint used to sign the build (debug, EAS upload key, and Play App Signing key if published)
3. **Rebuild app** after key or restriction changes.

## Running the App

```bash
# Install dependencies
npm install

# Start Metro
npm start

# Start Metro for a native development client
npm run start:dev-client

# Regenerate native android/ios folders from app.json
npm run prebuild

# Clean and fully regenerate native folders
npm run prebuild:clean

# Run on Android
npm run android

# Run on iOS
npm run ios
```

## EAS Standalone Builds

This app is configured for Expo prebuild / CNG standalone builds.

- `ios/` and `android/` are treated as generated native folders.
- EAS uploads only the Expo app source and runs prebuild from `app.json`.
- `preview` and `production` produce standalone builds, not Expo Go bundles.

Use EAS from the mobile app workspace so the existing `apps/mobile/eas.json` profiles are applied.

```bash
# from repo root
npm run mobile:eas:build:android:preview

# Android production AAB
npm run mobile:eas:build:android:production

# iOS production build
npm run mobile:eas:build:ios:production
```

Or run directly inside `apps/mobile`:

```bash
npm run eas:build:android:preview
npm run eas:build:android:production
```

Notes:

1. Run `npx eas-cli login` first if you are not already authenticated to Expo/EAS.
2. `preview` builds an Android APK for testing and direct install.
3. `production` builds an Android App Bundle (`.aab`) for Play Store release.
4. `.easignore` is configured so EAS skips generated `ios/` and `android/` folders and uses Expo prebuild in the cloud.
5. If the build needs cloud env vars, define them in EAS or keep the required `EXPO_PUBLIC_*` values available to the build.

## Supabase Edge Functions

Deploy the edge functions:

```bash
# Deploy AI Reports function
supabase functions deploy ai-reports

# Deploy Verify Data function
supabase functions deploy verify-data
```

## Offline-First Architecture

1. **Local Database**: WatermelonDB with SQLite
2. **Sync Queue**: Changes queued locally when offline
3. **Conflict Resolution**: Server timestamp wins
4. **Background Sync**: Auto-sync when online

## Data Flow

```
Field Staff (Mobile)
    ↓
[Offline Storage] → WatermelonDB (SQLite)
    ↓
[Sync When Online] → Supabase
    ↓
[Admin Dashboard] → Real-time data
```
# Aquapin

Aquapin is an aquaculture management system built as a monorepo. It combines an offline-first mobile app for field operations, a web-based admin console, shared TypeScript models, and Supabase-backed authentication, data storage, and serverless functions.

## System Overview

The system is split into four main parts:

- `apps/mobile`: Expo React Native app for field staff
- `apps/web`: Next.js admin console
- `packages/shared`: shared TypeScript types used across apps
- `supabase`: SQL schema, RLS policies, templates, and edge functions

Core capabilities already represented in the codebase include:

- pond registration and geospatial location capture
- stocking, mortality, and harvest records
- pond history tracking
- offline data entry with local persistence
- sync queue monitoring and manual sync
- field staff authentication and role-based access control
- admin dashboard and typed settings management

## Architecture

```text
Field Staff Mobile App
  -> local database / offline queue
  -> sync engine
  -> Supabase Postgres + Auth + RLS
  -> Admin Web Console

Shared package
  -> typed database and admin models reused by web code
```

## Repository Structure

```text
.
├── apps/
│   ├── mobile/          Expo mobile app for field operations
│   └── web/             Next.js admin console
├── packages/
│   └── shared/          Shared TypeScript types
├── supabase/
│   ├── functions/       Edge functions
│   ├── templates/       Auth/email templates
│   └── *.sql            Schema and policy scripts
└── package.json         Workspace scripts
```

## Main Modules

### Mobile app

The mobile application is designed for field use and local-first workflows. Current modules in the codebase include:

- authentication and protected navigation
- pond mapping and pond creation
- stocking, mortality, and harvest logging
- pond history and record review
- sync status and queue visibility
- profile, notification, security, and export settings
- AI assistant/reporting screens

Implementation notes:

- built with Expo and React Native
- uses WatermelonDB when available, with an AsyncStorage-backed mock fallback for Expo Go compatibility
- uses Supabase for auth and remote persistence

### Web admin console

The web app is a Next.js admin interface focused on system oversight and governance. Current pages and services include:

- landing page
- login and reset password flow
- admin dashboard with operational overview
- admin settings editor with audit trail

### Shared package

`packages/shared` exports database and admin types so the web app can work against a typed Supabase schema.

### Supabase backend

The `supabase/` directory contains:

- SQL schema setup scripts
- RLS and access-control updates
- admin settings RPC support
- email templates
- edge functions for AI reports and sync/data verification

## Prerequisites

- Node.js 20+ recommended
- npm with workspace support
- Expo CLI tooling through project scripts
- a Supabase project
- Android Studio and/or Xcode if you want native mobile builds

## Environment Variables

### Web app

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

The repository already includes `apps/web/.env.example` as a starting point.

### Mobile app

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_MAPS_API_KEY=your-maps-api-key
EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL=aquapin://auth/callback
```

Required mobile variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional mobile variables:

- `EXPO_PUBLIC_MAPS_API_KEY`
- `EXPO_PUBLIC_AUTH_EMAIL_REDIRECT_URL`

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Set up your Supabase project and apply the SQL scripts in `supabase/`.

Recommended order:

1. `supabase/step1_schema.sql`
2. `supabase/step2_rls_policies_fix.sql`
3. `supabase/step3_schema_upgrade.sql`
4. `supabase/step4_settings_schema.sql`
5. `supabase/step5_admin_access_schema.sql`
6. `supabase/step6_profile_repair.sql`
7. `supabase/step7_account_scoped_rls.sql`

If you are using the consolidated setup script, review `supabase/full_setup_safe.sql`.

### 3. Run the web app

From the repo root:

```bash
npm run web:dev
```

Other web commands:

```bash
npm run web:build
npm run web:typecheck
npm run web:lint
```

### 4. Run the mobile app

From `apps/mobile`:

```bash
npm start
```

Useful mobile commands:

```bash
npm run android
npm run ios
npm run start:dev-client
npm run prebuild
npm run prebuild:clean
```

## EAS Build Commands

From the repo root:

```bash
npm run mobile:eas:build:android:preview
npm run mobile:eas:build:android:production
npm run mobile:eas:build:ios:production
```

## Supabase Edge Functions

Available functions:

- `supabase/functions/ai-reports`
- `supabase/functions/verify-data`

Deploy with:

```bash
supabase functions deploy ai-reports
supabase functions deploy verify-data
```

## Authentication and Access Model

The system uses Supabase Auth with profile and role data stored in `public_profiles`.

Roles in the current schema:

- `admin`
- `field_staff`

Admin-related backend support includes:

- typed admin settings storage
- admin settings audit history

## Offline-First Data Flow

The mobile app is structured around offline-first operation:

1. field staff records data locally
2. changes are queued when offline
3. the sync module retries when connectivity returns
4. Supabase becomes the shared source for cross-device/admin visibility

Tracked operational entities in the current codebase include:

- ponds
- stocking logs
- mortality logs
- harvests
- pond history

## Notes

- `apps/mobile/README.md` contains older mobile-specific implementation notes.
- Some repository areas still contain legacy naming or prototype logic, especially in marketing copy and edge-function internals. Treat this root README as the system-level guide to the current intended structure.
