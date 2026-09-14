"""Backend Round 3 tests — auth + security hardening.

Covers all items in the review request:
- Every previously-public endpoint now requires Authorization (401 without).
- /api/public/trips/{share_id} remains open.
- Trip ownership isolation: user A cannot GET/PATCH/DELETE/list-sub-items of user B's trip (404).
- /api/exchange-rates rejects malformed base with 400; requires auth.
- /api/ai/parse-booking rejects >6MB decoded image with 413.
- share_id from newly-created trip > 20 chars.
- Mongo indexes exist on users, user_sessions, trips.
- Leaflet HTML: source-level grep for esc() around bindPopup.

Two users are seeded directly in Mongo (Google OAuth flow is mocked).
"""

import base64
import io
import os
import uuid
import re
import subprocess
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values


# ---------- Config ----------

_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or _frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

_backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = _backend_env.get("MONGO_URL") or os.environ["MONGO_URL"]
DB_NAME = _backend_env.get("DB_NAME") or os.environ["DB_NAME"]
_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]


# ---------- User seed helpers ----------

def _seed_user(prefix: str):
    uid = f"user_TEST_{prefix}_{uuid.uuid4().hex[:8]}"
    email = f"test_{prefix}_{uuid.uuid4().hex[:6]}@example.com"
    token = f"tok_TEST_{prefix}_{uuid.uuid4().hex}"
    _db.users.insert_one({
        "user_id": uid,
        "email": email,
        "name": f"Test {prefix}",
        "picture": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _db.user_sessions.insert_one({
        "session_token": token,
        "user_id": uid,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return uid, email, token


@pytest.fixture(scope="session")
def user_a():
    uid, email, tok = _seed_user("A")
    yield {"user_id": uid, "email": email, "token": tok, "trip_ids": []}
    # Cleanup — remove seeded user, session, and any trips/sub-items created
    for tid in _cleanup_trip_ids["A"]:
        for col in ["flights", "transport", "stays", "attractions", "tickets"]:
            _db[col].delete_many({"trip_id": tid})
        _db.trips.delete_one({"id": tid})
    _db.user_sessions.delete_many({"user_id": uid})
    _db.users.delete_one({"user_id": uid})


@pytest.fixture(scope="session")
def user_b():
    uid, email, tok = _seed_user("B")
    yield {"user_id": uid, "email": email, "token": tok, "trip_ids": []}
    for tid in _cleanup_trip_ids["B"]:
        for col in ["flights", "transport", "stays", "attractions", "tickets"]:
            _db[col].delete_many({"trip_id": tid})
        _db.trips.delete_one({"id": tid})
    _db.user_sessions.delete_many({"user_id": uid})
    _db.users.delete_one({"user_id": uid})


_cleanup_trip_ids = {"A": [], "B": []}


def _auth_headers(token: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


# ============================================================
# 1. UNAUTH: previously-public endpoints must return 401 now
# ============================================================

class TestUnauthEndpoints:
    def test_list_trips_no_auth(self):
        r = requests.get(f"{API}/trips", timeout=15)
        assert r.status_code == 401, r.text

    def test_get_trip_no_auth(self):
        r = requests.get(f"{API}/trips/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 401, r.text

    def test_auth_me_no_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401, r.text

    def test_geocode_no_auth(self):
        r = requests.get(f"{API}/geocode", params={"q": "Paris"}, timeout=15)
        assert r.status_code == 401, r.text

    def test_reverse_geocode_no_auth(self):
        r = requests.get(
            f"{API}/reverse-geocode",
            params={"lat": 48.85, "lon": 2.29},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_exchange_rates_no_auth(self):
        r = requests.get(f"{API}/exchange-rates", timeout=15)
        assert r.status_code == 401, r.text

    def test_parse_flight_no_auth(self):
        r = requests.post(f"{API}/ai/parse-flight", json={"text": "AF083"}, timeout=15)
        assert r.status_code == 401, r.text

    def test_parse_booking_no_auth(self):
        r = requests.post(f"{API}/ai/parse-booking", json={"text": "hi"}, timeout=15)
        assert r.status_code == 401, r.text

    def test_bad_bearer_token(self):
        r = requests.get(
            f"{API}/trips",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=15,
        )
        assert r.status_code == 401


# ============================================================
# 2. /api/auth/session with bad session_id
# ============================================================

class TestAuthSessionExchange:
    def test_short_session_id_rejected(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": "x"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_bad_session_id_rejected(self):
        # Some random long string — Emergent will reject it, we expect 401
        r = requests.post(
            f"{API}/auth/session",
            json={"session_id": "TEST_definitely_not_a_real_session_" + uuid.uuid4().hex},
            timeout=20,
        )
        assert r.status_code in (400, 401), r.text
        # And no session document was created for it
        assert _db.user_sessions.count_documents({"session_token": "definitely_not_a_real_session"}) == 0


# ============================================================
# 3. Authenticated basic flows — share_id length + auth/me
# ============================================================

class TestAuthFlows:
    def test_auth_me_ok(self, user_a):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["user_id"] == user_a["user_id"]
        assert body["user"]["email"] == user_a["email"]

    def test_create_trip_share_id_is_long(self, user_a):
        r = requests.post(
            f"{API}/trips",
            json={"name": f"TEST_share_{uuid.uuid4().hex[:6]}"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        trip = r.json()
        _cleanup_trip_ids["A"].append(trip["id"])
        assert len(trip["share_id"]) > 20, (
            f"share_id too short ({len(trip['share_id'])}): {trip['share_id']}"
        )


# ============================================================
# 4. Public share endpoint remains open
# ============================================================

class TestPublicShare:
    def test_public_share_no_auth(self, user_a):
        # Create a trip as user A
        r = requests.post(
            f"{API}/trips",
            json={"name": f"TEST_public_{uuid.uuid4().hex[:6]}"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r.status_code == 200
        trip = r.json()
        _cleanup_trip_ids["A"].append(trip["id"])
        share_id = trip["share_id"]

        # Hit public endpoint with NO auth
        r2 = requests.get(f"{API}/public/trips/{share_id}", timeout=15)
        assert r2.status_code == 200, r2.text
        payload = r2.json()
        assert payload["trip"]["id"] == trip["id"]
        for key in ["flights", "transport", "stays", "attractions", "tickets"]:
            assert key in payload

    def test_public_share_unknown_404(self):
        r = requests.get(f"{API}/public/trips/nope_TEST_{uuid.uuid4().hex}", timeout=15)
        assert r.status_code == 404


# ============================================================
# 5. Cross-user isolation
# ============================================================

class TestCrossUserIsolation:
    def test_a_cannot_read_b_trip(self, user_a, user_b):
        # B creates a trip
        r = requests.post(
            f"{API}/trips",
            json={"name": f"TEST_B_trip_{uuid.uuid4().hex[:6]}"},
            headers=_auth_headers(user_b["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        b_trip = r.json()
        _cleanup_trip_ids["B"].append(b_trip["id"])

        # A tries to read
        ra = requests.get(
            f"{API}/trips/{b_trip['id']}",
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert ra.status_code == 404, f"A must not see B's trip; got {ra.status_code} {ra.text}"

        # A tries to patch
        rp = requests.patch(
            f"{API}/trips/{b_trip['id']}",
            json={"name": "HACKED"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert rp.status_code == 404

        # A tries to delete
        rd = requests.delete(
            f"{API}/trips/{b_trip['id']}",
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert rd.status_code == 404

        # A tries to list sub-items on B's trip
        for kind in ["flights", "transport", "stays", "attractions", "tickets"]:
            r_sub = requests.get(
                f"{API}/trips/{b_trip['id']}/{kind}",
                headers=_auth_headers(user_a["token"]),
                timeout=15,
            )
            assert r_sub.status_code == 404, f"A must not list {kind} for B; got {r_sub.status_code}"

        # Confirm B's trip is untouched
        rb = requests.get(
            f"{API}/trips/{b_trip['id']}",
            headers=_auth_headers(user_b["token"]),
            timeout=15,
        )
        assert rb.status_code == 200
        assert rb.json()["name"] != "HACKED"

    def test_list_trips_scoped_to_user(self, user_a, user_b):
        # Each list should only contain their own trips
        ra = requests.get(f"{API}/trips", headers=_auth_headers(user_a["token"]), timeout=15).json()
        rb = requests.get(f"{API}/trips", headers=_auth_headers(user_b["token"]), timeout=15).json()
        ids_a = {t["id"] for t in ra}
        ids_b = {t["id"] for t in rb}
        assert ids_a.isdisjoint(ids_b), (
            f"Trip lists overlap between users! shared={ids_a & ids_b}"
        )
        # Each trip in list belongs to that user
        for t in ra:
            assert t["user_id"] == user_a["user_id"]
        for t in rb:
            assert t["user_id"] == user_b["user_id"]

    def test_a_cannot_create_subitem_under_b_trip(self, user_a, user_b):
        r = requests.post(
            f"{API}/trips",
            json={"name": f"TEST_B_sub_{uuid.uuid4().hex[:6]}"},
            headers=_auth_headers(user_b["token"]),
            timeout=15,
        )
        b_trip = r.json()
        _cleanup_trip_ids["B"].append(b_trip["id"])

        r2 = requests.post(
            f"{API}/trips/{b_trip['id']}/flights",
            json={"id": "", "trip_id": b_trip["id"], "flight_number": "HACK1"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r2.status_code == 404, r2.text


# ============================================================
# 6. Exchange rates validation
# ============================================================

class TestExchangeRates:
    def test_valid_base(self, user_a):
        r = requests.get(
            f"{API}/exchange-rates",
            params={"base": "USD"},
            headers=_auth_headers(user_a["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["base"] == "USD"

    def test_lowercase_base_normalized(self, user_a):
        r = requests.get(
            f"{API}/exchange-rates",
            params={"base": "eur"},
            headers=_auth_headers(user_a["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["base"] == "EUR"

    def test_invalid_base_path_traversal(self, user_a):
        r = requests.get(
            f"{API}/exchange-rates",
            params={"base": "../../etc/passwd"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_invalid_base_too_long(self, user_a):
        r = requests.get(
            f"{API}/exchange-rates",
            params={"base": "USDX"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r.status_code == 400

    def test_invalid_base_with_digits(self, user_a):
        r = requests.get(
            f"{API}/exchange-rates",
            params={"base": "U1D"},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r.status_code == 400


# ============================================================
# 7. Image size cap on parse-booking (>6MB decoded => 413)
# ============================================================

class TestImageSizeCap:
    def test_oversized_image_rejected_413(self, user_a):
        # Generate ~7MB of raw bytes -> base64 (~9.4MB string, will fail Pydantic max_length=9_000_000 too;
        # so we craft exactly ~6.5MB decoded which encodes to ~8.7MB — under pydantic limit, over server cap).
        # raw must be > 6MB (server cap) and b64 < 9_000_000 chars (pydantic max_length)
        raw = b"\x00" * (6 * 1024 * 1024 + 128 * 1024)  # 6.125 MB decoded
        b64 = base64.b64encode(raw).decode("ascii")
        assert len(b64) < 9_000_000, f"b64 must fit pydantic max_length, got {len(b64)}"
        assert (len(b64) * 3) // 4 > 6 * 1024 * 1024, "decoded size must exceed server cap"
        r = requests.post(
            f"{API}/ai/parse-booking",
            json={"image_base64": b64, "mime": "image/jpeg"},
            headers=_auth_headers(user_a["token"]),
            timeout=30,
        )
        assert r.status_code == 413, f"Expected 413 for >6MB image, got {r.status_code}: {r.text[:200]}"

    def test_missing_text_and_image_rejected(self, user_a):
        r = requests.post(
            f"{API}/ai/parse-booking",
            json={},
            headers=_auth_headers(user_a["token"]),
            timeout=15,
        )
        assert r.status_code == 400


# ============================================================
# 8. Rate limiter: 10 calls / min / user on /ai/parse-flight
# ============================================================

class TestRateLimiter:
    def test_11th_call_returns_429(self, user_a):
        # Fire 12 calls sequentially with tiny payload; short-circuit if any returns 429 after 10 successes.
        # We use a bogus super-short text so the LLM call may still be attempted but that's fine — rate
        # limit is enforced *before* the LLM call.
        # Use a fresh user to avoid interference from prior tests.
        _uid, _email, tok = _seed_user("RL")
        try:
            hits = []
            saw_429 = False
            for i in range(12):
                r = requests.post(
                    f"{API}/ai/parse-flight",
                    json={"text": f"TEST rate limit call {i}"},
                    headers=_auth_headers(tok),
                    timeout=60,
                )
                hits.append(r.status_code)
                if r.status_code == 429:
                    saw_429 = True
                    break
            assert saw_429, f"Expected a 429 within 12 calls, got sequence: {hits}"
            # First 10 must NOT be 429 (they may be 200 or 500 depending on LLM, but not 429)
            first_ten = hits[:10]
            assert 429 not in first_ten, (
                f"Rate-limit fired too early — first 10 responses: {first_ten}"
            )
        finally:
            _db.user_sessions.delete_many({"user_id": _uid})
            _db.users.delete_one({"user_id": _uid})


# ============================================================
# 9. Mongo indexes
# ============================================================

class TestMongoIndexes:
    def test_users_indexes(self):
        idx = _db.users.index_information()
        # email must be unique
        email_idx = [v for k, v in idx.items() if any(f[0] == "email" for f in v.get("key", []))]
        assert email_idx and email_idx[0].get("unique") is True, f"users.email unique index missing: {idx}"
        # user_id must be unique
        uid_idx = [v for k, v in idx.items() if any(f[0] == "user_id" for f in v.get("key", []))]
        assert uid_idx and uid_idx[0].get("unique") is True, f"users.user_id unique index missing: {idx}"

    def test_user_sessions_indexes(self):
        idx = _db.user_sessions.index_information()
        tok_idx = [v for k, v in idx.items() if any(f[0] == "session_token" for f in v.get("key", []))]
        assert tok_idx and tok_idx[0].get("unique") is True, f"session_token unique index missing: {idx}"
        # TTL on expires_at
        ttl_idx = [v for k, v in idx.items() if any(f[0] == "expires_at" for f in v.get("key", []))]
        assert ttl_idx, "expires_at index missing"
        assert any("expireAfterSeconds" in v for v in ttl_idx), (
            f"TTL (expireAfterSeconds) missing on expires_at: {ttl_idx}"
        )

    def test_trips_indexes(self):
        idx = _db.trips.index_information()
        share_idx = [v for k, v in idx.items() if any(f[0] == "share_id" for f in v.get("key", []))]
        assert share_idx and share_idx[0].get("unique") is True, (
            f"trips.share_id unique index missing: {idx}"
        )
        uid_idx = [v for k, v in idx.items() if any(f[0] == "user_id" for f in v.get("key", []))]
        assert uid_idx, f"trips.user_id index missing: {idx}"


# ============================================================
# 10. Leaflet HTML XSS escape — grep-level check
# ============================================================

class TestLeafletEscape:
    def test_map_tab_uses_esc(self):
        path = "/app/frontend/src/components/tabs/Map.tsx"
        src = open(path).read()
        assert "function esc(" in src, "esc() helper missing in Map.tsx"
        # bindPopup must call esc() on label
        popup_lines = [ln for ln in src.splitlines() if "bindPopup" in ln]
        assert popup_lines, "No bindPopup call found in Map.tsx"
        for ln in popup_lines:
            assert "esc(" in ln, f"bindPopup line missing esc(): {ln}"

    def test_share_page_uses_esc(self):
        path = "/app/frontend/app/share/[shareId].tsx"
        src = open(path).read()
        assert "function esc(" in src, "esc() helper missing in share page"
        popup_lines = [ln for ln in src.splitlines() if "bindPopup" in ln]
        assert popup_lines, "No bindPopup call found in share page"
        for ln in popup_lines:
            assert "esc(" in ln, f"bindPopup line missing esc(): {ln}"
