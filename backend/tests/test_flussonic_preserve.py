"""Regression tests for the disable/expiry preserves Flussonic stream fix.

Bug fixed:
- Previous: user/admin disable + auto expiry called `flussonic.delete_stream()`,
  wiping the stream config on Flussonic entirely.
- New: they now call `flussonic.disable_stream()` which does
  PUT /streamer/api/v3/streams/{name} with {"inputs":[{"url":"publish://"}],
  "disabled":true}. Stream config is preserved (name, position, playback URLs)
  but publishing/playback is stopped. Renewal/enable does the same PUT with
  disabled:false. Only DELETE endpoints still call delete_stream().

Requires the real Flussonic server (mumbai-edge.smartplaytv.in) to be reachable
from this testbed and the backend to be configured with correct FLUSSONIC_* env.

All test-created channels are cleaned up (DELETE) so the real Flussonic server
does not accumulate orphan streams.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Backend URL from frontend .env (public URL, same one used by other test file)
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")
assert BASE_URL, "Public backend URL must be defined in frontend/.env"
API = f"{BASE_URL}/api"

# Load backend .env for MONGO_URL/DB_NAME/FLUSSONIC creds
load_dotenv(Path("/app/backend/.env"))
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
FLUSSONIC_URL = os.environ["FLUSSONIC_URL"].rstrip("/")
FLUSSONIC_USER = os.environ["FLUSSONIC_USER"]
FLUSSONIC_PASS = os.environ["FLUSSONIC_PASS"]

ADMIN_EMAIL = "admin@broadcaster.com"
ADMIN_PASSWORD = "Admin@1234"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def api_client() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client: requests.Session) -> str:
    r = api_client.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="module")
def mongo_channels():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    coll = client[DB_NAME]["channels"]
    yield coll
    client.close()


# ---------- Helpers ----------
def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _flussonic_get(stream_name: str) -> requests.Response:
    """Direct GET to real Flussonic server."""
    return requests.get(
        f"{FLUSSONIC_URL}/streamer/api/v3/streams/{stream_name}",
        auth=(FLUSSONIC_USER, FLUSSONIC_PASS),
        timeout=15,
        verify=False,
    )


def _create_channel(api_client, token: str, name_suffix: str) -> dict:
    r = api_client.post(
        f"{API}/channels",
        headers=_auth(token),
        json={
            "name": f"TEST Preserve {name_suffix}",
            "category": "News",
            "language": "English",
        },
    )
    assert r.status_code == 200, f"channel create failed: {r.status_code} {r.text}"
    j = r.json()
    ch = j["channel"]
    assert ch.get("flussonic_provisioned") is True, (
        f"flussonic_provisioned must be True (real Flussonic server must be reachable). "
        f"Got: flussonic_provisioned={ch.get('flussonic_provisioned')}, "
        f"error={ch.get('flussonic_error')}"
    )
    assert ch["stream_name"].startswith("ch_")
    return ch


def _delete_channel(api_client, token: str, cid: str) -> None:
    """Idempotent cleanup — swallow errors so failed asserts still teardown."""
    try:
        api_client.delete(f"{API}/channels/{cid}", headers=_auth(token), timeout=15)
    except Exception:
        pass


def _wait_for_state(
    stream_name: str, want_disabled: bool, attempts: int = 6, delay: float = 1.5
) -> dict:
    """Poll Flussonic until `disabled` matches wanted state (Flussonic may take a
    moment to reflect PUT). Returns last JSON body. Fails after `attempts`."""
    last_json: dict = {}
    for _ in range(attempts):
        r = _flussonic_get(stream_name)
        assert r.status_code == 200, (
            f"Flussonic GET must return 200 (stream config preserved), got "
            f"{r.status_code}: {r.text[:200]}"
        )
        last_json = r.json()
        if bool(last_json.get("disabled", False)) == want_disabled:
            return last_json
        time.sleep(delay)
    return last_json


# ---------- TEST 1: user-initiated disable preserves stream ----------
def test_1_user_disable_preserves_flussonic_stream(
    api_client, admin_token, mongo_channels
):
    ch = _create_channel(api_client, admin_token, uuid.uuid4().hex[:6])
    cid, stream_name = ch["id"], ch["stream_name"]
    try:
        # Sanity: stream exists and NOT disabled after create
        r = _flussonic_get(stream_name)
        assert r.status_code == 200, r.text
        body = r.json()
        assert bool(body.get("disabled", False)) is False, (
            f"expected disabled=false right after create, got {body.get('disabled')}"
        )

        # Disable via user endpoint
        r = api_client.post(
            f"{API}/channels/{cid}/disable", headers=_auth(admin_token)
        )
        assert r.status_code == 200, r.text

        # DB status flipped
        doc = mongo_channels.find_one({"id": cid})
        assert doc is not None and doc["status"] == "disabled"

        # KEY ASSERTION: Flussonic still 200 (config preserved) with disabled=true
        body = _wait_for_state(stream_name, want_disabled=True)
        assert body.get("disabled") is True, (
            f"stream must remain but be marked disabled=true, got: {body}"
        )

        # Enable
        r = api_client.post(
            f"{API}/channels/{cid}/enable", headers=_auth(admin_token)
        )
        assert r.status_code == 200, r.text

        body = _wait_for_state(stream_name, want_disabled=False)
        assert bool(body.get("disabled", False)) is False
    finally:
        _delete_channel(api_client, admin_token, cid)


# ---------- TEST 2: expiry preserves stream (background job path) ----------
def test_2_expiry_preserves_flussonic_stream(
    api_client, admin_token, mongo_channels
):
    ch = _create_channel(api_client, admin_token, uuid.uuid4().hex[:6])
    cid, stream_name = ch["id"], ch["stream_name"]
    try:
        # Force expiry: set expires_at to yesterday directly in Mongo
        past = datetime.now(timezone.utc) - timedelta(days=1)
        res = mongo_channels.update_one({"id": cid}, {"$set": {"expires_at": past}})
        assert res.modified_count == 1, "failed to set expires_at in Mongo"

        # Trigger expire job
        r = api_client.post(
            f"{API}/admin/expire-now", headers=_auth(admin_token)
        )
        assert r.status_code == 200, r.text

        # Channel status -> expired
        r = api_client.get(
            f"{API}/channels/{cid}", headers=_auth(admin_token)
        )
        assert r.status_code == 200, r.text
        assert r.json()["channel"]["status"] == "expired"

        # KEY ASSERTION: Flussonic still 200, disabled=true (not deleted)
        body = _wait_for_state(stream_name, want_disabled=True)
        assert body.get("disabled") is True, (
            f"expired channel stream must be preserved on Flussonic with "
            f"disabled=true, got body={body}"
        )

        # Renew -> active + disabled=false on Flussonic
        r = api_client.post(
            f"{API}/channels/{cid}/renew", headers=_auth(admin_token)
        )
        assert r.status_code == 200, r.text
        assert r.json()["channel"]["status"] == "active"

        body = _wait_for_state(stream_name, want_disabled=False)
        assert bool(body.get("disabled", False)) is False
    finally:
        _delete_channel(api_client, admin_token, cid)


# ---------- TEST 3: admin-initiated disable preserves stream ----------
def test_3_admin_disable_preserves_flussonic_stream(
    api_client, admin_token
):
    ch = _create_channel(api_client, admin_token, uuid.uuid4().hex[:6])
    cid, stream_name = ch["id"], ch["stream_name"]
    try:
        r = api_client.post(
            f"{API}/admin/channels/{cid}/disable",
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text

        body = _wait_for_state(stream_name, want_disabled=True)
        assert body.get("disabled") is True, (
            f"admin disable must preserve stream with disabled=true, got: {body}"
        )
    finally:
        _delete_channel(api_client, admin_token, cid)


# ---------- TEST 4: DELETE still fully removes stream ----------
def test_4_delete_removes_flussonic_stream(api_client, admin_token):
    ch = _create_channel(api_client, admin_token, uuid.uuid4().hex[:6])
    cid, stream_name = ch["id"], ch["stream_name"]

    # Confirm exists before delete
    r = _flussonic_get(stream_name)
    assert r.status_code == 200, r.text

    # DELETE via user endpoint
    r = api_client.delete(f"{API}/channels/{cid}", headers=_auth(admin_token))
    assert r.status_code == 200, r.text

    # Poll for 404
    got_404 = False
    for _ in range(6):
        r = _flussonic_get(stream_name)
        if r.status_code == 404:
            got_404 = True
            break
        time.sleep(1.5)
    assert got_404, (
        f"DELETE must remove stream from Flussonic (expected 404), got last "
        f"status {r.status_code}: {r.text[:200]}"
    )
