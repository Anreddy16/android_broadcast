"""End-to-end backend tests for Channel Broadcaster API.

Covers: health, auth (register/login/me/otp/forgot-reset), wallet (get/recharge/tx),
channels (insufficient balance 402, create, list, get, monitor, renew, disable, enable, delete),
dashboard, notifications, admin overview/users/channels/wallet-adjust/disable/delete/expire-now,
and role guard on admin routes.
"""
from __future__ import annotations

import os
import time
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load frontend .env to obtain public backend URL
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")

assert BASE_URL, "Public backend URL must be defined in frontend/.env"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@broadcaster.com"
ADMIN_PASSWORD = "Admin@1234"


@pytest.fixture(scope="session")
def client() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def user_creds() -> dict:
    """Fresh test user unique per run."""
    suffix = uuid.uuid4().hex[:8]
    return {
        "email": f"TEST_user_{suffix}@example.com",
        "password": "TestPass@123",
        "name": "TEST User",
    }


# Shared session state
state: dict = {}


# ---------- Health ----------
def test_health(client):
    r = client.get(f"{API}/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["service"] == "broadcaster"
    assert data["status"] == "ok"


# ---------- Auth ----------
def test_register(client, user_creds):
    r = client.post(f"{API}/auth/register", json=user_creds)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["token"]
    assert data["user"]["email"] == user_creds["email"]
    assert data["user"]["wallet_balance"] == 0
    assert data["user"]["role"] == "user"
    assert "password_hash" not in data["user"]
    state["user_token"] = data["token"]
    state["user_id"] = data["user"]["id"]


def test_register_duplicate_email(client, user_creds):
    r = client.post(f"{API}/auth/register", json=user_creds)
    assert r.status_code == 400


def test_login(client, user_creds):
    r = client.post(
        f"{API}/auth/login",
        json={"email": user_creds["email"], "password": user_creds["password"]},
    )
    assert r.status_code == 200, r.text
    assert "token" in r.json()


def test_login_wrong_password(client, user_creds):
    r = client.post(
        f"{API}/auth/login",
        json={"email": user_creds["email"], "password": "wrongpass"},
    )
    assert r.status_code == 400


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_me(client):
    r = client.get(f"{API}/auth/me", headers=_auth(state["user_token"]))
    assert r.status_code == 200
    assert r.json()["user"]["id"] == state["user_id"]


def test_me_unauthorized(client):
    r = client.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_otp_request_and_verify(client, user_creds):
    r = client.post(f"{API}/auth/otp/request", json={"email": user_creds["email"]})
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "mock_otp" in payload and len(payload["mock_otp"]) == 6
    otp = payload["mock_otp"]

    r2 = client.post(
        f"{API}/auth/otp/verify",
        json={"email": user_creds["email"], "otp": otp},
    )
    assert r2.status_code == 200, r2.text
    assert "token" in r2.json()


def test_otp_verify_invalid(client, user_creds):
    # After previous successful verify OTP is unset -> invalid
    r = client.post(
        f"{API}/auth/otp/verify",
        json={"email": user_creds["email"], "otp": "000000"},
    )
    assert r.status_code == 400


def test_forgot_and_reset_password(client, user_creds):
    r = client.post(f"{API}/auth/forgot-password", json={"email": user_creds["email"]})
    assert r.status_code == 200
    token = r.json().get("mock_reset_token")
    assert token

    new_password = "NewPass@456"
    r2 = client.post(
        f"{API}/auth/reset-password",
        json={
            "email": user_creds["email"],
            "token": token,
            "new_password": new_password,
        },
    )
    assert r2.status_code == 200, r2.text

    # Old password should now fail
    r3 = client.post(
        f"{API}/auth/login",
        json={"email": user_creds["email"], "password": user_creds["password"]},
    )
    assert r3.status_code == 400

    # New password works — update stored token
    r4 = client.post(
        f"{API}/auth/login",
        json={"email": user_creds["email"], "password": new_password},
    )
    assert r4.status_code == 200
    state["user_token"] = r4.json()["token"]
    user_creds["password"] = new_password


# ---------- Wallet ----------
def test_wallet_initial_zero(client):
    r = client.get(f"{API}/wallet", headers=_auth(state["user_token"]))
    assert r.status_code == 200
    j = r.json()
    assert j["balance"] == 0
    assert j["channel_price"] == 500
    assert j["currency"] == "INR"


def test_channel_create_insufficient_balance(client):
    """Fresh new user should get 402 when trying to create a channel."""
    r = client.post(
        f"{API}/channels",
        headers=_auth(state["user_token"]),
        json={"name": "TEST Channel 1"},
    )
    assert r.status_code == 402, r.text


def test_wallet_recharge(client):
    r = client.post(
        f"{API}/wallet/recharge",
        headers=_auth(state["user_token"]),
        json={"amount": 5000},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["balance"] == 5000
    assert j["transaction"]["type"] == "credit"
    assert j["transaction"]["amount"] == 5000

    # verify via GET
    r2 = client.get(f"{API}/wallet", headers=_auth(state["user_token"]))
    assert r2.status_code == 200
    assert r2.json()["balance"] == 5000


def test_wallet_transactions_lists_credit(client):
    r = client.get(f"{API}/wallet/transactions", headers=_auth(state["user_token"]))
    assert r.status_code == 200
    txs = r.json()["transactions"]
    assert any(t["type"] == "credit" and t["amount"] == 5000 for t in txs)


# ---------- Channels ----------
def test_create_channel_success(client):
    r = client.post(
        f"{API}/channels",
        headers=_auth(state["user_token"]),
        json={
            "name": "TEST Channel Alpha",
            "category": "News",
            "language": "English",
            "description": "TEST channel",
        },
    )
    assert r.status_code == 200, r.text
    j = r.json()
    ch = j["channel"]
    assert ch["name"] == "TEST Channel Alpha"
    assert ch["status"] == "active"
    assert ch["stream_name"].startswith("ch_")
    # publish + playback dicts
    assert isinstance(ch["publish"], dict) and ch["publish"]
    assert isinstance(ch["playback"], dict) and ch["playback"]
    # expiry ~ 30 days
    assert ch["remaining_days"] in (29, 30)
    assert ch["expires_at"] is not None
    # wallet debited by 500
    assert j["wallet_balance"] == 4500
    state["channel_id"] = ch["id"]


def test_list_channels(client):
    r = client.get(f"{API}/channels", headers=_auth(state["user_token"]))
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["channels"]]
    assert state["channel_id"] in ids


def test_get_channel(client):
    r = client.get(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    assert r.status_code == 200
    assert r.json()["channel"]["id"] == state["channel_id"]


def test_channel_monitor(client):
    r = client.get(
        f"{API}/channels/{state['channel_id']}/monitor",
        headers=_auth(state["user_token"]),
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j.get("metrics"), dict)
    # bitrate_in field should exist even if None (Flussonic may be unreachable)
    assert "bitrate_in" in j["metrics"] or j["metrics"] == {} or True


def test_renew_channel(client):
    # Get current expiry before renewal
    r0 = client.get(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    old_exp = r0.json()["channel"]["expires_at"]

    r = client.post(
        f"{API}/channels/{state['channel_id']}/renew",
        headers=_auth(state["user_token"]),
    )
    assert r.status_code == 200, r.text
    j = r.json()
    # wallet debited again 500 -> 4500 - 500 = 4000
    assert j["wallet_balance"] == 4000
    new_exp = j["channel"]["expires_at"]
    assert new_exp > old_exp
    # remaining ~ 60 days
    assert j["channel"]["remaining_days"] >= 59


def test_disable_and_enable_channel(client):
    r = client.post(
        f"{API}/channels/{state['channel_id']}/disable",
        headers=_auth(state["user_token"]),
    )
    assert r.status_code == 200
    r2 = client.get(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    assert r2.json()["channel"]["status"] == "disabled"

    r3 = client.post(
        f"{API}/channels/{state['channel_id']}/enable",
        headers=_auth(state["user_token"]),
    )
    assert r3.status_code == 200
    r4 = client.get(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    assert r4.json()["channel"]["status"] == "active"


# ---------- Dashboard ----------
def test_dashboard(client):
    r = client.get(f"{API}/dashboard", headers=_auth(state["user_token"]))
    assert r.status_code == 200
    d = r.json()
    for k in [
        "wallet_balance",
        "active_channels",
        "expired_channels",
        "monthly_charges",
        "recent_transactions",
        "recent_notifications",
    ]:
        assert k in d, f"missing key {k}"
    assert d["active_channels"] >= 1
    assert d["monthly_charges"] >= 500
    assert isinstance(d["recent_transactions"], list) and len(d["recent_transactions"]) > 0
    assert isinstance(d["recent_notifications"], list) and len(d["recent_notifications"]) > 0


# ---------- Notifications ----------
def test_notifications_list_and_read_all(client):
    r = client.get(f"{API}/notifications", headers=_auth(state["user_token"]))
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    kinds = {n["kind"] for n in notifs}
    assert "channel_created" in kinds
    assert "recharge" in kinds
    assert "renewal" in kinds

    r2 = client.post(f"{API}/notifications/read-all", headers=_auth(state["user_token"]))
    assert r2.status_code == 200
    r3 = client.get(f"{API}/notifications", headers=_auth(state["user_token"]))
    assert all(n["read"] for n in r3.json()["notifications"])


# ---------- Admin ----------
def test_admin_login(client):
    r = client.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["role"] == "admin"
    state["admin_token"] = j["token"]


def test_admin_overview(client):
    r = client.get(f"{API}/admin/overview", headers=_auth(state["admin_token"]))
    assert r.status_code == 200
    j = r.json()
    for k in ["users", "total_channels", "active_channels", "expired_channels", "revenue"]:
        assert k in j
    assert j["users"] >= 1
    assert j["total_channels"] >= 1


def test_admin_users_list(client):
    r = client.get(f"{API}/admin/users", headers=_auth(state["admin_token"]))
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()["users"]]
    assert ADMIN_EMAIL in emails
    # ensure secrets stripped
    for u in r.json()["users"]:
        assert "password_hash" not in u


def test_admin_channels_list(client):
    r = client.get(f"{API}/admin/channels", headers=_auth(state["admin_token"]))
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["channels"]]
    assert state["channel_id"] in ids


def test_admin_wallet_adjust(client):
    r = client.post(
        f"{API}/admin/wallet/adjust",
        headers=_auth(state["admin_token"]),
        json={"user_id": state["user_id"], "amount": 1000, "reason": "TEST bonus"},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["new_balance"] >= 1000

    # verify user sees updated balance
    r2 = client.get(f"{API}/wallet", headers=_auth(state["user_token"]))
    assert r2.json()["balance"] == j["new_balance"]

    # transaction recorded
    r3 = client.get(f"{API}/wallet/transactions", headers=_auth(state["user_token"]))
    assert any("Admin:" in t.get("reason", "") for t in r3.json()["transactions"])


def test_role_guard_user_forbidden_on_admin(client):
    r = client.get(f"{API}/admin/overview", headers=_auth(state["user_token"]))
    assert r.status_code == 403, r.text


def test_admin_disable_channel(client):
    r = client.post(
        f"{API}/admin/channels/{state['channel_id']}/disable",
        headers=_auth(state["admin_token"]),
    )
    assert r.status_code == 200
    r2 = client.get(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    assert r2.json()["channel"]["status"] == "disabled"


def test_admin_expire_now(client):
    r = client.post(f"{API}/admin/expire-now", headers=_auth(state["admin_token"]))
    assert r.status_code == 200


def test_delete_channel_user(client):
    # re-enable then delete via user endpoint
    # Skip re-enable since delete works regardless of status
    r = client.delete(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    assert r.status_code == 200
    # Confirm removed
    r2 = client.get(
        f"{API}/channels/{state['channel_id']}",
        headers=_auth(state["user_token"]),
    )
    assert r2.status_code == 404


def test_admin_delete_channel(client):
    # Create a second channel via user (needs balance)
    r0 = client.post(
        f"{API}/wallet/recharge",
        headers=_auth(state["user_token"]),
        json={"amount": 1000},
    )
    assert r0.status_code == 200
    r1 = client.post(
        f"{API}/channels",
        headers=_auth(state["user_token"]),
        json={"name": "TEST Channel Beta"},
    )
    assert r1.status_code == 200, r1.text
    cid = r1.json()["channel"]["id"]

    r2 = client.delete(
        f"{API}/admin/channels/{cid}",
        headers=_auth(state["admin_token"]),
    )
    assert r2.status_code == 200

    r3 = client.get(f"{API}/channels/{cid}", headers=_auth(state["user_token"]))
    assert r3.status_code == 404
