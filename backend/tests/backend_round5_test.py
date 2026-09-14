"""Backend Round 5 tests — client-provided ids / idempotent create.

Covers:
- (B) POST /api/trips with client-provided id:
    * new uuid -> returned trip.id equals uuid
    * repeat same payload -> same id, no duplicate row
    * different name, same id (already owned) -> returns ORIGINAL trip unchanged
- (C) Sub-item POST idempotency on flights:
    * same id + same trip -> returns existing row (no dup)
    * same id + DIFFERENT trip -> server assigns fresh id
- (D) Access control: 2nd user cannot hijack owner's trip id; server allocates fresh id
      and the original trip remains intact under the original owner.
- (E) Seed regression: seed trip, seed token, /trips list preserved.
"""

import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values


_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or _frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
API = f"{BASE_URL}/api"

_backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = _backend_env.get("MONGO_URL") or os.environ["MONGO_URL"]
DB_NAME = _backend_env.get("DB_NAME") or os.environ["DB_NAME"]
_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]

SEED_TOKEN = "demo_marketing_token_12345"
SEED_USER_ID = "user_demo_marketing"
SEED_TRIP_ID = "9fbdeac7-a11c-4be2-a448-9c8560a1b6ad"


def _headers(token):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def seed_headers():
    return _headers(SEED_TOKEN)


