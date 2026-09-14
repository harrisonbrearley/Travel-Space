from fastapi import FastAPI, APIRouter, HTTPException, Query, Header, Depends, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import base64
import re
import time
import secrets
import httpx
import asyncio
from collections import defaultdict, deque
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

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


# ============= AUTH MODELS =============

class User(BaseModel):
    user_id: str
    email: str
    name: str = ""
    picture: str = ""
    created_at: str


class SessionExchangeRequest(BaseModel):
    session_id: str


# ============= AUTH HELPERS =============

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def gen_share_id() -> str:
    return secrets.token_urlsafe(24)  # ~32 chars


async def get_current_user(
    authorization: Optional[str] = Header(None),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Empty token")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")

    expires = session.get("expires_at")
    if expires:
        if isinstance(expires, str):
            try:
                expires = datetime.fromisoformat(expires)
            except Exception:
                expires = None
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires and expires < now_utc():
            raise HTTPException(401, "Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


CurrentUser = Depends(get_current_user)


# ============= AUTH ENDPOINTS =============

@api_router.post("/auth/session")
async def auth_session(body: SessionExchangeRequest):
    if not body.session_id or len(body.session_id) < 8:
        raise HTTPException(400, "Bad session_id")

    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
        except Exception as e:
            logger.error(f"auth exchange failed: {e}")
            raise HTTPException(401, "Auth exchange failed")
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")

    payload = r.json()
    email = (payload.get("email") or "").lower().strip()
    name = payload.get("name") or ""
    picture = payload.get("picture") or ""
    session_token = payload.get("session_token") or ""
    if not email or not session_token:
        raise HTTPException(401, "Malformed session data")

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": now_iso(),
        })

    # Claim any orphaned trips (backfill single-user preview data) on first ever sign-in
    total_users = await db.users.count_documents({})
    if total_users == 1:
        await db.trips.update_many(
            {"$or": [{"user_id": {"$exists": False}}, {"user_id": ""}]},
            {"$set": {"user_id": user_id}},
        )

    # Store session
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": now_iso(),
        }},
        upsert=True,
    )

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user}


@api_router.get("/auth/me")
async def auth_me(user: dict = CurrentUser):
    return {"user": user}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api_router.delete("/auth/me")
async def delete_account(user: dict = CurrentUser):
    """Permanently delete the signed-in user's account and everything they own.

    - Deletes every trip owned by the user (cascades to flights, transport,
      stays, attractions, tickets, documents).
    - Removes the user from every trip where they are a collaborator.
    - Deletes any invites they created.
    - Revokes every active session and finally removes the user row.

    Required by App Store / Play Store review policy for apps that allow
    account creation. The action is irreversible."""
    uid = user["user_id"]

    owned = await db.trips.find({"user_id": uid}, {"_id": 0, "id": 1}).to_list(10000)
    for t in owned:
        await cascade_delete_trip(t["id"])
    await db.trips.delete_many({"user_id": uid})

    # Remove the user from any trip they collaborated on.
    await db.trips.update_many({"collaborators": uid}, {"$pull": {"collaborators": uid}})

    # Clean up invites this user created.
    try:
        await db.trip_invites.delete_many({"created_by": uid})
    except Exception:
        pass

    # Kill every session for this user, then remove the user row itself.
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})

    return {"ok": True}


# ============= DOMAIN MODELS =============

BookingStatus = Literal["booked", "not_booked", "pay_on_arrival"]
TripCategory = Literal["upcoming", "past", "wishlist"]


class Layover(BaseModel):
    location: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    arrival_datetime: str = ""
    departure_datetime: str = ""


class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    share_id: str = Field(default_factory=gen_share_id)
    name: str
    destination: str = ""
    start_date: str = ""
    end_date: str = ""
    category: TripCategory = "upcoming"
    cover_photo: str = ""
    budget_planned: float = 0.0
    currency: str = "USD"
    itinerary_filters: dict = Field(default_factory=lambda: {
        "flights": True, "transport": True, "stay": True, "attractions": True
    })
    collaborators: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=now_iso)


