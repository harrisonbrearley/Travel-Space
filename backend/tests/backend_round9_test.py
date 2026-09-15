# Round 9 regression tests for Travel Space PWA-on-web deployment.
# Verifies backend endpoints used by the CrossWebView + Nominatim fallback fixes.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://explore-itinerary-30.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- /api/geocode regression -------------------------------------------------
class TestGeocode:
    def test_geocode_paris_en_returns_results(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geocode", params={"q": "Paris", "lang": "en"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "results" in body
        assert isinstance(body["results"], list)
        assert len(body["results"]) > 0
        first = body["results"][0]
        assert "display_name" in first and first["display_name"]
        assert "latitude" in first and "longitude" in first
        assert isinstance(first["latitude"], (int, float))
        assert isinstance(first["longitude"], (int, float))

    def test_geocode_anonymous_no_auth_needed(self, api_client):
        # No Authorization header → still 200
        r = requests.get(f"{BASE_URL}/api/geocode", params={"q": "London", "lang": "en"}, timeout=15)
        assert r.status_code == 200, r.text


# --- /api/ai/parse-booking-multi regression ----------------------------------
class TestParseBookingMulti:
    def test_parse_booking_multi_flight_text(self, api_client):
        payload = {"text": "Delta 456 JFK to CDG June 5 2027"}
        r = api_client.post(f"{BASE_URL}/api/ai/parse-booking-multi", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        assert len(body["items"]) >= 1
        first = body["items"][0]
        assert first.get("category") == "flight"
        data = first.get("data") or {}
        # Loose asserts — LLM output may vary slightly but must include core fields
        assert data.get("airline", "").lower().startswith("delta") or "delta" in data.get("airline", "").lower()
        assert "456" in str(data.get("flight_number", ""))
        # Year must be 2027 (explicitly stated in the prompt)
        assert "2027" in str(data.get("departure_datetime", ""))

    def test_parse_booking_multi_anonymous_no_auth_needed(self, api_client):
        r = requests.post(
            f"{BASE_URL}/api/ai/parse-booking-multi",
            json={"text": "Delta 456 JFK to CDG June 5 2027"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
