"""Backend API tests for WanderPlan travel app."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://explore-itinerary-30.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def trip_id(s):
    r = s.post(f"{API}/trips", json={
        "name": "TEST_Backend Trip",
        "destination": "Tokyo",
        "start_date": "2026-03-01",
        "end_date": "2026-03-10",
        "category": "upcoming",
        "budget_planned": 3000
    })
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    yield tid
    s.delete(f"{API}/trips/{tid}")


# --- Health ---
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


# --- Trips CRUD ---
def test_list_trips(s):
    r = s.get(f"{API}/trips")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_trip(s, trip_id):
    r = s.get(f"{API}/trips/{trip_id}")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == trip_id
    assert d["name"] == "TEST_Backend Trip"
    assert d["budget_planned"] == 3000
    assert "itinerary_filters" in d


def test_patch_trip(s, trip_id):
    r = s.patch(f"{API}/trips/{trip_id}", json={
        "destination": "Kyoto",
        "itinerary_filters": {"flights": False, "transport": True, "stay": True, "attractions": True}
    })
    assert r.status_code == 200
    assert r.json()["destination"] == "Kyoto"
    # verify persistence
    r2 = s.get(f"{API}/trips/{trip_id}")
    assert r2.json()["destination"] == "Kyoto"
    assert r2.json()["itinerary_filters"]["flights"] is False


def test_get_trip_not_found(s):
    r = s.get(f"{API}/trips/does-not-exist-xyz")
    assert r.status_code == 404


# --- Sub-items CRUD + cascade delete ---
class TestSubItems:
    def test_flight_crud(self, s, trip_id):
        r = s.post(f"{API}/trips/{trip_id}/flights", json={
            "trip_id": trip_id, "flight_number": "AA100", "airline": "AA",
            "departure_location": "JFK", "arrival_location": "NRT",
            "booking_status": "booked", "cost": 800
        })
        assert r.status_code == 200
        fid = r.json()["id"]

        r = s.get(f"{API}/trips/{trip_id}/flights")
        assert any(f["id"] == fid for f in r.json())

        r = s.patch(f"{API}/flights/{fid}", json={
            "trip_id": trip_id, "flight_number": "AA200", "airline": "AA",
            "cost": 900, "booking_status": "booked"
        })
        assert r.status_code == 200
        assert r.json()["flight_number"] == "AA200"
        assert r.json()["cost"] == 900

        r = s.delete(f"{API}/flights/{fid}")
        assert r.status_code == 200

    def test_transport_crud(self, s, trip_id):
        r = s.post(f"{API}/trips/{trip_id}/transport", json={
            "trip_id": trip_id, "transport_type": "train",
            "departure_location": "Tokyo", "arrival_location": "Kyoto",
            "booking_status": "not_booked", "cost": 100
        })
        assert r.status_code == 200
        tid = r.json()["id"]
        r = s.patch(f"{API}/transport/{tid}", json={
            "trip_id": trip_id, "transport_type": "bus", "cost": 50, "booking_status": "booked"
        })
        assert r.status_code == 200
        assert r.json()["transport_type"] == "bus"
        s.delete(f"{API}/transport/{tid}")

    def test_stay_crud(self, s, trip_id):
        r = s.post(f"{API}/trips/{trip_id}/stays", json={
            "trip_id": trip_id, "accommodation_name": "TEST_Hotel",
            "breakfast_included": True, "cost": 200, "booking_status": "booked"
        })
        assert r.status_code == 200
        sid = r.json()["id"]
        assert r.json()["breakfast_included"] is True
        r = s.patch(f"{API}/stays/{sid}", json={
            "trip_id": trip_id, "accommodation_name": "TEST_Hotel2",
            "dinner_included": True, "cost": 250, "booking_status": "booked"
        })
        assert r.json()["dinner_included"] is True
        s.delete(f"{API}/stays/{sid}")

    def test_attraction_crud(self, s, trip_id):
        r = s.post(f"{API}/trips/{trip_id}/attractions", json={
            "trip_id": trip_id, "name": "Skytree", "cost": 30,
            "booking_status": "pay_on_arrival"
        })
        assert r.status_code == 200
        aid = r.json()["id"]
        r = s.patch(f"{API}/attractions/{aid}", json={
            "trip_id": trip_id, "name": "Fuji", "cost": 40,
            "booking_status": "pay_on_arrival"
        })
        assert r.json()["name"] == "Fuji"
        s.delete(f"{API}/attractions/{aid}")

    def test_ticket_crud(self, s, trip_id):
        r = s.post(f"{API}/trips/{trip_id}/tickets", json={
            "trip_id": trip_id, "link": "http://x", "cost": 100,
            "details": "e-ticket", "ticket_type": "flight"
        })
        assert r.status_code == 200
        tkid = r.json()["id"]
        r = s.patch(f"{API}/tickets/{tkid}", json={
            "trip_id": trip_id, "cost": 150, "ticket_type": "flight", "details": "updated"
        })
        assert r.json()["cost"] == 150
        s.delete(f"{API}/tickets/{tkid}")


def test_cascade_delete(s):
    # create a trip + sub-items, delete trip, verify sub-items gone
    r = s.post(f"{API}/trips", json={"name": "TEST_Cascade"})
    tid = r.json()["id"]
    s.post(f"{API}/trips/{tid}/flights", json={"trip_id": tid, "flight_number": "X1"})
    s.post(f"{API}/trips/{tid}/stays", json={"trip_id": tid, "accommodation_name": "H"})

    r = s.delete(f"{API}/trips/{tid}")
    assert r.status_code == 200

    # trip gone
    assert s.get(f"{API}/trips/{tid}").status_code == 404
    # sub-items gone
    assert s.get(f"{API}/trips/{tid}/flights").json() == []
    assert s.get(f"{API}/trips/{tid}/stays").json() == []


# --- AI parse flight (real Emergent LLM call) ---
def test_ai_parse_flight(s):
    sample = (
        "Booking confirmation: Delta DL215 from Los Angeles (LAX) to Tokyo Haneda (HND) "
        "departing 2026-05-15 at 11:20 arriving 2026-05-16 at 15:45. No layovers."
    )
    r = s.post(f"{API}/ai/parse-flight", json={"text": sample}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    # Just verify at least some fields extracted
    non_empty = [k for k, v in d.items() if v and k != "layovers"]
    assert len(non_empty) >= 3, f"AI extracted too few fields: {d}"