class TripCreate(BaseModel):
    id: Optional[str] = None  # client-provided ids let offline writes stay consistent after sync
    name: str
    destination: str = ""
    start_date: str = ""
    end_date: str = ""
    category: TripCategory = "upcoming"
    cover_photo: str = ""
    budget_planned: float = 0.0
    currency: str = "USD"


class TripUpdate(BaseModel):
    name: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    category: Optional[TripCategory] = None
    cover_photo: Optional[str] = None
    budget_planned: Optional[float] = None
    currency: Optional[str] = None
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
    cost_currency: str = "USD"
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
    cost_currency: str = "USD"
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
    cost_currency: str = "USD"


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
    cost_currency: str = "USD"
    notes: str = ""


class Ticket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    link: str = ""
    photo: str = ""
    file_base64: str = ""      # optional PDF/image data URI or base64
    file_mime: str = ""        # e.g. "application/pdf", "image/jpeg"
    file_name: str = ""        # original filename
    cost: float = 0.0
    cost_currency: str = "USD"
    details: str = ""
    ticket_type: Literal["flight", "transport", "stay", "attraction", "other"] = "other"
    linked_item_id: str = ""


DocumentKind = Literal["photo", "pdf", "other"]
LinkedType = Literal["flight", "transport", "stay", "attraction", "ticket", "none"]


class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    name: str = ""
    kind: DocumentKind = "other"
    mime: str = ""
    file_base64: str = ""      # stored inline (limited to ~6MB payloads)
    size: int = 0
    notes: str = ""
    linked_type: LinkedType = "none"
    linked_item_id: str = ""
    created_at: str = Field(default_factory=now_iso)


# ============= HELPERS =============

async def cascade_delete_trip(trip_id: str):
    for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
        await db[col].delete_many({"trip_id": trip_id})


TICKET_COLLECTIONS = {
    "flight": "flights", "transport": "transport",
    "stay": "stays", "attraction": "attractions",
}


async def sync_ticket_link(ticket: dict):
    ticket_id = ticket.get("id")
    if not ticket_id:
        return
    linked_col = TICKET_COLLECTIONS.get(ticket.get("ticket_type", ""))
    linked_item_id = ticket.get("linked_item_id") or ""
    for col in TICKET_COLLECTIONS.values():
        if col == linked_col and linked_item_id:
            await db[col].update_many(
                {"ticket_id": ticket_id, "id": {"$ne": linked_item_id}},
                {"$set": {"ticket_id": ""}},
            )
        else:
            await db[col].update_many({"ticket_id": ticket_id}, {"$set": {"ticket_id": ""}})
    if linked_col and linked_item_id:
        await db[linked_col].update_one({"id": linked_item_id}, {"$set": {"ticket_id": ticket_id}})


async def clear_item_from_tickets(item_id: str):
    await db.tickets.update_many({"linked_item_id": item_id}, {"$set": {"linked_item_id": ""}})


