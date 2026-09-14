"""Backend Round 4 tests — iteration 4 review.

Covers:
- (A) Partial PATCH regression on flights/transport/stays/attractions/tickets/documents.
- (B) Documents CRUD (create, list without blob, get single with blob, patch notes only, delete).
- (C) Documents access control — second seeded user gets 404 on the first user's document.
- (D) Invite lifecycle — collab: preview no-auth, accept, second user can PATCH sub-items,
      cannot DELETE trip.
- (E) Invite lifecycle — copy: deep-clone with ticket <-> item ID remap preserved.
- (F) parse-booking PDF path: mime=application/pdf with invalid bytes returns 400
      "Could not read PDF".
- (G) Regression: seeded user /trips list still returns seeded trip; existing flight still
      present; /auth/me still works. Preserves seed token demo_marketing_token_12345.
"""

import base64
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


def _headers(token: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def seed_headers():
    return _headers(SEED_TOKEN)


@pytest.fixture(scope="session")
def second_user():
    uid = f"user_TEST_R4_{uuid.uuid4().hex[:8]}"
    email = f"test_r4_{uuid.uuid4().hex[:6]}@example.com"
    token = f"tok_TEST_R4_{uuid.uuid4().hex}"
    _db.users.insert_one({
        "user_id": uid, "email": email, "name": "TEST R4",
        "picture": "", "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _db.user_sessions.insert_one({
        "session_token": token, "user_id": uid,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": uid, "email": email, "token": token}
    # Cleanup: any trips owned by this test user + collab entries
    for t in _db.trips.find({"user_id": uid}):
        tid = t["id"]
        for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
            _db[col].delete_many({"trip_id": tid})
        _db.trips.delete_one({"id": tid})
    _db.trips.update_many({"collaborators": uid}, {"$pull": {"collaborators": uid}})
    _db.user_sessions.delete_many({"user_id": uid})
    _db.users.delete_one({"user_id": uid})


@pytest.fixture
def temp_trip(seed_headers):
    """A fresh trip owned by seeded user for isolated tests (auto-deleted)."""
    r = requests.post(
        f"{API}/trips",
        json={"name": f"TEST_R4_{uuid.uuid4().hex[:6]}", "destination": "Tokyo"},
        headers=seed_headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    trip = r.json()
    yield trip
    # Cascade cleanup
    for col in ["flights", "transport", "stays", "attractions", "tickets", "documents"]:
        _db[col].delete_many({"trip_id": trip["id"]})
    _db.trips.delete_one({"id": trip["id"]})
    _db.trip_invites.delete_many({"trip_id": trip["id"]})


# ============================================================
# (G) Regression: seed data still accessible
# ============================================================

class TestSeedRegression:
    def test_auth_me_still_works(self, seed_headers):
        r = requests.get(f"{API}/auth/me", headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["user_id"] == SEED_USER_ID

    def test_trips_list_includes_seed_trip(self, seed_headers):
        r = requests.get(f"{API}/trips", headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        ids = {t["id"] for t in r.json()}
        assert SEED_TRIP_ID in ids, f"Seed trip {SEED_TRIP_ID} missing from list"

    def test_existing_flight_present(self, seed_headers):
        r = requests.get(
            f"{API}/trips/{SEED_TRIP_ID}/flights", headers=seed_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        flights = r.json()
        assert len(flights) >= 1, "Seed trip should have >=1 flight"
        # Marketing seed had QF25 Qantas SYD->HND
        assert any(f.get("flight_number") == "QF25" for f in flights), \
            f"Expected QF25 in seed flights: {[f.get('flight_number') for f in flights]}"


# ============================================================
# (A) Partial PATCH regression — flights/transport/stays/attractions/tickets/documents
# ============================================================

class TestPartialPatchRegression:
    """For each sub-item type: create with full data, PATCH ONE field, GET, assert others unchanged."""

    def test_flight_partial_patch(self, seed_headers, temp_trip):
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "flight_number": "AF999", "airline": "Air France",
            "departure_location": "JFK", "arrival_location": "CDG",
            "departure_datetime": "2026-06-01T09:30",
            "arrival_datetime": "2026-06-01T22:45",
            "cost": 812.5, "cost_currency": "EUR",
            "booking_status": "booked", "notes": "Window seat",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/flights",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        original = r.json()

        # PATCH ONLY notes
        r = requests.patch(f"{API}/flights/{original['id']}",
                           json={"notes": "Aisle seat"},
                           headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        updated = r.json()

        assert updated["notes"] == "Aisle seat"
        for k in ["flight_number", "airline", "departure_location", "arrival_location",
                  "departure_datetime", "arrival_datetime", "cost", "cost_currency",
                  "booking_status"]:
            assert updated[k] == original[k], f"flight.{k} changed: {original[k]} -> {updated[k]}"

    def test_transport_partial_patch(self, seed_headers, temp_trip):
        body = {
            "id": "", "trip_id": temp_trip["id"], "transport_type": "train",
            "departure_location": "Paris Gare de Lyon",
            "arrival_location": "Lyon Part-Dieu",
            "departure_datetime": "2026-06-05T08:00",
            "arrival_datetime": "2026-06-05T10:00",
            "cost": 79.0, "cost_currency": "EUR",
            "booking_status": "booked", "notes": "TGV inOui",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/transport",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        original = r.json()

        r = requests.patch(f"{API}/transport/{original['id']}",
                           json={"cost": 89.5}, headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["cost"] == 89.5
        for k in ["transport_type", "departure_location", "arrival_location",
                  "departure_datetime", "arrival_datetime", "cost_currency",
                  "booking_status", "notes"]:
            assert updated[k] == original[k], f"transport.{k} changed"

    def test_stay_partial_patch(self, seed_headers, temp_trip):
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "accommodation_name": "Hotel Le Meurice",
            "location": "228 Rue de Rivoli, Paris",
            "checkin_datetime": "2026-06-01T15:00",
            "checkout_datetime": "2026-06-07T12:00",
            "breakfast_included": True, "dinner_included": False,
            "booking_status": "booked", "cost": 2400.0, "cost_currency": "EUR",
            "booking_link": "https://booking.com/x",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/stays",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        original = r.json()

        r = requests.patch(f"{API}/stays/{original['id']}",
                           json={"dinner_included": True}, headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["dinner_included"] is True
        for k in ["accommodation_name", "location", "checkin_datetime",
                  "checkout_datetime", "breakfast_included", "booking_status",
                  "cost", "cost_currency", "booking_link"]:
            assert updated[k] == original[k], f"stay.{k} changed"

    def test_attraction_partial_patch(self, seed_headers, temp_trip):
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "name": "Eiffel Tower Tour",
            "location": "Champ de Mars, Paris",
            "activity_datetime": "2026-06-03T10:30",
            "website_link": "https://getyourguide.com/x",
            "booking_status": "booked", "cost": 149.0, "cost_currency": "EUR",
            "notes": "Bring passport",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/attractions",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        original = r.json()

        r = requests.patch(f"{API}/attractions/{original['id']}",
                           json={"notes": "ID needed"}, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        updated = r.json()
        assert updated["notes"] == "ID needed"
        for k in ["name", "location", "activity_datetime", "website_link",
                  "booking_status", "cost", "cost_currency"]:
            assert updated[k] == original[k], f"attraction.{k} changed"

    def test_ticket_partial_patch(self, seed_headers, temp_trip):
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "ticket_type": "other", "details": "Museum pass",
            "cost": 55.0, "cost_currency": "EUR",
            "link": "https://parismuseumpass.fr",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/tickets",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        original = r.json()

        r = requests.patch(f"{API}/tickets/{original['id']}",
                           json={"details": "4-day Paris Museum Pass"},
                           headers=seed_headers, timeout=15)
        assert r.status_code == 200
        updated = r.json()
        assert updated["details"] == "4-day Paris Museum Pass"
        for k in ["ticket_type", "cost", "cost_currency", "link"]:
            assert updated[k] == original[k], f"ticket.{k} changed"

    def test_document_partial_patch(self, seed_headers, temp_trip):
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "name": "Passport scan", "kind": "photo", "mime": "image/jpeg",
            "file_base64": base64.b64encode(b"hello world tiny doc").decode(),
            "notes": "Front page", "linked_type": "none",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/documents",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        original = r.json()

        r = requests.patch(f"{API}/documents/{original['id']}",
                           json={"notes": "Back page"}, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        updated = r.json()
        assert updated["notes"] == "Back page"
        for k in ["name", "kind", "mime", "file_base64", "size", "linked_type"]:
            assert updated[k] == original[k], f"document.{k} changed: {original[k]!r} -> {updated[k]!r}"


# ============================================================
# (B) Documents CRUD
# ============================================================

class TestDocumentsCRUD:
    def test_full_lifecycle(self, seed_headers, temp_trip):
        blob = base64.b64encode(b"PDF-ish payload for TEST").decode()
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "name": "Boarding pass", "kind": "pdf", "mime": "application/pdf",
            "file_base64": blob, "notes": "Print before airport",
            "linked_type": "none",
        }

        # CREATE
        r = requests.post(f"{API}/trips/{temp_trip['id']}/documents",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["id"]
        assert created["size"] > 0, f"size not computed: {created}"

        # LIST — file_base64 must be stripped (empty string), size non-zero
        r = requests.get(f"{API}/trips/{temp_trip['id']}/documents",
                         headers=seed_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        listed = next((d for d in docs if d["id"] == created["id"]), None)
        assert listed is not None
        assert listed["file_base64"] == "", \
            f"list should strip file_base64, got {len(listed['file_base64'])} chars"
        assert listed["size"] > 0
        assert listed["name"] == "Boarding pass"

        # GET single — blob present
        r = requests.get(f"{API}/documents/{created['id']}",
                         headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        single = r.json()
        assert single["file_base64"] == blob, "single GET should return blob"
        assert single["size"] > 0

        # PATCH notes only — everything else unchanged
        r = requests.patch(f"{API}/documents/{created['id']}",
                           json={"notes": "Updated notes only"},
                           headers=seed_headers, timeout=15)
        assert r.status_code == 200
        patched = r.json()
        assert patched["notes"] == "Updated notes only"
        assert patched["file_base64"] == blob, "PATCH must not clobber file_base64"
        assert patched["size"] == created["size"], "size unchanged when blob unchanged"

        # DELETE
        r = requests.delete(f"{API}/documents/{created['id']}",
                            headers=seed_headers, timeout=15)
        assert r.status_code == 200

        # Verify gone
        r = requests.get(f"{API}/documents/{created['id']}",
                         headers=seed_headers, timeout=15)
        assert r.status_code == 404


# ============================================================
# (C) Documents access control — second user gets 404
# ============================================================

class TestDocumentsAccessControl:
    def test_second_user_cannot_read_first_users_doc(
        self, seed_headers, second_user, temp_trip,
    ):
        blob = base64.b64encode(b"private doc").decode()
        body = {
            "id": "", "trip_id": temp_trip["id"],
            "name": "Private", "kind": "other", "mime": "text/plain",
            "file_base64": blob,
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/documents",
                          json=body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        doc = r.json()

        other_hdr = _headers(second_user["token"])

        # GET single -> 404
        r = requests.get(f"{API}/documents/{doc['id']}",
                         headers=other_hdr, timeout=15)
        assert r.status_code == 404, f"second user got {r.status_code} on GET"

        # LIST via trip -> 404 (trip itself is inaccessible)
        r = requests.get(f"{API}/trips/{temp_trip['id']}/documents",
                         headers=other_hdr, timeout=15)
        assert r.status_code == 404

        # PATCH -> 404
        r = requests.patch(f"{API}/documents/{doc['id']}",
                           json={"notes": "hack"}, headers=other_hdr, timeout=15)
        assert r.status_code == 404

        # DELETE -> 404
        r = requests.delete(f"{API}/documents/{doc['id']}",
                            headers=other_hdr, timeout=15)
        assert r.status_code == 404


# ============================================================
# (D) Invite lifecycle — collab
# ============================================================

class TestInviteCollab:
    def test_collab_lifecycle(self, seed_headers, second_user, temp_trip):
        # Owner creates invite
        r = requests.post(f"{API}/trips/{temp_trip['id']}/invites",
                          json={"mode": "collab"},
                          headers=seed_headers, timeout=15)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["mode"] == "collab"
        assert inv["token"] and len(inv["token"]) > 10

        # GET preview WITHOUT auth
        r = requests.get(f"{API}/invites/{inv['token']}", timeout=15)
        assert r.status_code == 200, r.text
        preview = r.json()
        assert preview["mode"] == "collab"
        assert preview["trip_name"] == temp_trip["name"]
        assert preview["expired"] is False
        # owner_email is masked on public preview (privacy fix per prior review)
        assert preview["owner_email"] == "", \
            "Public invite preview must not leak owner_email"
        assert preview["owner_name"], "owner_name should be set on preview"

        other_hdr = _headers(second_user["token"])

        # Second user accepts
        r = requests.post(f"{API}/invites/{inv['token']}/accept",
                          headers=other_hdr, timeout=15)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["mode"] == "collab"
        assert result["trip_id"] == temp_trip["id"]

        # Second user's /trips list includes the collaborated trip
        r = requests.get(f"{API}/trips", headers=other_hdr, timeout=15)
        assert r.status_code == 200
        ids = {t["id"] for t in r.json()}
        assert temp_trip["id"] in ids, f"Collab trip missing from second user's list: {ids}"

        # Second user can PATCH a sub-item on that trip
        # First create a flight (as owner or collab — collab should be allowed)
        flight_body = {
            "id": "", "trip_id": temp_trip["id"],
            "flight_number": "COLLAB1", "airline": "TestAir",
            "cost": 100.0, "cost_currency": "USD",
        }
        r = requests.post(f"{API}/trips/{temp_trip['id']}/flights",
                          json=flight_body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        flight = r.json()

        # Collaborator PATCHes flight notes
        r = requests.patch(f"{API}/flights/{flight['id']}",
                           json={"notes": "Edited by collab"},
                           headers=other_hdr, timeout=15)
        assert r.status_code == 200, f"Collab PATCH failed: {r.status_code} {r.text}"
        assert r.json()["notes"] == "Edited by collab"
        # And other fields preserved
        assert r.json()["flight_number"] == "COLLAB1"

        # Second user CANNOT delete the trip (owner_only)
        r = requests.delete(f"{API}/trips/{temp_trip['id']}",
                            headers=other_hdr, timeout=15)
        assert r.status_code in (403, 404), \
            f"Collaborator must not delete trip; got {r.status_code}"

        # Owner CAN delete their own collaborator
        r = requests.delete(
            f"{API}/trips/{temp_trip['id']}/collaborators/{second_user['user_id']}",
            headers=seed_headers, timeout=15,
        )
        assert r.status_code == 200

        # Now second user should NOT see the trip in list
        r = requests.get(f"{API}/trips", headers=other_hdr, timeout=15)
        ids = {t["id"] for t in r.json()}
        assert temp_trip["id"] not in ids, "Trip should be removed from ex-collab's list"


# ============================================================
# (E) Invite lifecycle — copy (deep clone with ticket <-> item link remap)
# ============================================================

class TestInviteCopy:
    def test_copy_clones_with_link_remap(self, seed_headers, second_user, temp_trip):
        trip_id = temp_trip["id"]

        # Set up original: a flight + a ticket linked to it
        flight_body = {
            "id": "", "trip_id": trip_id,
            "flight_number": "CLONE1", "airline": "OriginAir",
            "departure_location": "NRT", "arrival_location": "SFO",
            "cost": 900.0, "cost_currency": "USD", "notes": "Orig flight",
        }
        r = requests.post(f"{API}/trips/{trip_id}/flights",
                          json=flight_body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        orig_flight = r.json()

        ticket_body = {
            "id": "", "trip_id": trip_id,
            "ticket_type": "flight", "linked_item_id": orig_flight["id"],
            "details": "Ticket for CLONE1", "cost": 900.0,
            "cost_currency": "USD",
        }
        r = requests.post(f"{API}/trips/{trip_id}/tickets",
                          json=ticket_body, headers=seed_headers, timeout=15)
        assert r.status_code == 200
        orig_ticket = r.json()

        # Confirm bidirectional link in original
        r = requests.get(f"{API}/trips/{trip_id}/flights",
                         headers=seed_headers, timeout=15)
        orig_flight_after = next(f for f in r.json() if f["id"] == orig_flight["id"])
        assert orig_flight_after["ticket_id"] == orig_ticket["id"]

        # Owner creates copy invite
        r = requests.post(f"{API}/trips/{trip_id}/invites",
                          json={"mode": "copy"},
                          headers=seed_headers, timeout=15)
        assert r.status_code == 200
        inv = r.json()
        assert inv["mode"] == "copy"

        other_hdr = _headers(second_user["token"])

        # Second user accepts
        r = requests.post(f"{API}/invites/{inv['token']}/accept",
                          headers=other_hdr, timeout=15)
        assert r.status_code == 200
        result = r.json()
        assert result["mode"] == "copy"
        new_trip_id = result["trip_id"]
        assert new_trip_id != trip_id, "Copy must yield a NEW trip id"

        # Fetch the clone as accepter
        r = requests.get(f"{API}/trips/{new_trip_id}",
                         headers=other_hdr, timeout=15)
        assert r.status_code == 200
        clone_trip = r.json()
        assert clone_trip["user_id"] == second_user["user_id"]
        assert clone_trip["name"].lower().startswith("copy of ")

        # Cloned flights
        r = requests.get(f"{API}/trips/{new_trip_id}/flights",
                         headers=other_hdr, timeout=15)
        assert r.status_code == 200
        cloned_flights = r.json()
        assert len(cloned_flights) == 1
        cf = cloned_flights[0]
        assert cf["flight_number"] == "CLONE1"
        assert cf["id"] != orig_flight["id"], "Cloned flight must have new UUID"
        assert cf["trip_id"] == new_trip_id

        # Cloned tickets
        r = requests.get(f"{API}/trips/{new_trip_id}/tickets",
                         headers=other_hdr, timeout=15)
        assert r.status_code == 200
        cloned_tickets = r.json()
        assert len(cloned_tickets) == 1
        ct = cloned_tickets[0]
        assert ct["id"] != orig_ticket["id"], "Cloned ticket must have new UUID"
        assert ct["trip_id"] == new_trip_id

        # CRITICAL: link remap in clone
        assert ct["linked_item_id"] == cf["id"], \
            f"Cloned ticket.linked_item_id should point to cloned flight, got {ct['linked_item_id']} vs cf={cf['id']}"
        assert cf["ticket_id"] == ct["id"], \
            f"Cloned flight.ticket_id should point to cloned ticket, got {cf['ticket_id']} vs ct={ct['id']}"

        # Deleting clone does NOT affect original
        r = requests.delete(f"{API}/trips/{new_trip_id}",
                            headers=other_hdr, timeout=15)
        assert r.status_code == 200

        # Original flight + ticket still exist
        r = requests.get(f"{API}/trips/{trip_id}/flights",
                         headers=seed_headers, timeout=15)
        assert r.status_code == 200
        ids = {f["id"] for f in r.json()}
        assert orig_flight["id"] in ids, "Original flight destroyed by clone deletion!"

        r = requests.get(f"{API}/trips/{trip_id}/tickets",
                         headers=seed_headers, timeout=15)
        ids = {t["id"] for t in r.json()}
        assert orig_ticket["id"] in ids, "Original ticket destroyed by clone deletion!"


# ============================================================
# (F) parse-booking PDF path — invalid PDF bytes -> 400
# ============================================================

class TestParseBookingPDFInvalid:
    def test_invalid_pdf_bytes_returns_400(self, seed_headers):
        # Not valid PDF bytes
        fake_bytes = b"This is not a real PDF file just plain text"
        b64 = base64.b64encode(fake_bytes).decode()
        r = requests.post(
            f"{API}/ai/parse-booking",
            json={"image_base64": b64, "mime": "application/pdf"},
            headers=seed_headers, timeout=30,
        )
        # Expected: 400 "Could not read PDF" (per server code, pypdf raises inside try
        # and gets remapped to HTTPException(400, "Could not read PDF")).
        assert r.status_code == 400, \
            f"Expected 400 for invalid PDF, got {r.status_code}: {r.text[:300]}"
        detail = r.json().get("detail", "")
        assert "PDF" in detail, f"Expected PDF-related error, got: {detail}"
