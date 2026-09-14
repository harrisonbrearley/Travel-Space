# WanderPlan — Travel Planning App (PRD)

## Overview
Simple, single-user travel companion for planning trips (Upcoming/Past/Wishlist) with per-trip flights, transport, stays, attractions, tickets, budget, auto-generated itinerary and map, plus shareable read-only trip links and AI-powered booking imports.

## Features
- Trips list (Upcoming/Past/Wishlist) with cover-photo cards and **live countdown** ("Leaves in X days") on upcoming trips
- Create/edit/delete trip; upload cover photo from device
- Trip detail hub with 8 tabs: **Itinerary** (default), **Map**, Flights, Transport, Stay, Attractions, Tickets, Budget
- Every item form has **address autocomplete** (OpenStreetMap Nominatim) plus a **map-pin fallback** modal (Leaflet)
- Item coordinates power the **Map tab** — chronological route with numbered markers and dashed polyline
- **Auto-import booking**: paste text OR upload a screenshot; LLM vision classifies it as flight/transport/stay/attraction and creates the item + linked ticket
- Flights: AI text auto-fill still available, multi-layover editor with coords
- Booking status on every item: Booked / Not Booked / Pay on Arrival
- Budget tab aggregates costs across all items with progress bar
- Itinerary tab groups items into Day 1, Day 2… with toggle chips per category
- Tickets: photo upload (portrait/landscape), link, cost, details; two-way linking to a specific flight/transport/stay/attraction
- **Bidirectional link chips**: "View ticket" on item cards, "View <category>" on ticket cards; jumps tab + highlights the focused card
- **Shareable itinerary**: Share button opens ShareOptionsSheet — user picks which sections/data (flights, transport, stays, attractions, tickets, costs, map) to include; generates a unique read-only URL that respects those toggles

## Tech
- Frontend: Expo Router, React Query, expo-image, expo-image-picker, expo-file-system/legacy, @react-native-community/datetimepicker, @react-native-vector-icons/material-design-icons, react-native-webview + Leaflet + OpenStreetMap
- Backend: FastAPI + Motor (MongoDB), Emergent LLM key via emergentintegrations (gpt-5.4, text + vision), httpx to proxy Nominatim
- Design: iOS-native clean aesthetic with sage green brand

## Key API Endpoints
- CRUD `/api/trips`, `/api/trips/{id}`
- Sub-items: `/api/trips/{id}/{flights|transport|stays|attractions|tickets}` and `PATCH/DELETE /api/{kind}/{id}`
- `GET /api/geocode?q=` (Nominatim proxy)
- `GET /api/reverse-geocode?lat=&lon=`
- `POST /api/ai/parse-flight` (text-only)
- `POST /api/ai/parse-booking` (text OR image_base64, universal classifier)
- `GET /api/public/trips/{share_id}` (public read-only feed)

## Backend test coverage (Round 2)
10/10 pytest cases passing: geocode, reverse-geocode, share_id, public feed, ticket link sync full lifecycle, LLM parse-booking for hotel/flight/attraction (text) and image.