async def require_trip(trip_id: str, user: dict, *, owner_only: bool = False) -> dict:
    """Ensure the trip exists and the current user has access to it.

    By default, the trip owner AND collaborators are allowed. When
    ``owner_only`` is True (e.g. delete, invite creation), only the owner
    passes."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(404, "Trip not found")
    uid = user["user_id"]
    if trip.get("user_id") == uid:
        return trip
    if not owner_only and uid in (trip.get("collaborators") or []):
        return trip
    raise HTTPException(404, "Trip not found")  # 404 to avoid leaking existence


async def require_item(collection: str, item_id: str, user: dict) -> dict:
    doc = await db[collection].find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    trip = await db.trips.find_one({"id": doc.get("trip_id", "")}, {"_id": 0})
    if not trip:
        raise HTTPException(404, "Not found")
    uid = user["user_id"]
    if trip.get("user_id") != uid and uid not in (trip.get("collaborators") or []):
        raise HTTPException(404, "Not found")
    return doc


async def ensure_share_id(doc: dict) -> dict:
    if not doc.get("share_id"):
        share_id = gen_share_id()
        await db.trips.update_one({"id": doc["id"]}, {"$set": {"share_id": share_id}})
        doc["share_id"] = share_id
    return doc


# ============= TRIP ENDPOINTS =============

@api_router.get("/")
async def root():
    return {"message": "Travel Space API"}


@api_router.get("/health")
async def health():
    """Liveness probe. Cheap, unauthenticated, always 200 when the app process is up."""
    return {"status": "ok"}


# Root-level /health so orchestrators that don't hit the /api prefix still see 200.
@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
async def health_root():
    return {"status": "ok"}


@api_router.get("/trips", response_model=List[Trip])
async def list_trips(user: dict = CurrentUser):
    uid = user["user_id"]
    trips = await db.trips.find(
        {"$or": [{"user_id": uid}, {"collaborators": uid}]},
        {"_id": 0},
    ).to_list(1000)
    result = []
    for t in trips:
        t = await ensure_share_id(t)
        result.append(Trip(**t))
    return result


@api_router.post("/trips", response_model=Trip)
async def create_trip(data: TripCreate, user: dict = CurrentUser):
    payload = data.dict()
    # Honour a client-supplied id (offline / import cases) but never let the
    # client stomp on an existing document.
    supplied_id = payload.pop("id", None)
    if supplied_id:
        existing = await db.trips.find_one({"id": supplied_id}, {"_id": 0})
        if existing:
            # Already exists — return the existing trip if it belongs to the
            # caller, otherwise treat as a fresh id.
            if existing.get("user_id") == user["user_id"]:
                return Trip(**await ensure_share_id(existing))
            supplied_id = None
    trip_kwargs = {**payload, "user_id": user["user_id"]}
    if supplied_id:
        trip_kwargs["id"] = supplied_id
    trip = Trip(**trip_kwargs)
    await db.trips.insert_one(trip.dict())
    return trip


@api_router.get("/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: str, user: dict = CurrentUser):
    doc = await require_trip(trip_id, user)
    doc = await ensure_share_id(doc)
    return Trip(**doc)


@api_router.patch("/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, data: TripUpdate, user: dict = CurrentUser):
    await require_trip(trip_id, user)
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if updates:
        await db.trips.update_one({"id": trip_id}, {"$set": updates})
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    doc = await ensure_share_id(doc)
    return Trip(**doc)


@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, user: dict = CurrentUser):
    await require_trip(trip_id, user, owner_only=True)
    await db.trips.delete_one({"id": trip_id})
    await cascade_delete_trip(trip_id)
    return {"ok": True}


# ============= INVITES / COLLABORATION =============

InviteMode = Literal["collab", "copy"]


class InviteCreate(BaseModel):
    mode: InviteMode = "collab"


class InvitePreview(BaseModel):
    token: str
    mode: InviteMode
    trip_name: str
    trip_destination: str
    trip_cover: str
    owner_name: str
    owner_email: str
    created_at: str
    expired: bool = False


def _gen_invite_token() -> str:
    return secrets.token_urlsafe(18)


@api_router.post("/trips/{trip_id}/invites")
async def create_invite(trip_id: str, body: InviteCreate, user: dict = CurrentUser):
    """Owner generates an invite token. Anyone with the token can accept."""
    await require_trip(trip_id, user, owner_only=True)
    token = _gen_invite_token()
    expires_at = now_utc() + timedelta(days=30)
    doc = {
        "token": token,
        "trip_id": trip_id,
        "mode": body.mode,
        "created_by": user["user_id"],
        "created_at": now_iso(),
        "expires_at": expires_at,
    }
    await db.trip_invites.insert_one(doc)
    return {"token": token, "mode": body.mode}


@api_router.get("/invites/{token}", response_model=InvitePreview)
async def get_invite_preview(token: str):
    """Public: fetches a preview so the invite screen can render before login."""
    inv = await db.trip_invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    expired = False
    exp = inv.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        expired = exp < now_utc()

    trip = await db.trips.find_one({"id": inv["trip_id"]}, {"_id": 0}) or {}
    owner = await db.users.find_one({"user_id": trip.get("user_id", "")}, {"_id": 0}) or {}
    return InvitePreview(
        token=token,
        mode=inv.get("mode", "collab"),
        trip_name=trip.get("name", ""),
        trip_destination=trip.get("destination", ""),
        trip_cover=trip.get("cover_photo", ""),
        owner_name=owner.get("name", "") or (owner.get("email", "").split("@", 1)[0] if owner.get("email") else ""),
        owner_email="",  # never expose the raw owner email on a public preview
        created_at=inv.get("created_at", ""),
        expired=expired,
    )


async def _clone_trip_for_user(source: dict, new_user_id: str) -> dict:
    """Deep-copy a trip and all sub-items (including documents) under a new owner."""
    new_trip_id = str(uuid.uuid4())
    new_trip = {**source}
    new_trip.pop("_id", None)
    new_trip["id"] = new_trip_id
    new_trip["user_id"] = new_user_id
    new_trip["collaborators"] = []
    new_trip["share_id"] = gen_share_id()
    new_trip["created_at"] = now_iso()
    # Prefix name to mark as a copy
    if not new_trip.get("name", "").lower().startswith("copy of "):
        new_trip["name"] = f"Copy of {new_trip.get('name', 'Trip')}"
    await db.trips.insert_one(new_trip)

    old_trip_id = source["id"]
    # Cross-item ID mapping so ticket <-> item links keep resolving after cloning.
    id_map: dict = {}
    for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
        rows = await db[col].find({"trip_id": old_trip_id}, {"_id": 0}).to_list(2000)
        for r in rows:
            id_map[r.get("id", "")] = str(uuid.uuid4())
    for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
        rows = await db[col].find({"trip_id": old_trip_id}, {"_id": 0}).to_list(2000)
        cloned = []
        for r in rows:
            r = {**r}
            r["id"] = id_map[r["id"]]
            r["trip_id"] = new_trip_id
            if r.get("ticket_id"):
                r["ticket_id"] = id_map.get(r["ticket_id"], "")
            if r.get("linked_item_id"):
                r["linked_item_id"] = id_map.get(r["linked_item_id"], "")
            cloned.append(r)
        if cloned:
            await db[col].insert_many(cloned)
    return new_trip


@api_router.post("/invites/{token}/accept")
async def accept_invite(token: str, user: dict = CurrentUser):
    inv = await db.trip_invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")

    # Expiry check
    exp = inv.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            raise HTTPException(410, "Invite expired")

    trip = await db.trips.find_one({"id": inv["trip_id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(404, "Trip no longer exists")

    uid = user["user_id"]
    mode = inv.get("mode", "collab")

    if mode == "collab":
        if trip.get("user_id") == uid:
            return {"trip_id": trip["id"], "mode": "already_owner"}
        if uid not in (trip.get("collaborators") or []):
            await db.trips.update_one({"id": trip["id"]}, {"$addToSet": {"collaborators": uid}})
        return {"trip_id": trip["id"], "mode": "collab"}

    # Copy mode — always creates a new trip owned by the accepter
    new_trip = await _clone_trip_for_user(trip, uid)
    return {"trip_id": new_trip["id"], "mode": "copy"}


@api_router.delete("/trips/{trip_id}/collaborators/{user_id}")
async def remove_collaborator(trip_id: str, user_id: str, user: dict = CurrentUser):
    """Owner can revoke access; a collaborator can remove themselves."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(404, "Trip not found")
    caller = user["user_id"]
    is_owner = trip.get("user_id") == caller
    is_self = caller == user_id
    if not (is_owner or is_self):
        raise HTTPException(403, "Not allowed")
    await db.trips.update_one({"id": trip_id}, {"$pull": {"collaborators": user_id}})
    return {"ok": True}


