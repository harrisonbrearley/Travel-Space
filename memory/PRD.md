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

## Tech
- Frontend: Expo Router, React Query, expo-image, expo-image-picker, expo-file-system/legacy, expo-print + expo-sharing, @react-native-community/datetimepicker, @react-native-vector-icons/material-design-icons, react-native-webview + Leaflet + OpenStreetMap
- Backend: FastAPI + Motor (MongoDB), httpx (Nominatim + open.er-api.com proxies), emergentintegrations (gpt-5.4 text + vision, Gemini Nano Banana for one-off asset generation)
- Design: iOS-native clean aesthetic with sage green brand

## Key API Endpoints
- CRUD `/api/trips`, `/api/trips/{id}` (now includes `currency`)
- Sub-items: `/api/trips/{id}/{flights|transport|stays|attractions|tickets}` and `PATCH/DELETE /api/{kind}/{id}` (each has `cost_currency`, attractions has `notes`)
- `GET /api/geocode?q=` (Nominatim proxy)
- `GET /api/reverse-geocode?lat=&lon=`
- `GET /api/exchange-rates?base=USD` (6-hour cache)
- `POST /api/ai/parse-flight` (text-only, legacy)
- `POST /api/ai/parse-booking` (text OR image_base64; currency-aware)
- `GET /api/public/trips/{share_id}` (public read-only feed)