@pytest.fixture(scope="module")
def second_user():
    uid = f"user_TEST_R5_{uuid.uuid4().hex[:8]}"
    email = f"test_r5_{uuid.uuid4().hex[:6]}@example.com"
    token = f"tok_TEST_R5_{uuid.uuid4().hex}"
    _db.users.insert_one({
        "user_id": uid, "email": email, "name": "TEST R5",
        "picture": "", "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _db.user_sessions.insert_one({
        "session_token": token, "user_id": uid,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": uid, "email": email, "token": token}
    # Cleanup any trips + sub-items owned by this user
    for t in _db.trips.find({"user_id": uid}):
        tid = t["id"]
        for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
            _db[col].delete_many({"trip_id": tid})
        _db.trips.delete_one({"id": tid})
    _db.user_sessions.delete_many({"user_id": uid})
    _db.users.delete_one({"user_id": uid})


def _cleanup_trip(trip_id):
    for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
        _db[col].delete_many({"trip_id": trip_id})
    _db.trips.delete_one({"id": trip_id})


# ============================================================
# (E) Seed regression — assert first so a failure aborts early
# ============================================================

class TestSeedIntact:
    def test_seed_token_authenticates(self, seed_headers):
        r = requests.get(f"{API}/auth/me", headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["user_id"] == SEED_USER_ID

    def test_seed_trip_still_tokyo_kyoto(self, seed_headers):
        r = requests.get(f"{API}/trips/{SEED_TRIP_ID}", headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Tokyo & Kyoto"

    def test_trips_list_contains_seed(self, seed_headers):
        r = requests.get(f"{API}/trips", headers=seed_headers, timeout=15)
        assert r.status_code == 200
        ids = {t["id"] for t in r.json()}
        assert SEED_TRIP_ID in ids


# ============================================================
# (B) POST /api/trips with client id -- idempotent create
# ============================================================

class TestTripCreateWithClientId:
    def test_new_uuid_is_honoured(self, seed_headers):
        cid = str(uuid.uuid4())
        r = requests.post(f"{API}/trips", json={"id": cid, "name": "T1"},
                          headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == cid
        # DB verification
        assert _db.trips.count_documents({"id": cid}) == 1
        _cleanup_trip(cid)

    def test_repeat_same_payload_no_duplicate(self, seed_headers):
        cid = str(uuid.uuid4())
        r1 = requests.post(f"{API}/trips", json={"id": cid, "name": "T1"},
                           headers=seed_headers, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["id"] == cid

        before = _db.trips.count_documents({"user_id": SEED_USER_ID})
        r2 = requests.post(f"{API}/trips", json={"id": cid, "name": "T1"},
                           headers=seed_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == cid
        after = _db.trips.count_documents({"user_id": SEED_USER_ID})
        assert before == after, "Duplicate trip row created on idempotent POST"
        assert _db.trips.count_documents({"id": cid}) == 1
        _cleanup_trip(cid)

    def test_same_id_different_name_returns_original(self, seed_headers):
        cid = str(uuid.uuid4())
        r1 = requests.post(f"{API}/trips",
                           json={"id": cid, "name": "OriginalName",
                                 "destination": "Paris"},
                           headers=seed_headers, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["name"] == "OriginalName"

        r2 = requests.post(f"{API}/trips",
                           json={"id": cid, "name": "ChangedName",
                                 "destination": "Rome"},
                           headers=seed_headers, timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert body["id"] == cid
        assert body["name"] == "OriginalName", "Idempotent POST leaked new payload into existing trip"
        assert body["destination"] == "Paris"

        # DB verification: still one row with original name
        row = _db.trips.find_one({"id": cid})
        assert row["name"] == "OriginalName"
        assert row["destination"] == "Paris"
        _cleanup_trip(cid)

    def test_delete_cleanup_after_client_id_create(self, seed_headers):
        cid = str(uuid.uuid4())
        r = requests.post(f"{API}/trips", json={"id": cid, "name": "T1"},
                          headers=seed_headers, timeout=15)
        assert r.status_code == 200
        d = requests.delete(f"{API}/trips/{cid}", headers=seed_headers, timeout=15)
        assert d.status_code == 200
        assert _db.trips.count_documents({"id": cid}) == 0


# ============================================================
# (D) Access control — second user can't hijack
# ============================================================

class TestAccessControlClientId:
    def test_second_user_cannot_hijack_id(self, seed_headers, second_user):
        # Owner creates trip with a client-supplied id
        cid = str(uuid.uuid4())
        r1 = requests.post(f"{API}/trips",
                           json={"id": cid, "name": "OwnerTrip",
                                 "destination": "Osaka"},
                           headers=seed_headers, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["id"] == cid

        # Second user attempts to POST a trip with the same id
        r2 = requests.post(f"{API}/trips",
                           json={"id": cid, "name": "HijackAttempt"},
                           headers=_headers(second_user["token"]), timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        # Server should have generated a fresh id
        assert body["id"] != cid, "Second user managed to reuse another user's trip id"
        # And the created trip belongs to the second user
        assert body["name"] == "HijackAttempt"

        # DB verification: original still owned by original owner, unchanged
        original = _db.trips.find_one({"id": cid})
        assert original is not None
        assert original["user_id"] == SEED_USER_ID
        assert original["name"] == "OwnerTrip"
        assert original["destination"] == "Osaka"

        # Second user's fresh trip belongs to them
        theirs = _db.trips.find_one({"id": body["id"]})
        assert theirs["user_id"] == second_user["user_id"]

        # Cleanup
        _cleanup_trip(cid)
        _cleanup_trip(body["id"])


# ============================================================
# (C) Sub-item POST idempotency (flights)
# ============================================================

class TestFlightCreateIdempotency:
    def test_same_id_same_trip_returns_existing(self, seed_headers):
        # Create a trip
        trip_id = str(uuid.uuid4())
        r = requests.post(f"{API}/trips", json={"id": trip_id, "name": "FlightIdemp"},
                          headers=seed_headers, timeout=15)
        assert r.status_code == 200

        fid = str(uuid.uuid4())
        flight_payload = {
            "id": fid, "trip_id": trip_id,
            "flight_number": "TS100", "airline": "TestAir",
            "departure_location": "LAX", "arrival_location": "NRT",
            "cost": 500.0,
        }
        r1 = requests.post(f"{API}/trips/{trip_id}/flights",
                           json=flight_payload, headers=seed_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["id"] == fid

        before = _db.flights.count_documents({"trip_id": trip_id})

        # POST identical -> idempotent, same row returned
        r2 = requests.post(f"{API}/trips/{trip_id}/flights",
                           json=flight_payload, headers=seed_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["id"] == fid
        assert body["airline"] == "TestAir"
        assert body["cost"] == 500.0

        after = _db.flights.count_documents({"trip_id": trip_id})
        assert before == after, "Duplicate flight created on idempotent POST"
        assert _db.flights.count_documents({"id": fid}) == 1

        _cleanup_trip(trip_id)

    def test_same_id_different_trip_generates_fresh(self, seed_headers):
        # Two trips, both client-id'd
        trip_a = str(uuid.uuid4())
        trip_b = str(uuid.uuid4())
        for tid, name in [(trip_a, "TripA"), (trip_b, "TripB")]:
            r = requests.post(f"{API}/trips", json={"id": tid, "name": name},
                              headers=seed_headers, timeout=15)
            assert r.status_code == 200

        fid = str(uuid.uuid4())
        # Create flight under trip A
        r1 = requests.post(
            f"{API}/trips/{trip_a}/flights",
            json={"id": fid, "trip_id": trip_a, "airline": "AirA", "flight_number": "A1"},
            headers=seed_headers, timeout=15,
        )
        assert r1.status_code == 200
        assert r1.json()["id"] == fid

        # Attempt to create flight with same fid under trip B
        r2 = requests.post(
            f"{API}/trips/{trip_b}/flights",
            json={"id": fid, "trip_id": trip_b, "airline": "AirB", "flight_number": "B1"},
            headers=seed_headers, timeout=15,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["id"] != fid, "Server should have re-generated id when reused across trips"
        assert body["trip_id"] == trip_b
        assert body["airline"] == "AirB"

        # DB: original flight untouched under trip A
        orig = _db.flights.find_one({"id": fid})
        assert orig is not None
        assert orig["trip_id"] == trip_a
        assert orig["airline"] == "AirA"

        # Trip B has exactly one flight, id is the new one
        b_flights = list(_db.flights.find({"trip_id": trip_b}))
        assert len(b_flights) == 1
        assert b_flights[0]["id"] == body["id"]

        _cleanup_trip(trip_a)
        _cleanup_trip(trip_b)


# ============================================================
# (E) Post-suite: seed trip STILL intact
# ============================================================

class TestSeedAfter:
    def test_seed_trip_unchanged_after_suite(self, seed_headers):
        r = requests.get(f"{API}/trips/{SEED_TRIP_ID}", headers=seed_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "Tokyo & Kyoto"

    def test_seed_flight_still_present(self, seed_headers):
        r = requests.get(f"{API}/trips/{SEED_TRIP_ID}/flights",
                         headers=seed_headers, timeout=15)
        assert r.status_code == 200
        flights = r.json()
        assert len(flights) >= 1