# ============= SUB-ITEMS =============

def _generic_list_factory(coll_name: str, Model):
    async def _list(trip_id: str, user: dict = CurrentUser):
        await require_trip(trip_id, user)
        docs = await db[coll_name].find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
        return [Model(**d) for d in docs]
    return _list


def _generic_create_factory(coll_name: str, Model):
    async def _create(trip_id: str, data: Model, user: dict = CurrentUser):
        await require_trip(trip_id, user)
        data.trip_id = trip_id
        if not data.id:
            data.id = str(uuid.uuid4())
        # Idempotent create: if a doc with this id is already stored under this
        # trip, return it. Prevents duplicates when an offline queue retries
        # after a partial network success.
        existing = await db[coll_name].find_one({"id": data.id}, {"_id": 0})
        if existing:
            if existing.get("trip_id") == trip_id:
                return Model(**existing)
            data.id = str(uuid.uuid4())
        await db[coll_name].insert_one(data.dict())
        if coll_name == "tickets":
            await sync_ticket_link(data.dict())
        return data
    return _create


def _generic_update_factory(coll_name: str, Model):
    async def _update(item_id: str, data: dict = Body(...), user: dict = CurrentUser):
        existing = await require_item(coll_name, item_id, user)
        # Whitelist only fields defined by the Pydantic model. This gives us a true
        # partial update ($set only what the client sent) without silently
        # resetting untouched fields to their model defaults.
        allowed = set(Model.model_fields.keys()) - {"id", "trip_id"}
        updates = {k: v for k, v in (data or {}).items() if k in allowed}
        if updates:
            await db[coll_name].update_one({"id": item_id}, {"$set": updates})
        doc = await db[coll_name].find_one({"id": item_id}, {"_id": 0})
        if coll_name == "tickets":
            await sync_ticket_link(doc)
        return Model(**doc)
    return _update


