"""Backend tests - Round 2 WanderPlan features.

Covers:
- Geocode / reverse-geocode (Nominatim proxy)
- Trip auto share_id + public share endpoint
- Ticket <-> item bidirectional link sync (create/relink/delete/item-delete)
- POST /api/ai/parse-booking (text + optional image)
"""

import base64
import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except FileNotFoundError:
        pass

assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL is not configured"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------

def test_health_root(client):
    r = client.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Geocode ----------

class TestGeocode:
    def test_geocode_eiffel(self, client):
        r = client.get(f"{API}/geocode", params={"q": "Eiffel Tower"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data
        assert len(data["results"]) >= 1, "Expected at least 1 geocode result"
        first = data["results"][0]
        assert isinstance(first["latitude"], (int, float))
        assert isinstance(first["longitude"], (int, float))
        assert first["display_name"]

    def test_reverse_geocode_eiffel(self, client):
        r = client.get(
            f"{API}/reverse-geocode",
            params={"lat": 48.8582, "lon": 2.2945},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("display_name"), f"Expected non-empty display_name, got {data}"


# ---------- Trip create + public share ----------

@pytest.fixture(scope="module")
def trip_with_data():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    payload = {
        "name": f"TEST_Round2_{uuid.uuid4().hex[:6]}",
        "destination": "Paris, France",
        "start_date": "2026-06-01",
        "end_date": "2026-06-07",
        "category": "upcoming",
        "budget_planned": 1000.0,
    }
    r = s.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    trip = r.json()
    yield s, trip
    try:
        s.delete(f"{API}/trips/{trip['id']}", timeout=15)
    except Exception:
        pass


class TestTripShare:
    def test_trip_has_share_id(self, trip_with_data):
        _, trip = trip_with_data
        assert trip.get("share_id"), "Trip missing auto-generated share_id"
        assert len(trip["share_id"]) >= 6

    def test_public_share_endpoint(self, trip_with_data):
        s, trip = trip_with_data
        r = s.get(f"{API}/public/trips/{trip['share_id']}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["trip", "flights", "transport", "stays", "attractions", "tickets"]:
            assert key in data, f"public payload missing '{key}'"
        assert data["trip"]["id"] == trip["id"]
        assert isinstance(data["flights"], list)
        assert isinstance(data["tickets"], list)


# ---------- Ticket <-> item link sync ----------

class TestTicketLinkSync:
    def test_full_link_sync_lifecycle(self, trip_with_data):
        s, trip = trip_with_data
        trip_id = trip["id"]

        # 1) Create two flights
        flight_body = {
            "id": "",
            "trip_id": trip_id,
            "flight_number": "AF123",
            "airline": "Air France",
            "departure_location": "JFK",
            "arrival_location": "CDG",
        }
        r = s.post(f"{API}/trips/{trip_id}/flights", json=flight_body, timeout=15)
        assert r.status_code == 200, r.text
        flight1 = r.json()
        assert flight1["ticket_id"] == ""

        flight2_body = dict(flight_body, flight_number="AF456",
                            departure_location="CDG", arrival_location="FCO")
        r = s.post(f"{API}/trips/{trip_id}/flights", json=flight2_body, timeout=15)
        assert r.status_code == 200
        flight2 = r.json()

        # 2) Create ticket linked to flight1
        ticket_body = {
            "id": "",
            "trip_id": trip_id,
            "ticket_type": "flight",
            "linked_item_id": flight1["id"],
            "details": "TEST ticket for flight1",
            "cost": 350.0,
        }
        r = s.post(f"{API}/trips/{trip_id}/tickets", json=ticket_body, timeout=15)
        assert r.status_code == 200, r.text
        ticket = r.json()
        ticket_id = ticket["id"]
        assert ticket_id
        assert ticket["linked_item_id"] == flight1["id"]

        # Verify flight1.ticket_id == ticket.id
        r = s.get(f"{API}/trips/{trip_id}/flights", timeout=15)
        flights = {f["id"]: f for f in r.json()}
        assert flights[flight1["id"]]["ticket_id"] == ticket_id, \
            "flight1.ticket_id should equal ticket.id after linking"
        assert flights[flight2["id"]]["ticket_id"] == "", "flight2.ticket_id should be empty"

        # 3) Relink ticket to flight2
        relink_body = dict(ticket_body, linked_item_id=flight2["id"])
        r = s.patch(f"{API}/tickets/{ticket_id}", json=relink_body, timeout=15)
        assert r.status_code == 200, r.text

        r = s.get(f"{API}/trips/{trip_id}/flights", timeout=15)
        flights = {f["id"]: f for f in r.json()}
        assert flights[flight1["id"]]["ticket_id"] == "", (
            "flight1.ticket_id should be cleared after relink; got "
            f"{flights[flight1['id']]['ticket_id']}"
        )
        assert flights[flight2["id"]]["ticket_id"] == ticket_id, \
            "flight2.ticket_id should equal ticket.id"

        # 4) Delete ticket -> both flights should have empty ticket_id
        r = s.delete(f"{API}/tickets/{ticket_id}", timeout=15)
        assert r.status_code == 200
        r = s.get(f"{API}/trips/{trip_id}/flights", timeout=15)
        flights = {f["id"]: f for f in r.json()}
        assert flights[flight1["id"]]["ticket_id"] == ""
        assert flights[flight2["id"]]["ticket_id"] == ""

        # 5) Item-delete cascade: create ticket for flight1, delete flight1, ticket.linked_item_id should clear
        ticket_body2 = dict(ticket_body, id="", linked_item_id=flight1["id"], details="TEST ticket2")
        r = s.post(f"{API}/trips/{trip_id}/tickets", json=ticket_body2, timeout=15)
        assert r.status_code == 200
        ticket2 = r.json()
        assert ticket2["linked_item_id"] == flight1["id"]

        r = s.delete(f"{API}/flights/{flight1['id']}", timeout=15)
        assert r.status_code == 200
        r = s.get(f"{API}/trips/{trip_id}/tickets", timeout=15)
        tickets = {t["id"]: t for t in r.json()}
        assert tickets[ticket2["id"]]["linked_item_id"] == "", (
            "After deleting flight, ticket.linked_item_id should be cleared; got "
            f"{tickets[ticket2['id']]['linked_item_id']}"
        )

        # cleanup extras
        s.delete(f"{API}/tickets/{ticket2['id']}", timeout=15)
        s.delete(f"{API}/flights/{flight2['id']}", timeout=15)


# ---------- Universal booking parser (LLM) ----------

HOTEL_TEXT = """Booking.com Confirmation
Property: Hotel Le Meurice
Address: 228 Rue de Rivoli, 75001 Paris, France
Check-in: Monday, 15 June 2026 from 15:00
Check-out: Friday, 19 June 2026 by 12:00
Guest: John Doe
Room: Deluxe Double Room
Total: EUR 2,400
Breakfast: Included
Confirmation number: 1234.567.890
"""

FLIGHT_TEXT = """Air France Booking Confirmation
Booking reference: AB12CD
Passenger: John Doe
Flight AF083
From: New York JFK (JFK) - Terminal 1
Departure: 01 Jun 2026, 19:30
To: Paris Charles de Gaulle (CDG) - Terminal 2E
Arrival: 02 Jun 2026, 09:00
Class: Economy
Total: USD 780
"""

ATTRACTION_TEXT = """GetYourGuide Booking Confirmation
Activity: Skip-the-Line Eiffel Tower Guided Summit Tour
Date: Wednesday, 17 June 2026
Start time: 10:30
Meeting point: 5 Avenue Anatole France, 75007 Paris
Duration: 2 hours
Adults: 2
Total: EUR 149
Booking reference: GYG-9876543
"""


class TestParseBooking:
    def test_parse_booking_stay(self, client):
        r = client.post(f"{API}/ai/parse-booking", json={"text": HOTEL_TEXT}, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] == "stay", f"Expected stay, got {body['category']} - {body}"
        d = body.get("data", {})
        assert d.get("accommodation_name"), f"Missing accommodation_name: {d}"
        assert d.get("location"), f"Missing location: {d}"
        assert d.get("checkin_datetime"), f"Missing checkin_datetime: {d}"
        assert d.get("checkout_datetime"), f"Missing checkout_datetime: {d}"

    def test_parse_booking_flight(self, client):
        r = client.post(f"{API}/ai/parse-booking", json={"text": FLIGHT_TEXT}, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] == "flight", f"Expected flight, got {body['category']} - {body}"
        d = body.get("data", {})
        assert d.get("airline"), f"Missing airline: {d}"
        assert d.get("flight_number"), f"Missing flight_number: {d}"
        assert d.get("departure_location"), f"Missing departure_location: {d}"
        assert d.get("arrival_location"), f"Missing arrival_location: {d}"
        assert d.get("departure_datetime"), f"Missing departure_datetime: {d}"
        assert d.get("arrival_datetime"), f"Missing arrival_datetime: {d}"

    def test_parse_booking_attraction(self, client):
        r = client.post(f"{API}/ai/parse-booking", json={"text": ATTRACTION_TEXT}, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] == "attraction", f"Expected attraction, got {body['category']} - {body}"
        d = body.get("data", {})
        assert d.get("name"), f"Missing name: {d}"
        assert d.get("activity_datetime"), f"Missing activity_datetime: {d}"

    def test_parse_booking_image(self, client):
        """Soft: image content quality varies. Uses a real JPEG with readable booking text."""
        try:
            from PIL import Image, ImageDraw, ImageFont
        except Exception:
            pytest.skip("Pillow not available")

        img = Image.new("RGB", (800, 500), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 22)
            font_sm = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 18)
        except Exception:
            font = ImageFont.load_default()
            font_sm = font
        y = 20
        draw.text((20, y), "Booking.com Confirmation", fill=(0, 0, 0), font=font); y += 40
        draw.text((20, y), "Hotel Le Meurice, Paris, France", fill=(0, 0, 0), font=font_sm); y += 30
        draw.text((20, y), "Check-in: 15 Jun 2026 15:00", fill=(0, 0, 0), font=font_sm); y += 30
        draw.text((20, y), "Check-out: 19 Jun 2026 12:00", fill=(0, 0, 0), font=font_sm); y += 30
        draw.text((20, y), "Guest: John Doe", fill=(0, 0, 0), font=font_sm); y += 30
        draw.text((20, y), "Total: EUR 2400 - Breakfast Included", fill=(0, 0, 0), font=font_sm); y += 30
        draw.text((20, y), "Confirmation: 1234.567.890", fill=(0, 0, 0), font=font_sm)
        for i in range(0, 800, 10):
            draw.line([(i, 480), (i + 5, 495)], fill=(120, 120, 120))

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        r = client.post(
            f"{API}/ai/parse-booking",
            json={"image_base64": b64, "mime": "image/jpeg"},
            timeout=180,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] != "unknown", (
            f"Image parse returned unknown - LLM may not have read image. Body: {body}"
        )
