"""Backend Round 6 tests — PNG validity, /health endpoints, DELETE /auth/me cascade.

Covers the review request:
 A. PNG validity for every .png under /app/frontend/assets/ (recursive) — magic bytes,
    Pillow format=="PNG", opens+verifies.  Also confirms app.json icon paths resolve.
 B. GET/HEAD /health both at root and under /api — no auth required.
 C. DELETE /api/auth/me — scratch user with a trip+flight+collab-on-seed-trip; after
    delete, scratch resources gone, session revoked, seed trip intact (except the
    collaborator removed), seed token still authenticates.
 D. Very light regression from Round 5 (partial PATCH flight, documents create+list,
    invite lifecycle) — NON-destructive to seed data.
"""

import base64
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image
from pymongo import MongoClient


# ---------------- Config ----------------

_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or _frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

_backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = _backend_env["MONGO_URL"].strip('"')
DB_NAME = _backend_env["DB_NAME"].strip('"')
_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]

SEED_TOKEN = "demo_marketing_token_12345"
SEED_UID = "user_demo_marketing"
SEED_TRIP_ID = "9fbdeac7-a11c-4be2-a448-9c8560a1b6ad"

PNG_SIG = b"\x89PNG\r\n\x1a\n"

ASSETS_ROOT = Path("/app/frontend/assets")


def _hdr(token: str) -> dict:
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


# ============================================================
# A. PNG validity — regression for the AAPT compile failure
# ============================================================

def _list_pngs():
    return sorted(str(p) for p in ASSETS_ROOT.rglob("*.png"))


class TestPngValidity:
    def test_at_least_the_ten_expected_pngs_exist(self):
        expected = {
            "/app/frontend/assets/images/travel-space-logo.png",
            "/app/frontend/assets/images/travel-space-cover.png",
            "/app/frontend/assets/images/icon.png",
            "/app/frontend/assets/images/adaptive-icon.png",
            "/app/frontend/assets/images/splash-image.png",
            "/app/frontend/assets/images/favicon.png",
            "/app/frontend/assets/marketing/hero.png",
            "/app/frontend/assets/marketing/autoimport.png",
            "/app/frontend/assets/marketing/multiscreen.png",
            "/app/frontend/assets/marketing/share.png",
        }
        found = set(_list_pngs())
        missing = expected - found
        assert not missing, f"Missing PNGs: {missing}"

    @pytest.mark.parametrize("png_path", _list_pngs())
    def test_png_is_real_png(self, png_path):
        p = Path(png_path)
        assert p.is_file(), f"Not a file: {p}"
        assert p.stat().st_size > 0, f"Empty file: {p}"
        with open(p, "rb") as f:
            head = f.read(8)
        assert head == PNG_SIG, (
            f"{p} does not start with PNG magic bytes; got {head.hex()}"
        )
        with Image.open(p) as im:
            fmt = im.format
            im.verify()
        assert fmt == "PNG", f"{p} Pillow format={fmt!r}, expected 'PNG'"

    def test_app_json_icon_paths_resolve(self):
        app_json = json.loads(Path("/app/frontend/app.json").read_text())
        expo = app_json["expo"]
        icon_paths = {
            "icon": expo.get("icon"),
            "android.adaptive-icon.foregroundImage": expo.get("android", {})
            .get("adaptiveIcon", {})
            .get("foregroundImage"),
            "web.favicon": expo.get("web", {}).get("favicon"),
        }
        # splash is a plugin config, add it too if present
        splash_plugin = None
        for plug in expo.get("plugins", []):
            if isinstance(plug, list) and plug and plug[0] == "expo-splash-screen":
                splash_plugin = (plug[1] or {}).get("image")
                break
        if splash_plugin:
            icon_paths["splash"] = splash_plugin

        base = Path("/app/frontend")
        for label, rel in icon_paths.items():
            assert rel, f"app.json missing path for {label}"
            f = (base / rel).resolve()
            assert f.is_file(), f"{label} -> {f} does not exist"
            with open(f, "rb") as fh:
                sig = fh.read(8)
            assert sig == PNG_SIG, f"{label} -> {f} is not a real PNG (sig={sig.hex()})"


# ============================================================
# B. /health endpoints — deployment blocker fix
# ============================================================

LOCAL_BACKEND = "http://localhost:8001"