def _generic_delete_factory(coll_name: str):
    async def _delete(item_id: str, user: dict = CurrentUser):
        await require_item(coll_name, item_id, user)
        if coll_name == "tickets":
            for col in TICKET_COLLECTIONS.values():
                await db[col].update_many({"ticket_id": item_id}, {"$set": {"ticket_id": ""}})
        else:
            await clear_item_from_tickets(item_id)
        await db[coll_name].delete_one({"id": item_id})
        return {"ok": True}
    return _delete


# Register endpoints
for kind, model in [("flights", Flight), ("transport", Transport),
                    ("stays", Stay), ("attractions", Attraction), ("tickets", Ticket)]:
    api_router.get(f"/trips/{{trip_id}}/{kind}", response_model=List[model])(
        _generic_list_factory(kind, model)
    )
    api_router.post(f"/trips/{{trip_id}}/{kind}", response_model=model)(
        _generic_create_factory(kind, model)
    )
    api_router.patch(f"/{kind}/{{item_id}}", response_model=model)(
        _generic_update_factory(kind, model)
    )
    api_router.delete(f"/{kind}/{{item_id}}")(_generic_delete_factory(kind))


# ============= DOCUMENTS =============
# Documents can hold photos, PDFs, or any file that doesn't fit a category.
# They can optionally be linked to any other sub-item (flight, stay, ticket, etc.).
# The file bytes live inline as base64. List endpoint strips them out; a dedicated
# GET endpoint returns a single document with its blob.

MAX_DOCUMENT_BYTES = 8 * 1024 * 1024  # 8 MB decoded


def _decoded_size(b64: str) -> int:
    if not b64:
        return 0
    b = b64.split(",", 1)[1] if b64.startswith("data:") else b64
    try:
        return (len(b) * 3) // 4
    except Exception:
        return 0


@api_router.get("/trips/{trip_id}/documents", response_model=List[Document])
async def list_documents(trip_id: str, user: dict = CurrentUser):
    await require_trip(trip_id, user)
    # Exclude the heavy blob from list responses
    docs = await db.documents.find(
        {"trip_id": trip_id},
        {"_id": 0, "file_base64": 0},
    ).to_list(1000)
    return [Document(**d) for d in docs]


@api_router.get("/documents/{item_id}", response_model=Document)
async def get_document(item_id: str, user: dict = CurrentUser):
    doc = await require_item("documents", item_id, user)
    return Document(**doc)


@api_router.post("/trips/{trip_id}/documents", response_model=Document)
async def create_document(trip_id: str, data: Document, user: dict = CurrentUser):
    await require_trip(trip_id, user)
    if _decoded_size(data.file_base64) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "File too large (max 8 MB)")
    data.trip_id = trip_id
    if not data.id:
        data.id = str(uuid.uuid4())
    data.size = _decoded_size(data.file_base64)
    await db.documents.insert_one(data.dict())
    return data


