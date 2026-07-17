"""Backend regression smoke test for the Channels Preview feature.

Frontend-only change in this session — verifies the three backend routes the
new preview page depends on are still healthy: GET /api/, POST /api/auth/login,
GET /api/channels.
"""
import os
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")

ADMIN_EMAIL = "admin@broadcaster.com"
ADMIN_PASSWORD = "Admin@1234"


def test_root_health():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, dict)


def test_admin_login_ok():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["token"]
    assert data.get("user", {}).get("email") == ADMIN_EMAIL


def test_list_channels_authenticated():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200
    token = r.json()["token"]
    r2 = requests.get(
        f"{BASE_URL}/api/channels",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert "channels" in body and isinstance(body["channels"], list)
