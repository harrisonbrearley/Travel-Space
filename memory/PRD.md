# Travel Space — Travel Planning App (PRD)

## Overview
Single-user travel companion for planning trips (Upcoming/Past/Wishlist) with per-trip flights, transport, stays, attractions, tickets, budget, auto-generated itinerary and map, shareable read-only trip links, AI-powered booking imports, currency conversion, and one-tap PDF export.

## Features
- **Branding**: Named "Travel Space" with a black-hole "TS" monogram app icon that pulls in travel category icons
- Home shows the tagline "Travel itinerary made easy — bring all your bookings to one Travel Space." plus a help button that opens a full feature guide
- Trips list (Upcoming/Past/Wishlist) with cover-photo cards, live countdown ("Leaves in X days"), and a Travel Space cover graphic as the default when no photo is uploaded
- Create/edit/delete trip; upload cover photo from device; pick a **trip currency**
- Trip detail hub with 8 tabs: **Itinerary** (default), **Map**, Flights, Transport, Stay, Attractions, Tickets, Budget
- Every location field has **address autocomplete** (OpenStreetMap Nominatim) plus a **map-pin fallback** (Leaflet WebView)
- **Map tab** plots the trip chronologically with numbered pins + dashed polyline, and now has toggle chips (Flights / Transport / Stay / Attractions) to hide categories
- **Per-item currency**: Cost fields on every item (flights, transport, stays, attractions, tickets) have a currency picker (30+ currencies)
- **Currency-aware Budget**: Every item's cost is auto-converted to the trip's currency at today's rate (free open.er-api.com); a mixed-currency badge appears when applicable
- **Auto-import booking**: paste text OR upload a screenshot; LLM vision (gpt-5.4) classifies as flight/transport/stay/attraction and creates the item + linked ticket with the correct currency
- Booking status on every item: Booked / Not Booked / Pay on Arrival
- **Bidirectional ticket link**: "View ticket" chip on item cards, "View <category>" on ticket cards, jumps tab + highlights the focused card
- **Attractions notes**: added a multiline notes field for tips, dress code, meeting point etc; also shows a preview on the card
- **Share Trip sheet**: pick exactly what to include (flights/transport/stays/attractions/tickets/costs/map) then Copy link, Share, or **Export as PDF**
- **PDF export**: expo-print renders a beautiful A4 multi-page PDF (cover, day-by-day itinerary, budget, tickets grid) that respects the share toggles and converts costs to the trip currency
- **Public share page** (`/share/[shareId]`): read-only web view honouring the same toggles, with a live route map on native and a "open on phone for map" hint on web
- **Guest / offline mode**: "Continue without signing in" on the login screen persists all trips + sub-items in AsyncStorage; a "Guest mode" banner on Home offers sign-in upsell
- **Offline-tolerant signed-in mode**: server-mirror in AsyncStorage + a NetInfo-driven sync queue keep the app fully usable when the network drops. Edits are optimistically rendered, queued to `ts:syncqueue:v1`, and replayed FIFO the moment connectivity returns. 4xx/409/410 errors are recorded in a dismissable "N changes couldn't be applied" toast; everything else retries automatically.
- **Import Guest Trips**: after Google sign-in, a one-time modal offers to move every guest trip (and its sub-items) into the account, discarding the guest store when done. Uses the new idempotent client-provided-id create endpoints so ids are preserved across the migration.
- **Documents tab (9th tab)**: attach photos or PDFs that don't fit any other category; each doc can be optionally linked to any flight/transport/stay/attraction/ticket
- **PDF booking auto-import**: AutoAddSheet accepts PDFs (server extracts text with pypdf before feeding GPT); tickets can attach photo OR PDF
- **Collaboration invites**: the Share sheet now offers three modes — Read-only link, Invite to trip (real-time sync via `collaborators` on the trip), Send a copy (deep-clones trip + sub-items with UUID remap preserving ticket ↔ item links). Owner can revoke or a collaborator can leave.
- **Promo video**: 12s Sora 2 render at 1280x720 shipped in `/app/frontend/assets/marketing/promo.mp4`

## Tech
- Frontend: Expo Router, React Query, expo-image, expo-image-picker, expo-document-picker, expo-file-system/legacy, expo-print + expo-sharing, @react-native-community/datetimepicker, @react-native-async-storage/async-storage, @react-native-community/netinfo, @react-native-vector-icons/material-design-icons, react-native-webview + Leaflet + OpenStreetMap
- Backend: FastAPI + Motor (MongoDB), pypdf, httpx (Nominatim + open.er-api.com proxies), emergentintegrations (gpt-5.4 text + vision, Gemini Nano Banana for one-off asset generation, Sora 2 for the promo video)
- Design: iOS-native clean aesthetic with sage green brand

## Key API Endpoints
- CRUD `/api/trips`, `/api/trips/{id}` (includes `currency`, `collaborators`)
- Sub-items: `/api/trips/{id}/{flights|transport|stays|attractions|tickets|documents}` and `PATCH/DELETE /api/{kind}/{id}` (all now do TRUE partial updates)
- `GET /api/documents/{id}` returns the single document with `file_base64` blob
- `POST /api/trips/{id}/invites` `{mode: collab|copy}` → token
- `GET  /api/invites/{token}` public preview
- `POST /api/invites/{token}/accept` (auth) → for collab: adds user to collaborators; for copy: returns new trip_id
- `DELETE /api/trips/{id}/collaborators/{user_id}` owner-revoke or self-leave
- `GET /api/geocode?q=` (Nominatim proxy)
- `GET /api/reverse-geocode?lat=&lon=`
- `GET /api/exchange-rates?base=USD` (6-hour cache)
- `POST /api/ai/parse-flight` (text-only, legacy)
- `POST /api/ai/parse-booking` (text, image, or PDF via pypdf; currency-aware)
- `GET /api/public/trips/{share_id}` (public read-only feed)
