from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
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


# ============= MODELS =============

BookingStatus = Literal["booked", "not_booked", "pay_on_arrival"]
TripCategory = Literal["upcoming", "past", "wishlist"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Layover(BaseModel):
    location: str = ""
    arrival_datetime: str = ""
    departure_datetime: str = ""


class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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
    departure_datetime: str = ""
    arrival_location: str = ""
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
    departure_datetime: str = ""
    arrival_location: str = ""
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

def clean_doc(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


async def cascade_delete_trip(trip_id: str):
    for col in ["flights", "transport", "stays", "attractions", "tickets"]:
        await db[col].delete_many({"trip_id": trip_id})


# ============= TRIP ENDPOINTS =============

@api_router.get("/")
async def root():
    return {"message": "WanderPlan API"}


@api_router.get("/trips", response_model=List[Trip])
async def list_trips():
    trips = await db.trips.find({}, {"_id": 0}).to_list(1000)
    return [Trip(**t) for t in trips]


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
    return Trip(**doc)


@api_router.patch("/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, data: TripUpdate):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if updates:
        await db.trips.update_one({"id": trip_id}, {"$set": updates})
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Trip not found")
    return Trip(**doc)


@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str):
    await db.trips.delete_one({"id": trip_id})
    await cascade_delete_trip(trip_id)
    return {"ok": True}


# ============= GENERIC SUB-ITEM ENDPOINTS =============

COLLECTIONS = {
    "flights": (Flight, "flights"),
    "transport": (Transport, "transport"),
    "stays": (Stay, "stays"),
    "attractions": (Attraction, "attractions"),
    "tickets": (Ticket, "tickets"),
}


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
    return data


@api_router.patch("/tickets/{item_id}", response_model=Ticket)
async def update_ticket(item_id: str, data: Ticket):
    payload = data.dict(exclude={"id"})
    await db.tickets.update_one({"id": item_id}, {"$set": payload})
    doc = await db.tickets.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return Ticket(**doc)


@api_router.delete("/tickets/{item_id}")
async def delete_ticket(item_id: str):
    await db.tickets.delete_one({"id": item_id})
    return {"ok": True}


# ============= AI FLIGHT PARSE =============

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


@api_router.post("/ai/parse-flight", response_model=ParsedFlight)
async def parse_flight(req: ParseFlightRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"LLM library error: {e}")

    system_msg = (
        "You extract flight details from booking confirmation text. "
        "Return ONLY a strict JSON object with these keys: "
        "flight_number (string), airline (string), departure_location (string, city/airport), "
        "departure_datetime (ISO 8601 like 2025-06-01T09:30), "
        "arrival_location (string), arrival_datetime (ISO 8601), "
        "layovers (array of objects with keys: location, arrival_datetime, departure_datetime). "
        "If any field is missing, use empty string. Output JSON only, no code fences."
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
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        data = json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end + 1])
            except Exception:
                raise HTTPException(500, "Could not parse LLM response")
        else:
            raise HTTPException(500, "Could not parse LLM response")

    return ParsedFlight(**data)


# ============= APP SETUP =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