@api_router.patch("/documents/{item_id}", response_model=Document)
async def update_document(item_id: str, data: dict = Body(...), user: dict = CurrentUser):
    await require_item("documents", item_id, user)
    allowed = set(Document.model_fields.keys()) - {"id", "trip_id"}
    updates = {k: v for k, v in (data or {}).items() if k in allowed}
    if "file_base64" in updates:
        if _decoded_size(updates["file_base64"]) > MAX_DOCUMENT_BYTES:
            raise HTTPException(413, "File too large (max 8 MB)")
        updates["size"] = _decoded_size(updates["file_base64"])
    if updates:
        await db.documents.update_one({"id": item_id}, {"$set": updates})
    doc = await db.documents.find_one({"id": item_id}, {"_id": 0})
    return Document(**doc)


@api_router.delete("/documents/{item_id}")
async def delete_document(item_id: str, user: dict = CurrentUser):
    await require_item("documents", item_id, user)
    await db.documents.delete_one({"id": item_id})
    return {"ok": True}


# ============= PUBLIC SHARE (no auth by design, uses share_id) =============

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
    documents = await db.documents.find(
        {"trip_id": trip_id},
        {"_id": 0, "file_base64": 0},  # never leak binaries via public share
    ).to_list(1000)
    return {
        "trip": trip, "flights": flights, "transport": transport,
        "stays": stays, "attractions": attractions, "tickets": tickets,
        "documents": documents,
    }


# ============= GEOCODE / EXCHANGE =============

@api_router.get("/geocode")
async def geocode(q: str = Query(..., min_length=2, max_length=200), user: dict = CurrentUser):
    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "json", "limit": 5, "addressdetails": 1},
                headers={"User-Agent": "TravelSpace/1.0 (travel-app)"},
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.error(f"geocode error: {e}")
            return {"results": []}
    results = [
        {"display_name": item.get("display_name", ""),
         "latitude": float(item["lat"]), "longitude": float(item["lon"])}
        for item in data if item.get("lat") and item.get("lon")
    ]
    return {"results": results}


@api_router.get("/reverse-geocode")
async def reverse_geocode(lat: float, lon: float, user: dict = CurrentUser):
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(400, "Bad coordinates")
    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json"},
                headers={"User-Agent": "TravelSpace/1.0 (travel-app)"},
            )
            r.raise_for_status()
            data = r.json()
        except Exception:
            return {"display_name": ""}
    return {"display_name": data.get("display_name", ""), "latitude": lat, "longitude": lon}


_RATES_CACHE: dict = {"ts": 0, "base": "USD", "rates": {}}
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


@api_router.get("/exchange-rates")
async def exchange_rates(base: str = "USD", user: dict = CurrentUser):
    base = (base or "USD").upper()
    if not CURRENCY_RE.match(base):
        raise HTTPException(400, "Bad currency code")
    now = time.time()
    if _RATES_CACHE.get("base") == base and _RATES_CACHE.get("rates") and now - _RATES_CACHE["ts"] < 6 * 3600:
        return {"base": base, "rates": _RATES_CACHE["rates"], "cached": True}
    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.get(f"https://open.er-api.com/v6/latest/{base}")
            r.raise_for_status()
            data = r.json()
            rates = data.get("rates") or {}
        except Exception as e:
            logger.error(f"exchange rates error: {e}")
            rates = {}
    if rates:
        _RATES_CACHE["ts"] = now
        _RATES_CACHE["base"] = base
        _RATES_CACHE["rates"] = rates
    return {"base": base, "rates": rates, "cached": False}


# ============= RATE LIMITER (per user) =============

_RL_WINDOW = 60.0
_RL_MAX = 10  # 10 AI calls per user per minute
_rl_calls: dict = defaultdict(deque)
_rl_lock = asyncio.Lock()


async def rate_limit_ai(user: dict):
    async with _rl_lock:
        now = time.time()
        q = _rl_calls[user["user_id"]]
        while q and now - q[0] > _RL_WINDOW:
            q.popleft()
        if len(q) >= _RL_MAX:
            raise HTTPException(429, "Too many AI requests; please wait a minute")
        q.append(now)


# ============= AI FLIGHT PARSE =============

class ParseFlightRequest(BaseModel):
    text: str = Field(..., max_length=20000)


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
async def parse_flight(req: ParseFlightRequest, user: dict = CurrentUser):
    await rate_limit_ai(user)
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