class TestHealth:
    def test_root_health_get_localhost(self):
        r = requests.get(f"{LOCAL_BACKEND}/health", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok"}

    def test_root_health_head_localhost(self):
        r = requests.head(f"{LOCAL_BACKEND}/health", timeout=10)
        assert r.status_code == 200, r.status_code

    def test_api_health_get_localhost(self):
        r = requests.get(f"{LOCAL_BACKEND}/api/health", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok"}

    def test_api_health_no_auth_required_public_url(self):
        # Via ingress (what the deploy probe actually hits externally)
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok"}


# ============================================================
# C. DELETE /api/auth/me — scratch user cascade + seed integrity
# ============================================================

def _seed_scratch_user():
    uid = f"user_TEST_DEL_{uuid.uuid4().hex[:8]}"
    email = f"test_del_{uuid.uuid4().hex[:6]}@example.com"
    token = f"tok_TEST_DEL_{uuid.uuid4().hex}"
    _db.users.insert_one({
        "user_id": uid,
        "email": email,
        "name": "Scratch Del",
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


@pytest.fixture(scope="module")
def seed_baseline():
    """Snapshot the seed trip and confirm seed token authenticates before we start."""
    r = requests.get(f"{API}/auth/me", headers=_hdr(SEED_TOKEN), timeout=15)
    assert r.status_code == 200, f"Seed token broken before test: {r.text}"
    assert r.json()["user"]["user_id"] == SEED_UID

    trip = _db.trips.find_one({"id": SEED_TRIP_ID}, {"_id": 0})
    assert trip, f"Seed trip {SEED_TRIP_ID} missing"
    flights_before = list(_db.flights.find({"trip_id": SEED_TRIP_ID}, {"_id": 0}))
    return {"trip": trip, "flights": flights_before}


class TestDeleteAccount:
    def test_delete_me_cascade(self, seed_baseline):
        uid, _email, tok = _seed_scratch_user()
        try:
            # 1) create a trip
            r = requests.post(
                f"{API}/trips",
                headers=_hdr(tok),
                json={"name": f"TEST_DEL_{uuid.uuid4().hex[:6]}"},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            scratch_trip = r.json()
            scratch_trip_id = scratch_trip["id"]

            # 2) add a flight
            rf = requests.post(
                f"{API}/trips/{scratch_trip_id}/flights",
                headers=_hdr(tok),
                json={"trip_id": scratch_trip_id, "flight_number": "TEST123", "airline": "TestAir"},
                timeout=15,
            )
            assert rf.status_code == 200, rf.text
            flight_id = rf.json()["id"]

            # 3) become a collaborator on the seeded trip via invite (collab mode)
            ri = requests.post(
                f"{API}/trips/{SEED_TRIP_ID}/invites",
                headers=_hdr(SEED_TOKEN),
                json={"mode": "collab"},
                timeout=15,
            )
            assert ri.status_code == 200, ri.text
            invite_token = ri.json()["token"]

            ra = requests.post(
                f"{API}/invites/{invite_token}/accept",
                headers=_hdr(tok),
                timeout=15,
            )
            assert ra.status_code == 200, ra.text
            assert ra.json()["trip_id"] == SEED_TRIP_ID
            seed_trip_after_accept = _db.trips.find_one({"id": SEED_TRIP_ID}, {"_id": 0})
            assert uid in (seed_trip_after_accept.get("collaborators") or []), \
                f"Scratch user not added as collaborator: {seed_trip_after_accept.get('collaborators')}"

            # 4) DELETE /api/auth/me as the scratch user
            rd = requests.delete(f"{API}/auth/me", headers=_hdr(tok), timeout=20)
            assert rd.status_code == 200, rd.text
            assert rd.json().get("ok") is True

            # 5) Assertions
            # a) scratch user's trip gone
            assert _db.trips.find_one({"id": scratch_trip_id}) is None, "Scratch trip not deleted"
            # b) scratch user's flight gone
            assert _db.flights.find_one({"id": flight_id}) is None, "Scratch flight not deleted"
            # c) session revoked
            assert _db.user_sessions.find_one({"session_token": tok}) is None
            r_me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
            assert r_me.status_code == 401, f"Expected 401 with deleted session, got {r_me.status_code}"
            # d) scratch user removed from seeded trip's collaborators
            seed_trip_after = _db.trips.find_one({"id": SEED_TRIP_ID}, {"_id": 0})
            assert uid not in (seed_trip_after.get("collaborators") or []), \
                "Scratch user still listed as collaborator on seed trip"
            # e) seeded trip still exists and untouched (name, destination, cover_photo, user_id)
            base = seed_baseline["trip"]
            for k in ("id", "name", "destination", "user_id", "cover_photo", "start_date", "end_date", "share_id"):
                assert seed_trip_after.get(k) == base.get(k), \
                    f"Seed trip field {k} changed: before={base.get(k)!r} after={seed_trip_after.get(k)!r}"
            # f) flights on the seed trip unchanged (count + ids)
            flights_after = list(_db.flights.find({"trip_id": SEED_TRIP_ID}, {"_id": 0}))
            ids_before = sorted(f["id"] for f in seed_baseline["flights"])
            ids_after = sorted(f["id"] for f in flights_after)
            assert ids_before == ids_after, "Seed trip flights changed"
            # g) seed token still authenticates
            r_seed = requests.get(f"{API}/auth/me", headers=_hdr(SEED_TOKEN), timeout=15)
            assert r_seed.status_code == 200
            assert r_seed.json()["user"]["user_id"] == SEED_UID

            # h) users row gone
            assert _db.users.find_one({"user_id": uid}) is None, "Scratch user row not deleted"
        finally:
            # Safety net in case an assertion failed mid-flow
            _db.users.delete_one({"user_id": uid})
            _db.user_sessions.delete_many({"user_id": uid})
            _db.trips.delete_many({"user_id": uid})
            _db.flights.delete_many({"trip_id": {"$regex": "^TEST_"}})
            _db.trips.update_many({"collaborators": uid}, {"$pull": {"collaborators": uid}})

    def test_delete_me_requires_auth(self):
        r = requests.delete(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401, r.text


# ============================================================
# D. Lightweight non-destructive regression from Round 5
# ============================================================

class TestRegressionLite:
    """Uses the seed token but only mutates a scratch trip we then delete.
    NEVER touches the seed trip's flights, ticket, or fields."""

    @pytest.fixture(scope="class")
    def scratch_trip(self):
        r = requests.post(
            f"{API}/trips",
            headers=_hdr(SEED_TOKEN),
            json={"name": f"TEST_R6_{uuid.uuid4().hex[:6]}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        trip = r.json()
        yield trip
        requests.delete(f"{API}/trips/{trip['id']}", headers=_hdr(SEED_TOKEN), timeout=15)

    def test_partial_patch_flight_preserves_other_fields(self, scratch_trip):
        tid = scratch_trip["id"]
        # create with several fields
        payload = {
            "trip_id": tid,
            "flight_number": "QF25",
            "airline": "Qantas",
            "departure_location": "SYD",
            "arrival_location": "SIN",
            "cost": 850.50,
            "cost_currency": "AUD",
            "notes": "original",
        }
        rc = requests.post(f"{API}/trips/{tid}/flights", headers=_hdr(SEED_TOKEN), json=payload, timeout=15)
        assert rc.status_code == 200, rc.text
        fid = rc.json()["id"]

        rp = requests.patch(
            f"{API}/flights/{fid}",
            headers=_hdr(SEED_TOKEN),
            json={"notes": "only-notes-changed"},
            timeout=15,
        )
        assert rp.status_code == 200, rp.text

        rg = requests.get(f"{API}/trips/{tid}/flights", headers=_hdr(SEED_TOKEN), timeout=15)
        assert rg.status_code == 200
        got = [f for f in rg.json() if f["id"] == fid][0]
        assert got["notes"] == "only-notes-changed"
        for k in ("flight_number", "airline", "departure_location", "arrival_location", "cost_currency"):
            assert got[k] == payload[k], f"{k} changed! {got[k]!r} vs {payload[k]!r}"
        assert abs(got["cost"] - payload["cost"]) < 1e-6

    def test_documents_create_list_strips_blob(self, scratch_trip):
        tid = scratch_trip["id"]
        tiny_png = base64.b64encode(PNG_SIG + b"\x00" * 128).decode("ascii")
        rc = requests.post(
            f"{API}/trips/{tid}/documents",
            headers=_hdr(SEED_TOKEN),
            json={
                "trip_id": tid,
                "name": "TEST_doc.png",
                "mime": "image/png",
                "file_base64": tiny_png,
                "notes": "hi",
            },
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        doc = rc.json()
        assert doc.get("size", 0) > 0
        # list strips blob
        rl = requests.get(f"{API}/trips/{tid}/documents", headers=_hdr(SEED_TOKEN), timeout=15)
        assert rl.status_code == 200
        listed = [d for d in rl.json() if d["id"] == doc["id"]][0]
        assert listed.get("file_base64", "") == "", "list_documents must strip file_base64"
        assert listed.get("size", 0) > 0
        # single GET returns blob
        rg = requests.get(f"{API}/documents/{doc['id']}", headers=_hdr(SEED_TOKEN), timeout=15)
        assert rg.status_code == 200
        assert rg.json()["file_base64"] == tiny_png

    def test_invite_lifecycle_collab(self, scratch_trip):
        tid = scratch_trip["id"]
        # create invite
        ri = requests.post(
            f"{API}/trips/{tid}/invites",
            headers=_hdr(SEED_TOKEN),
            json={"mode": "collab"},
            timeout=15,
        )
        assert ri.status_code == 200, ri.text
        token = ri.json()["token"]
        # public preview no auth
        rp = requests.get(f"{API}/invites/{token}", timeout=15)
        assert rp.status_code == 200
        preview = rp.json()
        assert preview.get("expired") is False
        assert preview.get("trip_name")
