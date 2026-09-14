# WanderPlan — Travel Planning App (PRD)

## Overview
Simple, single-user travel companion app for planning trips (Upcoming/Past/Wishlist) with per-trip flights, transport, stays, attractions, tickets, budget, and an auto-generated itinerary.

## Features
- Trips list (Upcoming/Past/Wishlist tabs) with cover photo cards
- Create/edit/delete trip; upload cover photo from device (portrait or landscape)
- Trip detail hub with tabs: Itinerary (default), Flights, Transport, Stay, Attractions, Tickets, Budget
- Flights: departure/arrival date-time-location, flight number, airline, multiple layovers, cost, booking status
- **AI auto-fill flight from booking confirmation text** (Emergent LLM key + gpt-5.4)
- Transport: type (car/bus/train/ferry/other), route, date-time, cost, status
- Stays: name, location, check-in/out, booking link, breakfast/dinner included switches, cost, status
- Attractions: name, date-time, location, website link, cost, status
- Tickets: photo upload (portrait/landscape), link, cost, details, type + link to a specific flight/transport/stay/attraction
- Booking status on every item: Booked / Not Booked / Pay on Arrival
- Budget tab: planned vs spent (auto-aggregated across all items), progress bar, breakdown by category
- Itinerary tab: auto-generated day-by-day chronological timeline; filter chips (Flights, Transport, Stay, Attractions) persisted per trip

## Tech
- Frontend: Expo Router (Stack), React Query, expo-image, expo-image-picker, @react-native-community/datetimepicker, @react-native-vector-icons/material-design-icons
- Backend: FastAPI + Motor (MongoDB), Emergent LLM key via emergentintegrations
- Design: iOS-native clean aesthetic with sage green brand, soft warm neutrals (see design_guidelines.json)

## Key API Endpoints
- CRUD `/api/trips`, `/api/trips/{id}`
- Per-trip sub-items: `/api/trips/{id}/{flights|transport|stays|attractions|tickets}`
- Update/delete sub-items: `PATCH/DELETE /api/{kind}/{id}`
- AI parse: `POST /api/ai/parse-flight` with `{ text }`
