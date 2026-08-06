# Recco

Recco is a cross-media tracker for films, TV, books, and music. This repository currently contains the mobile UI prototype and a secure integration boundary for TMDB.

## Run locally

```powershell
npm install
npm run start
```

Use `npm run android` for an Android emulator, `npm run web` for browser preview, or scan the Expo QR code with Expo Go.

## Project structure

```text
App.tsx                         # Current application shell and screens
src/config/env.ts               # Public, non-secret runtime configuration
src/services/media.ts           # App-to-backend media API client
src/types/media.ts              # Shared media types
supabase/functions/tmdb-search/ # Server-only TMDB proxy
assets/                         # App icons and static assets
```

## TMDB setup

1. Create a Supabase project.
2. Add `TMDB_READ_ACCESS_TOKEN` as a Supabase Edge Function secret.
3. Deploy `supabase/functions/tmdb-search`.
4. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to your Edge Functions URL.

Never add a TMDB credential to `.env`, `app.json`, or client-side TypeScript.

## Checks and builds

```powershell
npm run check
npm run export:web
```

`npm run export:web` writes a static site into `dist/`, which Vercel can deploy. `eas.json` is included for future Android/iOS preview and production builds.

Before an App Store or Google Play production build, choose and add your final `ios.bundleIdentifier` and `android.package` values in `app.json`. These identifiers cannot be casually changed after public release.
