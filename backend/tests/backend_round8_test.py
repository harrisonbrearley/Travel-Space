"""Round 8 backend tests — Travel Space regression + new features.

Covers:
  A. GET /api/geocode?q=&lang= — result schema + language forwarding.
  B. GET /api/reverse-geocode?lat=&lon=&lang= — same, plus 400 on bad coords.
  C. POST /api/ai/parse-booking-multi — text single, text multi, future-year, malformed.
  D. POST /api/ai/parse-booking — legacy single-shape still works.
  E. Regression: health, trips CRUD, sub-items, invites, exchange-rates, public share.
"""

import os
import uuid
from datetime import datetime

import pytest
import requests
from dotenv import dotenv_values


_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or _frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

# Task also asks us to use local backend at http://localhost:8001 for direct calls
LOCAL_API = "http://localhost:8001/api"

SEED_TOKEN = "demo_marketing_token_12345"
SEED_UID = "user_demo_marketing"
SEED_TRIP_ID = "9fbdeac7-a11c-4be2-a448-9c8560a1b6ad"


def H(token: str = SEED_TOKEN) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


# ============================================================
# A. Geocoding — language forwarding
# ============================================================

class TestGeocode:
    def test_geocode_english_shanghai(self):
        r = requests.get(
            f"{LOCAL_API}/geocode",
            params={"q": "Shanghai Pudong Airport", "lang": "en"},
            headers=H(),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "results" in body and isinstance(body["results"], list)
        # Nominatim may occasionally return zero, but should return >0 for a well-known airport
        assert len(body["results"]) >= 1, f"Expected results for Shanghai Pudong: {body}"
        first = body["results"][0]
        for k in ("display_name", "latitude", "longitude"):
            assert k in first
        assert isinstance(first["display_name"], str) and first["display_name"]
        assert isinstance(first["latitude"], float)
        assert isinstance(first["longitude"], float)
        # Lat/lon for Pudong is ~31.14 / 121.80
        assert 30 < first["latitude"] < 32
        assert 121 < first["longitude"] < 122.5
        # Latin script sanity check (English should not be all CJK)
        # We only assert it's *a* string; content depends on Nominatim.

    def test_geocode_chinese_lang(self):
        r = requests.get(
            f"{LOCAL_API}/geocode",
            params={"q": "Shanghai Pudong Airport", "lang": "zh-CN"},
            headers=H(),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "results" in body
        # Accept even 0 results (upstream fluke), but if results exist, coords are still numeric.
        for item in body["results"]:
            assert isinstance(item["display_name"], str)
            assert isinstance(item["latitude"], float)
            assert isinstance(item["longitude"], float)

    def test_geocode_requires_auth(self):
        r = requests.get(f"{LOCAL_API}/geocode", params={"q": "Paris"}, timeout=15)
        assert r.status_code == 401, r.status_code

    def test_geocode_min_length(self):
        r = requests.get(f"{LOCAL_API}/geocode", params={"q": "a"}, headers=H(), timeout=15)
        assert r.status_code == 422, r.status_code


# ============================================================
# B. Reverse geocoding
# ============================================================

class TestReverseGeocode:
    def test_reverse_geocode_ok(self):
        # Eiffel Tower
        r = requests.get(
            f"{LOCAL_API}/reverse-geocode",
            params={"lat": 48.8584, "lon": 2.2945, "lang": "en"},
            headers=H(),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "display_name" in body
        assert body.get("latitude") == 48.8584
        assert body.get("longitude") == 2.2945

    def test_reverse_geocode_lang_chinese(self):
        r = requests.get(
            f"{LOCAL_API}/reverse-geocode",
            params={"lat": 31.1443, "lon": 121.8083, "lang": "zh-CN"},
            headers=H(),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "display_name" in body

    def test_reverse_geocode_bad_coords(self):
        r = requests.get(
            f"{LOCAL_API}/reverse-geocode",
            params={"lat": 999, "lon": 999},
            headers=H(),
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_reverse_geocode_requires_auth(self):
        r = requests.get(
            f"{LOCAL_API}/reverse-geocode",
            params={"lat": 0, "lon": 0},
            timeout=15,
        )
        assert r.status_code == 401


# ============================================================
# C. AI parse-booking-multi
# ============================================================

class TestParseBookingMulti:
    def test_empty_text_returns_400(self):
        r = requests.post(f"{LOCAL_API}/ai/parse-booking-multi", headers=H(), json={"text": ""}, timeout=20)
        assert r.status_code == 400, r.text

    def test_no_body_returns_400(self):
        r = requests.post(f"{LOCAL_API}/ai/parse-booking-multi", headers=H(), json={}, timeout=20)
        assert r.status_code == 400, r.text

    def test_requires_auth(self):
        r = requests.post(f"{LOCAL_API}/ai/parse-booking-multi", json={"text": "flight EK405 LHR-DXB"}, timeout=20)
        assert r.status_code == 401, r.status_code

    def test_single_flight_text(self):
        payload = {
            "text": (
                "Booking confirmation: Emirates flight EK405 from London Heathrow (LHR) to Dubai (DXB) "
                "departing 2027-06-15 21:30, arriving 2027-06-16 08:20. Confirmation code: ABC123."
            )
        }
        r = requests.post(f"{LOCAL_API}/ai/parse-booking-multi", headers=H(), json=payload, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        assert len(body["items"]) == 1, f"Expected 1 item, got {len(body['items'])}: {body}"
        item = body["items"][0]
        assert item["category"] == "flight", f"Expected flight, got {item['category']}"
        data = item.get("data") or {}
        # Should have at least the flight number captured
        assert data.get("flight_number", "").upper().startswith("EK") or "EK405" in str(data)

    def test_multi_train_bookings_csv(self):
        payload = {
            "text": (
                "operator,train_number,from,to,departure,arrival\n"
                "Eurostar,9014,London St Pancras,Paris Nord,2027-05-10 07:01,2027-05-10 10:17\n"
                "Eurostar,9051,Paris Nord,London St Pancras,2027-05-14 15:13,2027-05-14 16:39\n"
            )
        }
        r = requests.post(f"{LOCAL_API}/ai/parse-booking-multi", headers=H(), json=payload, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("items"), list)
        assert len(body["items"]) >= 2, f"Expected >=2 items (CSV with 2 trains), got {len(body['items'])}: {body}"
        cats = [it.get("category") for it in body["items"]]
        # All two rows should be transport/train
        assert all(c in ("transport", "train") for c in cats[:2]) or "transport" in cats, cats

    def test_partial_date_future_year(self):
        """Text with a date but no year — emitted datetime must NOT be in the past (2025)."""
        payload = {"text": "Flight AA100 from JFK to LAX. Depart on March 15 at 09:30."}
        r = requests.post(f"{LOCAL_API}/ai/parse-booking-multi", headers=H(), json=payload, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("items"), "No items returned"
        # Look at any ISO-8601 dates found across items[].data
        found_dates = []
        for it in body["items"]:
            data = it.get("data") or {}
            for k, v in data.items():
                if isinstance(v, str) and len(v) >= 10 and v[4] == "-" and v[7] == "-":
                    found_dates.append((k, v))
        assert found_dates, f"No datetime found: {body}"
        for k, v in found_dates:
            year = int(v[:4])
            assert year >= 2026, f"Year must be future (>=2026), got {year} for {k}={v}"


# ============================================================
# D. Legacy parse-booking still returns single shape
# ============================================================

class TestParseBookingLegacy:
    def test_legacy_single_shape(self):
        payload = {
            "text": "Emirates flight EK405 LHR-DXB depart 2027-06-15 21:30 arrive 2027-06-16 08:20."
        }
        r = requests.post(f"{LOCAL_API}/ai/parse-booking", headers=H(), json=payload, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        # Legacy single-item shape
        assert "category" in body and "data" in body and "confidence" in body
        assert body["category"] in ("flight", "unknown"), body["category"]
        assert isinstance(body["data"], dict)

    def test_legacy_empty_text_400(self):
        r = requests.post(f"{LOCAL_API}/ai/parse-booking", headers=H(), json={"text": ""}, timeout=15)
        assert r.status_code == 400, r.text


# ============================================================
# E. Regression on existing endpoints
# ============================================================

class TestHealth:
    def test_health(self):
        r = requests.get(f"{LOCAL_API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_ingress_health(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


class TestTripsCRUDAndSubItems:
    """Full CRUD on a scratch trip with each sub-item type, then delete."""

    @pytest.fixture(scope="class")
    def trip(self):
        r = requests.post(
            f"{LOCAL_API}/trips",
            headers=H(),
            json={"name": f"TEST_R8_{uuid.uuid4().hex[:6]}", "destination": "Testville"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        t = r.json()
        yield t
        requests.delete(f"{LOCAL_API}/trips/{t['id']}", headers=H(), timeout=15)

    def test_trip_get_and_update(self, trip):
        tid = trip["id"]
        r = requests.get(f"{LOCAL_API}/trips/{tid}", headers=H(), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == tid
        # PATCH
        rp = requests.patch(
            f"{LOCAL_API}/trips/{tid}",
            headers=H(),
            json={"destination": "Updatedville"},
            timeout=15,
        )
        assert rp.status_code == 200, rp.text
        assert rp.json()["destination"] == "Updatedville"

    def test_list_trips_contains(self, trip):
        r = requests.get(f"{LOCAL_API}/trips", headers=H(), timeout=15)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert trip["id"] in ids

    def test_flight_crud(self, trip):
        tid = trip["id"]
        rc = requests.post(
            f"{LOCAL_API}/trips/{tid}/flights",
            headers=H(),
            json={"trip_id": tid, "flight_number": "TS1", "airline": "TestAir"},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        fid = rc.json()["id"]
        rl = requests.get(f"{LOCAL_API}/trips/{tid}/flights", headers=H(), timeout=15)
        assert rl.status_code == 200
        assert any(f["id"] == fid for f in rl.json())
        rd = requests.delete(f"{LOCAL_API}/flights/{fid}", headers=H(), timeout=15)
        assert rd.status_code == 200

    def test_transport_crud(self, trip):
        tid = trip["id"]
        rc = requests.post(
            f"{LOCAL_API}/trips/{tid}/transport",
            headers=H(),
            json={"trip_id": tid, "mode": "train", "operator": "TestRail"},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        tp_id = rc.json()["id"]
        rl = requests.get(f"{LOCAL_API}/trips/{tid}/transport", headers=H(), timeout=15)
        assert rl.status_code == 200
        assert any(x["id"] == tp_id for x in rl.json())
        requests.delete(f"{LOCAL_API}/transport/{tp_id}", headers=H(), timeout=15)

    def test_stays_crud(self, trip):
        tid = trip["id"]
        rc = requests.post(
            f"{LOCAL_API}/trips/{tid}/stays",
            headers=H(),
            json={"trip_id": tid, "name": "Test Hotel"},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        sid = rc.json()["id"]
        rl = requests.get(f"{LOCAL_API}/trips/{tid}/stays", headers=H(), timeout=15)
        assert any(x["id"] == sid for x in rl.json())
        requests.delete(f"{LOCAL_API}/stays/{sid}", headers=H(), timeout=15)

    def test_attractions_crud(self, trip):
        tid = trip["id"]
        rc = requests.post(
            f"{LOCAL_API}/trips/{tid}/attractions",
            headers=H(),
            json={"trip_id": tid, "name": "Test Attraction"},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        aid = rc.json()["id"]
        rl = requests.get(f"{LOCAL_API}/trips/{tid}/attractions", headers=H(), timeout=15)
        assert any(x["id"] == aid for x in rl.json())
        requests.delete(f"{LOCAL_API}/attractions/{aid}", headers=H(), timeout=15)

    def test_tickets_crud(self, trip):
        tid = trip["id"]
        rc = requests.post(
            f"{LOCAL_API}/trips/{tid}/tickets",
            headers=H(),
            json={"trip_id": tid, "name": "Test Ticket"},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        tk_id = rc.json()["id"]
        rl = requests.get(f"{LOCAL_API}/trips/{tid}/tickets", headers=H(), timeout=15)
        assert any(x["id"] == tk_id for x in rl.json())
        requests.delete(f"{LOCAL_API}/tickets/{tk_id}", headers=H(), timeout=15)

    def test_documents_crud(self, trip):
        import base64
        tid = trip["id"]
        b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32).decode()
        rc = requests.post(
            f"{LOCAL_API}/trips/{tid}/documents",
            headers=H(),
            json={"trip_id": tid, "name": "TEST.png", "mime": "image/png", "file_base64": b64},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        did = rc.json()["id"]
        rl = requests.get(f"{LOCAL_API}/trips/{tid}/documents", headers=H(), timeout=15)
        listed = [d for d in rl.json() if d["id"] == did]
        assert listed
        assert listed[0].get("file_base64", "") == ""  # blob stripped
        requests.delete(f"{LOCAL_API}/documents/{did}", headers=H(), timeout=15)


class TestInvites:
    def test_invite_create_and_preview(self):
        # Use a scratch trip so we don't pollute the seed
        rt = requests.post(f"{LOCAL_API}/trips", headers=H(), json={"name": f"TEST_R8_INV_{uuid.uuid4().hex[:6]}"}, timeout=15)
        assert rt.status_code == 200
        tid = rt.json()["id"]
        try:
            ri = requests.post(
                f"{LOCAL_API}/trips/{tid}/invites",
                headers=H(),
                json={"mode": "collab"},
                timeout=15,
            )
            assert ri.status_code == 200, ri.text
            token = ri.json()["token"]
            rp = requests.get(f"{LOCAL_API}/invites/{token}", timeout=15)
            assert rp.status_code == 200
            assert rp.json().get("expired") is False
        finally:
            requests.delete(f"{LOCAL_API}/trips/{tid}", headers=H(), timeout=15)


class TestExchangeRates:
    def test_exchange_rates(self):
        r = requests.get(f"{LOCAL_API}/exchange-rates", headers=H(), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "rates" in body and isinstance(body["rates"], dict)
        assert body["rates"].get("USD") == 1 or body["rates"].get("USD") == 1.0 or "USD" in body["rates"]


class TestPublicShare:
    def test_public_share_endpoint(self):
        # Seed trip has share_id — fetch it via authenticated GET first.
        r = requests.get(f"{LOCAL_API}/trips/{SEED_TRIP_ID}", headers=H(), timeout=15)
        assert r.status_code == 200
        share_id = r.json().get("share_id")
        if not share_id:
            pytest.skip("Seed trip has no share_id")
        rp = requests.get(f"{LOCAL_API}/public/trips/{share_id}", timeout=15)
        assert rp.status_code == 200
        body = rp.json()
        assert "trip" in body
        assert body["trip"]["id"] == SEED_TRIP_ID
