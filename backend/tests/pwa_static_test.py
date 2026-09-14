"""PWA static-asset checks (round 7).

Frontend serves /manifest.json, /sw.js, and PWA icons from
/app/frontend/public via Metro. These are pure static assets so we can
verify them with a plain HTTP client — no browser needed.
"""

import json

import pytest
import requests

BASE = "http://localhost:3000"

PNG_MAGIC = b"\x89PNG"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Cache-Control": "no-cache"})
    return ses


class TestManifest:
    def test_manifest_served(self, s):
        r = s.get(f"{BASE}/manifest.json", timeout=10)
        assert r.status_code == 200
        assert "json" in r.headers.get("content-type", "").lower()

    def test_manifest_body(self, s):
        r = s.get(f"{BASE}/manifest.json", timeout=10)
        m = json.loads(r.text)
        assert m["name"] == "Travel Space"
        assert m["short_name"] == "Travel Space"
        assert m["start_url"] == "/"
        assert m["display"] == "standalone"
        assert m["theme_color"] == "#6B8E7A"
        assert m["background_color"] == "#F7F5F0"
        icons = m.get("icons", [])
        sizes = {(i["sizes"], i.get("purpose", "any")) for i in icons}
        assert ("192x192", "any") in sizes
        assert ("512x512", "any") in sizes
        assert ("512x512", "maskable") in sizes
        # Shortcut for /trip/new
        assert any(
            sc.get("url") == "/trip/new" and sc.get("name") == "New trip"
            for sc in m.get("shortcuts", [])
        )


class TestServiceWorker:
    def test_sw_served(self, s):
        r = s.get(f"{BASE}/sw.js", timeout=10)
        assert r.status_code == 200
        assert "javascript" in r.headers.get("content-type", "").lower()

    def test_sw_never_intercepts_api(self, s):
        # Static-level sanity: source should include the isApiRequest guard.
        body = s.get(f"{BASE}/sw.js", timeout=10).text
        assert "isApiRequest" in body
        assert "/api/" in body


@pytest.mark.parametrize(
    "name",
    [
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
        "apple-touch-icon.png",
        "favicon.png",
    ],
)
class TestIcons:
    def test_icon_served_as_png(self, s, name):
        r = s.get(f"{BASE}/{name}", timeout=10)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content[:4] == PNG_MAGIC


class TestApiPassthroughFromMetro:
    """Because Metro dev-server proxies /api to the backend on the same
    origin, the browser calling fetch('/api/health') routes through Metro,
    and the SW must not swallow it. This just proves the health endpoint
    is reachable at the same origin the SW is scoped to."""

    def test_api_health_same_origin(self, s):
        # Metro at :3000 does not proxy /api — but under the public ingress
        # everything is same-origin. So test via the ingress URL.
        import os

        base = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        if not base:
            pytest.skip("EXPO_PUBLIC_BACKEND_URL not set")
        r = s.get(f"{base.rstrip('/')}/api/health", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}