# ============= UNIVERSAL BOOKING PARSE =============

MAX_IMAGE_BYTES = 6 * 1024 * 1024  # 6 MB decoded


class ParseBookingRequest(BaseModel):
    text: Optional[str] = Field(None, max_length=20000)
    image_base64: Optional[str] = Field(None, max_length=14_000_000)  # ~10MB decoded (for PDFs)
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
  "ticket": { "cost": number, "cost_currency": string (ISO 4217 3-letter code), "details": string, "link": string, "confirmation": string },
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
  name, location, activity_datetime, website_link, notes

Rules:
- Use ISO 8601 for all dates/times, e.g. 2026-06-01T09:30.
- If the source shows only a date, use T00:00 for time.
- Detect the currency carefully. Return `cost_currency` as an ISO 4217 code (USD, EUR, GBP, JPY, NOK, SEK, DKK, AUD, CAD, INR, CNY, KRW, THB, SGD, HKD, NZD, MXN, BRL, ZAR, CHF, etc.). Look for symbols ($, €, £, ¥, kr, ₹, ₩, ฿, R$, R, Fr) and words (dollars, euros, pounds, yen, kroner, krone, rupees, won). If unclear, use "USD".
- Cost should be a number in the shown currency (no conversion).
- IMPORTANT: Text-only category data must NEVER include HTML/script markup. Location, name, and other string fields are user-facing labels only.
- No code fences, no commentary. JSON only.
"""


@api_router.post("/ai/parse-booking", response_model=ParsedBooking)
async def parse_booking(req: ParseBookingRequest, user: dict = CurrentUser):
    await rate_limit_ai(user)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")
    if not req.text and not req.image_base64:
        raise HTTPException(400, "Provide text or image_base64")

    mime = (req.mime or "").lower()

    # Handle PDF: extract text server-side (Vision APIs can't ingest PDF directly).
    pdf_text = ""
    if req.image_base64 and mime == "application/pdf":
        try:
            import io
            from pypdf import PdfReader
            b64 = req.image_base64.split(",", 1)[1] if req.image_base64.startswith("data:") else req.image_base64
            raw = base64.b64decode(b64, validate=False)
            if len(raw) > MAX_IMAGE_BYTES + 4 * 1024 * 1024:  # allow ~10MB PDFs
                raise HTTPException(413, "PDF too large")
            reader = PdfReader(io.BytesIO(raw))
            parts = []
            for page in reader.pages[:20]:  # cap at 20 pages
                try:
                    parts.append(page.extract_text() or "")
                except Exception:
                    continue
            pdf_text = "\n".join(parts).strip()[:18000]
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"pdf extract failed: {e}")
            raise HTTPException(400, "Could not read PDF")
        if not pdf_text:
            raise HTTPException(400, "PDF has no extractable text. Try uploading a screenshot instead.")

    if req.image_base64 and mime != "application/pdf":
        b64 = req.image_base64.split(",", 1)[1] if req.image_base64.startswith("data:") else req.image_base64
        try:
            decoded_len = (len(b64) * 3) // 4
        except Exception:
            decoded_len = 0
        if decoded_len > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Image too large (max 6 MB)")

    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"parse-booking-{uuid.uuid4()}",
        system_message=UNIVERSAL_SYSTEM,
    ).with_model("openai", "gpt-5.4")

    if pdf_text:
        text_prompt = (
            (req.text.strip() + "\n\n" if req.text else "")
            + "The following text was extracted from a booking PDF. Extract details from it:\n\n"
            + pdf_text
        )
        file_contents = []
    else:
        text_prompt = req.text or "Extract the booking details from this image."
        file_contents = []
        if req.image_base64:
            b64 = req.image_base64.split(",", 1)[1] if req.image_base64.startswith("data:") else req.image_base64
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
    allow_origins=["*"],  # mobile has no Origin header; tighten in production if serving strict web origin
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_indexes():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.trips.create_index("user_id")
        await db.trips.create_index("share_id", unique=True, sparse=True)
    except Exception as e:
        logger.warning(f"index setup: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
