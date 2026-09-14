from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import base64
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ============= MODELS =============

BookingStatus = Literal["booked", "not_booked", "pay_on_arrival"]
TripCategory = Literal["upcoming", "past", "wishlist"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_share_id() -> str:
    # short readable share id
    return uuid.uuid4().hex[:10]


class Layover(BaseModel):
    location: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    arrival_datetime: str = ""
    departure_datetime: str = ""


class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    share_id: str = Field(default_factory=gen_share_id)
    name: str
    destination: str = ""
    start_date: str = ""
    end_date: str = ""
    category: TripCategory = "upcoming"
    cover_photo: str = ""
    budget_planned: float = 0.0
    itinerary_filters: dict = Field(default_factory=lambda: {
        "flights": True, "transport": True, "stay": True, "attractions": True
    })
    created_at: str = Field(default_factory=now_iso)


class TripCreate(BaseModel):
    name: str
    destination: str = ""
    start_date: str = ""
    end_date: str = ""
    category: TripCategory = "upcoming"
    cover_photo: str = ""
    budget_planned: float = 0.0


class TripUpdate(BaseModel):
    name: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    category: Optional[TripCategory] = None
    cover_photo: Optional[str] = None
    budget_planned: Optional[float] = None
    itinerary_filters: Optional[dict] = None


class Flight(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    flight_number: str = ""
    airline: str = ""
    departure_location: str = ""
    departure_latitude: Optional[float] = None
    departure_longitude: Optional[float] = None
    departure_datetime: str = ""
    arrival_location: str = ""
    arrival_latitude: Optional[float] = None
    arrival_longitude: Optional[float] = None
    arrival_datetime: str = ""
    layovers: List[Layover] = Field(default_factory=list)
    booking_status: BookingStatus = "not_booked"
    ticket_id: str = ""
    cost: float = 0.0
    notes: str = ""


class Transport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    transport_type: Literal["car", "bus", "ferry", "train", "other"] = "car"
    departure_location: str = ""
    departure_latitude: Optional[float] = None
    departure_longitude: Optional[float] = None
    departure_datetime: str = ""
    arrival_location: str = ""
    arrival_latitude: Optional[float] = None
    arrival_longitude: Optional[float] = None
    arrival_datetime: str = ""
    booking_status: BookingStatus = "not_booked"
    ticket_id: str = ""
    cost: float = 0.0
    notes: str = ""


class Stay(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    accommodation_name: str = ""
    location: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    checkin_datetime: str = ""
    checkout_datetime: str = ""
    booking_link: str = ""
    breakfast_included: bool = False
    dinner_included: bool = False
    booking_status: BookingStatus = "not_booked"
    ticket_id: str = ""
    cost: float = 0.0


class Attraction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    name: str = ""
    website_link: str = ""
    activity_datetime: str = ""
    location: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    booking_status: BookingStatus = "not_booked"
    ticket_id: str = ""
    cost: float = 0.0


class Ticket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    link: str = ""
    photo: str = ""
    cost: float = 0.0
    details: str = ""
    ticket_type: Literal["flight", "transport", "stay", "attraction", "other"] = "other"
    linked_item_id: str = ""


# ============= HELPERS =============

async def cascade_delete_trip(trip_id: str):
    for col in ["flights", "transport", "stays", "attractions", "tickets"]:
        await db[col].delete_many({"trip_id": trip_id})


TICKET_COLLECTIONS = {
    "flight": "flights",
    "transport": "transport",
    "stay": "stays",
    "attraction": "attractions",
}


async def sync_ticket_link(ticket: dict):
    """Ensure the linked item's `ticket_id` matches this ticket and no stale links remain."""
    ticket_id = ticket.get("id")
    if not ticket_id:
        return
    linked_col = TICKET_COLLECTIONS.get(ticket.get("ticket_type", ""))
    linked_item_id = ticket.get("linked_item_id") or ""

    # Clear any stale ticket_id references across all collections
    for col in TICKET_COLLECTIONS.values():
        if col == linked_col and linked_item_id:
            await db[col].update_many(
                {"ticket_id": ticket_id, "id": {"$ne": linked_item_id}},
                {"$set": {"ticket_id": ""}},
            )
        else:
            await db[col].update_many({"ticket_id": ticket_id}, {"$set": {"ticket_id": ""}})

    # Set the fresh link
    if linked_col and linked_item_id:
        await db[linked_col].update_one({"id": linked_item_id}, {"$set": {"ticket_id": ticket_id}})


async def clear_item_from_tickets(item_id: str):
    await db.tickets.update_many({"linked_item_id": item_id}, {"$set": {"linked_item_id": ""}})


async def ensure_share_id(doc: dict) -> dict:
    if not doc.get("share_id"):
        share_id = gen_share_id()
        await db.trips.update_one({"id": doc["id"]}, {"$set": {"share_id": share_id}})
        doc["share_id"] = share_id
    return doc


# ============= TRIP ENDPOINTS =============

@api_router.get("/")
async def root():
    return {"message": "WanderPlan API"}


@api_router.get("/trips", response_model=List[Trip])
async def list_trips():
    trips = await db.trips.find({}, {"_id": 0}).to_list(1000)
    result = []
    for t in trips:
        t = await ensure_share_id(t)
        result.append(Trip(**t))
    return result


@api_router.post("/trips", response_model=Trip)
async def create_trip(data: TripCreate):
    trip = Trip(**data.dict())
    await db.trips.insert_one(trip.dict())
    return trip


@api_router.get("/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: str):
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Trip not found")
    doc = await ensure_share_id(doc)
    return Trip(**doc)


@api_router.patch("/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, data: TripUpdate):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if updates:
        await db.trips.update_one({"id": trip_id}, {"$set": updates})
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Trip not found")
    doc = await ensure_share_id(doc)
    return Trip(**doc)


@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str):
    await db.trips.delete_one({"id": trip_id})
    await cascade_delete_trip(trip_id)
    return {"ok": True}


# ============= SUB-ITEMS =============

@api_router.get("/trips/{trip_id}/flights", response_model=List[Flight])
async def list_flights(trip_id: str):
    docs = await db.flights.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    return [Flight(**d) for d in docs]


@api_router.post("/trips/{trip_id}/flights", response_model=Flight)
async def create_flight(trip_id: str, data: Flight):
    data.trip_id = trip_id
    if not data.id:
        data.id = str(uuid.uuid4())
    await db.flights.insert_one(data.dict())
    return data


@api_router.patch("/flights/{item_id}", response_model=Flight)
async def update_flight(item_id: str, data: Flight):
    payload = data.dict(exclude={"id"})
    await db.flights.update_one({"id": item_id}, {"$set": payload})
    doc = await db.flights.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Flight(**doc)


@api_router.delete("/flights/{item_id}")
async def delete_flight(item_id: str):
    await db.flights.delete_one({"id": item_id})
    await clear_item_from_tickets(item_id)
    return {"ok": True}


@api_router.get("/trips/{trip_id}/transport", response_model=List[Transport])
async def list_transport(trip_id: str):
    docs = await db.transport.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    return [Transport(**d) for d in docs]


@api_router.post("/trips/{trip_id}/transport", response_model=Transport)
async def create_transport(trip_id: str, data: Transport):
    data.trip_id = trip_id
    if not data.id:
        data.id = str(uuid.uuid4())
    await db.transport.insert_one(data.dict())
    return data


@api_router.patch("/transport/{item_id}", response_model=Transport)
async def update_transport(item_id: str, data: Transport):
    payload = data.dict(exclude={"id"})
    await db.transport.update_one({"id": item_id}, {"$set": payload})
    doc = await db.transport.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Transport(**doc)


@api_router.delete("/transport/{item_id}")
async def delete_transport(item_id: str):
    await db.transport.delete_one({"id": item_id})
    await clear_item_from_tickets(item_id)
    return {"ok": True}


@api_router.get("/trips/{trip_id}/stays", response_model=List[Stay])
async def list_stays(trip_id: str):
    docs = await db.stays.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    return [Stay(**d) for d in docs]


@api_router.post("/trips/{trip_id}/stays", response_model=Stay)
async def create_stay(trip_id: str, data: Stay):
    data.trip_id = trip_id
    if not data.id:
        data.id = str(uuid.uuid4())
    await db.stays.insert_one(data.dict())
    return data


@api_router.patch("/stays/{item_id}", response_model=Stay)
async def update_stay(item_id: str, data: Stay):
    payload = data.dict(exclude={"id"})
    await db.stays.update_one({"id": item_id}, {"$set": payload})
    doc = await db.stays.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Stay(**doc)


@api_router.delete("/stays/{item_id}")
async def delete_stay(item_id: str):
    await db.stays.delete_one({"id": item_id})
    await clear_item_from_tickets(item_id)
    return {"ok": True}


@api_router.get("/trips/{trip_id}/attractions", response_model=List[Attraction])
async def list_attractions(trip_id: str):
    docs = await db.attractions.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    return [Attraction(**d) for d in docs]


@api_router.post("/trips/{trip_id}/attractions", response_model=Attraction)
async def create_attraction(trip_id: str, data: Attraction):
    data.trip_id = trip_id
    if not data.id:
        data.id = str(uuid.uuid4())
    await db.attractions.insert_one(data.dict())
    return data


@api_router.patch("/attractions/{item_id}", response_model=Attraction)
async def update_attraction(item_id: str, data: Attraction):
    payload = data.dict(exclude={"id"})
    await db.attractions.update_one({"id": item_id}, {"$set": payload})
    doc = await db.attractions.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Attraction(**doc)


@api_router.delete("/attractions/{item_id}")
async def delete_attraction(item_id: str):
    await db.attractions.delete_one({"id": item_id})
    await clear_item_from_tickets(item_id)
    return {"ok": True}


@api_router.get("/trips/{trip_id}/tickets", response_model=List[Ticket])
async def list_tickets(trip_id: str):
    docs = await db.tickets.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    return [Ticket(**d) for d in docs]


@api_router.post("/trips/{trip_id}/tickets", response_model=Ticket)
async def create_ticket(trip_id: str, data: Ticket):
    data.trip_id = trip_id
    if not data.id:
        data.id = str(uuid.uuid4())
    await db.tickets.insert_one(data.dict())
    await sync_ticket_link(data.dict())
    return data


@api_router.patch("/tickets/{item_id}", response_model=Ticket)
async def update_ticket(item_id: str, data: Ticket):
    payload = data.dict(exclude={"id"})
    await db.tickets.update_one({"id": item_id}, {"$set": payload})
    doc = await db.tickets.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    await sync_ticket_link(doc)
    return Ticket(**doc)


@api_router.delete("/tickets/{item_id}")
async def delete_ticket(item_id: str):
    # Clear ticket_id on any item that referenced this ticket
    for col in TICKET_COLLECTIONS.values():
        await db[col].update_many({"ticket_id": item_id}, {"$set": {"ticket_id": ""}})
    await db.tickets.delete_one({"id": item_id})
    return {"ok": True}


# ============= PUBLIC SHARE =============

@api_router.get("/public/trips/{share_id}")
async def public_trip(share_id: str):
    trip = await db.trips.find_one({"share_id": share_id}, {"_id": 0})
    if not trip:
        raise HTTPException(404, "Not found")
    trip_id = trip["id"]
    flights = await db.flights.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    transport = await db.transport.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    stays = await db.stays.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    attractions = await db.attractions.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    tickets = await db.tickets.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    return {
        "trip": trip,
        "flights": flights,
        "transport": transport,
        "stays": stays,
        "attractions": attractions,
        "tickets": tickets,
    }


# ============= GEOCODE (Nominatim proxy) =============

@api_router.get("/geocode")
async def geocode(q: str = Query(..., min_length=2)):
    """Forward geocode using OpenStreetMap Nominatim (free, no key)."""
    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "json", "limit": 5, "addressdetails": 1},
                headers={"User-Agent": "WanderPlan/1.0 (travel-app)"},
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.error(f"geocode error: {e}")
            return {"results": []}
    results = [
        {
            "display_name": item.get("display_name", ""),
            "latitude": float(item["lat"]),
            "longitude": float(item["lon"]),
        }
        for item in data
        if item.get("lat") and item.get("lon")
    ]
    return {"results": results}


@api_router.get("/reverse-geocode")
async def reverse_geocode(lat: float, lon: float):
    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json"},
                headers={"User-Agent": "WanderPlan/1.0 (travel-app)"},
            )
            r.raise_for_status()
            data = r.json()
        except Exception:
            return {"display_name": ""}
    return {"display_name": data.get("display_name", ""), "latitude": lat, "longitude": lon}


# ============= AI FLIGHT PARSE (text-only, legacy) =============

class ParseFlightRequest(BaseModel):
    text: str


class ParsedFlight(BaseModel):
    flight_number: str = ""
    airline: str = ""
    departure_location: str = ""
    departure_datetime: str = ""
    arrival_location: str = ""
    arrival_datetime: str = ""
    layovers: List[Layover] = Field(default_factory=list)


def _strip_code_fence(text: str) -> str:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    return text


def _extract_json(text: str) -> dict:
    text = _strip_code_fence(text)
    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


@api_router.post("/ai/parse-flight", response_model=ParsedFlight)
async def parse_flight(req: ParseFlightRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    system_msg = (
        "You extract flight details from booking confirmation text. "
        "Return ONLY strict JSON with keys: flight_number, airline, "
        "departure_location, departure_datetime (ISO 8601 like 2025-06-01T09:30), "
        "arrival_location, arrival_datetime (ISO 8601), "
        "layovers (array of {location, arrival_datetime, departure_datetime}). "
        "Missing fields = empty string. No code fences."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"parse-flight-{uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("openai", "gpt-5.4")

    try:
        response = await chat.send_message(UserMessage(text=req.text))
    except Exception as e:
        raise HTTPException(500, f"LLM call failed: {e}")

    text = response if isinstance(response, str) else str(response)
    try:
        data = _extract_json(text)
    except Exception:
        raise HTTPException(500, "Could not parse LLM response")
    return ParsedFlight(**data)


# ============= UNIVERSAL BOOKING PARSE (text + image) =============

class ParseBookingRequest(BaseModel):
    text: Optional[str] = None
    image_base64: Optional[str] = None
    mime: Optional[str] = "image/jpeg"


class ParsedBooking(BaseModel):
    category: Literal["flight", "transport", "stay", "attraction", "unknown"] = "unknown"
    data: dict = Field(default_factory=dict)
    confidence: float = 0.0
    ticket: dict = Field(default_factory=dict)


UNIVERSAL_SYSTEM = """You are an assistant that extracts travel booking details from text or images (screenshots of booking confirmations).

Classify the booking into one of these categories and extract fields.

Return ONLY a strict JSON object with this shape:
{
  "category": "flight" | "transport" | "stay" | "attraction" | "unknown",
  "data": { ... category-specific fields ... },
  "ticket": { "cost": number, "details": string, "link": string, "confirmation": string },
  "confidence": number between 0 and 1
}

Category-specific fields (all optional strings unless noted; missing = empty):

flight:
  airline, flight_number, departure_location, departure_datetime (ISO 8601), arrival_location, arrival_datetime (ISO 8601),
  layovers: array of { location, arrival_datetime, departure_datetime }

transport:
  transport_type: one of "car","bus","train","ferry","other",
  departure_location, departure_datetime, arrival_location, arrival_datetime, notes

stay:
  accommodation_name, location, checkin_datetime, checkout_datetime, booking_link, breakfast_included (bool), dinner_included (bool)

attraction:
  name, location, activity_datetime, website_link

Rules:
- Use ISO 8601 for all dates/times, e.g. 2026-06-01T09:30.
- If the source shows only a date, use T00:00 for time.
- Cost should be a number in the currency shown (do not convert).
- No code fences, no commentary. JSON only.
"""


@api_router.post("/ai/parse-booking", response_model=ParsedBooking)
async def parse_booking(req: ParseBookingRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")
    if not req.text and not req.image_base64:
        raise HTTPException(400, "Provide text or image_base64")

    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"parse-booking-{uuid.uuid4()}",
        system_message=UNIVERSAL_SYSTEM,
    ).with_model("openai", "gpt-5.4")

    text_prompt = req.text or "Extract the booking details from this image."
    file_contents = []
    if req.image_base64:
        # strip data URL prefix if present
        b64 = req.image_base64
        if b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        file_contents.append(ImageContent(image_base64=b64))

    msg = UserMessage(text=text_prompt, file_contents=file_contents) if file_contents else UserMessage(text=text_prompt)

    try:
        response = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"parse-booking LLM error: {e}")
        raise HTTPException(500, f"LLM call failed: {e}")

    text_out = response if isinstance(response, str) else str(response)
    try:
        parsed = _extract_json(text_out)
    except Exception:
        logger.error(f"parse-booking bad JSON: {text_out[:400]}")
        raise HTTPException(500, "Could not parse LLM response")

    return ParsedBooking(
        category=parsed.get("category", "unknown"),
        data=parsed.get("data", {}) or {},
        ticket=parsed.get("ticket", {}) or {},
        confidence=float(parsed.get("confidence", 0)),
    )


# ============= APP SETUP =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
