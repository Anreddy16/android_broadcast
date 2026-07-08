"""Main FastAPI server for Channel Broadcaster.
All routes under /api prefix. MongoDB via Motor. JWT auth. Flussonic integration.
"""
from __future__ import annotations

import logging
import os
import random
import secrets
import string
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from services.flussonic import flussonic

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config ---
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ.get("JWT_ALG", "HS256")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", 43200))
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@broadcaster.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
CHANNEL_PRICE = int(os.environ.get("CHANNEL_PRICE", 500))
CHANNEL_VALIDITY_DAYS = int(os.environ.get("CHANNEL_VALIDITY_DAYS", 30))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("broadcaster")

security = HTTPBearer(auto_error=False)


# --- Helpers ---
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": now_utc() + timedelta(minutes=JWT_EXPIRE_MINUTES),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def gen_stream_name() -> str:
    # Flussonic-friendly: lowercase alnum, prefix "ch"
    return "ch_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=10))


def clean_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    doc.pop("otp_hash", None)
    doc.pop("reset_token", None)
    return doc


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, Any]:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# --- Models ---
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OtpRequestIn(BaseModel):
    email: EmailStr


class OtpVerifyIn(BaseModel):
    email: EmailStr
    otp: str


class ForgotPwIn(BaseModel):
    email: EmailStr


class ResetPwIn(BaseModel):
    email: EmailStr
    token: str
    new_password: str = Field(min_length=6)


class RechargeIn(BaseModel):
    amount: int = Field(gt=0)


class CreateChannelIn(BaseModel):
    name: str = Field(min_length=1)
    category: str = "General"
    language: str = "English"
    description: str = ""
    logo_base64: Optional[str] = None


class AdminWalletAdjustIn(BaseModel):
    user_id: str
    amount: int  # can be negative
    reason: str = "Manual adjustment"


# --- App / Lifespan ---
async def seed_admin() -> None:
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if existing:
        # ensure role is admin
        if existing.get("role") != "admin":
            await db.users.update_one(
                {"email": ADMIN_EMAIL}, {"$set": {"role": "admin"}}
            )
        return
    user = {
        "id": str(uuid.uuid4()),
        "email": ADMIN_EMAIL,
        "name": "Admin",
        "role": "admin",
        "password_hash": hash_password(ADMIN_PASSWORD),
        "wallet_balance": 100000,
        "created_at": now_utc(),
    }
    await db.users.insert_one(user)
    logger.info("Seeded admin: %s", ADMIN_EMAIL)


async def expire_channels_task() -> None:
    """Mark channels whose expires_at < now as expired and disable Flussonic streams
    (config is preserved so renewal can re-enable instantly)."""
    cursor = db.channels.find(
        {"status": {"$in": ["active", "disabled"]}, "expires_at": {"$lt": now_utc()}}
    )
    async for ch in cursor:
        try:
            await flussonic.disable_stream(ch["stream_name"])
        except Exception as e:
            logger.warning("Failed to disable stream on expiry: %s", e)
        await db.channels.update_one(
            {"id": ch["id"]}, {"$set": {"status": "expired", "updated_at": now_utc()}}
        )
        await notify(
            ch["user_id"],
            "Subscription Expired",
            f"Channel '{ch['name']}' has expired. Renew to reactivate.",
            "expiry",
        )


async def notify(user_id: str, title: str, body: str, kind: str) -> None:
    await db.notifications.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "body": body,
            "kind": kind,
            "read": False,
            "created_at": now_utc(),
        }
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_admin()
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.channels.create_index("id", unique=True)
    await db.channels.create_index("stream_name", unique=True)
    await db.channels.create_index("user_id")
    await db.transactions.create_index("user_id")
    await db.notifications.create_index("user_id")

    # Start background expiry task (once per hour)
    import asyncio

    async def loop_expiry():
        while True:
            try:
                await expire_channels_task()
            except Exception as e:
                logger.error("expiry task error: %s", e)
            await asyncio.sleep(3600)

    task = asyncio.create_task(loop_expiry())
    yield
    task.cancel()
    client.close()


app = FastAPI(title="Channel Broadcaster API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


# --- Routes: Health ---
@api.get("/")
async def root():
    return {"service": "broadcaster", "status": "ok", "time": iso(now_utc())}


# --- Routes: Auth ---
@api.post("/auth/register")
async def register(payload: RegisterIn):
    if await db.users.find_one({"email": payload.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": payload.email,
        "name": payload.name,
        "role": "user",
        "password_hash": hash_password(payload.password),
        "wallet_balance": 0,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id, payload.email, "user")
    return {"token": token, "user": clean_doc(doc)}


@api.post("/auth/login")
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Invalid email or password")
    token = create_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": clean_doc(dict(user))}


@api.post("/auth/otp/request")
async def request_otp(payload: OtpRequestIn):
    user = await db.users.find_one({"email": payload.email})
    if not user:
        # do not reveal existence; still return a random otp code so UI works.
        return {"message": "OTP sent", "mock_otp": "".join(random.choices(string.digits, k=6))}
    otp_code = "".join(random.choices(string.digits, k=6))
    await db.users.update_one(
        {"email": payload.email},
        {"$set": {"otp_hash": hash_password(otp_code), "otp_expires": now_utc() + timedelta(minutes=10)}},
    )
    # MOCK: return OTP in payload for UI display
    return {"message": "OTP sent", "mock_otp": otp_code}


@api.post("/auth/otp/verify")
async def verify_otp(payload: OtpVerifyIn):
    user = await db.users.find_one({"email": payload.email})
    if not user or not user.get("otp_hash"):
        raise HTTPException(status_code=400, detail="Invalid OTP")
    exp = user.get("otp_expires")
    if exp and exp.replace(tzinfo=timezone.utc) < now_utc():
        raise HTTPException(status_code=400, detail="OTP expired")
    if not verify_password(payload.otp, user["otp_hash"]):
        raise HTTPException(status_code=400, detail="Invalid OTP")
    await db.users.update_one(
        {"email": payload.email},
        {"$unset": {"otp_hash": "", "otp_expires": ""}},
    )
    token = create_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": clean_doc(dict(user))}


@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPwIn):
    user = await db.users.find_one({"email": payload.email})
    reset_token = secrets.token_urlsafe(24)
    if user:
        await db.users.update_one(
            {"email": payload.email},
            {"$set": {"reset_token": reset_token, "reset_expires": now_utc() + timedelta(minutes=30)}},
        )
    # MOCK: return the token for testing
    return {"message": "If email exists, a reset link was sent", "mock_reset_token": reset_token}


@api.post("/auth/reset-password")
async def reset_password(payload: ResetPwIn):
    user = await db.users.find_one({"email": payload.email})
    if not user or user.get("reset_token") != payload.token:
        raise HTTPException(status_code=400, detail="Invalid token")
    exp = user.get("reset_expires")
    if exp and exp.replace(tzinfo=timezone.utc) < now_utc():
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"email": payload.email},
        {
            "$set": {"password_hash": hash_password(payload.new_password)},
            "$unset": {"reset_token": "", "reset_expires": ""},
        },
    )
    return {"message": "Password reset successful"}


@api.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": clean_doc(dict(user))}


# --- Routes: Wallet ---
@api.get("/wallet")
async def get_wallet(user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "balance": user.get("wallet_balance", 0),
        "channel_price": CHANNEL_PRICE,
        "currency": "INR",
    }


@api.post("/wallet/recharge")
async def recharge(payload: RechargeIn, user: Dict[str, Any] = Depends(get_current_user)):
    """MOCK recharge — simulates a successful Razorpay payment."""
    new_balance = user.get("wallet_balance", 0) + payload.amount
    await db.users.update_one({"id": user["id"]}, {"$set": {"wallet_balance": new_balance}})
    tx = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "amount": payload.amount,
        "type": "credit",
        "reason": "Wallet recharge (MOCKED Razorpay)",
        "balance_after": new_balance,
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(tx)
    await notify(user["id"], "Recharge Successful", f"₹{payload.amount} added to your wallet.", "recharge")
    tx.pop("_id", None)
    return {"balance": new_balance, "transaction": tx}


@api.get("/wallet/transactions")
async def transactions(user: Dict[str, Any] = Depends(get_current_user)):
    cursor = db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(200)
    items = await cursor.to_list(length=200)
    return {"transactions": items}


# --- Routes: Channels ---
async def _debit_wallet(user_id: str, amount: int, reason: str) -> int:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    balance = user.get("wallet_balance", 0)
    if balance < amount:
        raise HTTPException(status_code=402, detail="Insufficient wallet balance. Please recharge.")
    new_balance = balance - amount
    await db.users.update_one({"id": user_id}, {"$set": {"wallet_balance": new_balance}})
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": amount,
            "type": "debit",
            "reason": reason,
            "balance_after": new_balance,
            "created_at": now_utc(),
        }
    )
    return new_balance


def _serialize_channel(ch: Dict[str, Any]) -> Dict[str, Any]:
    ch = dict(ch)
    ch.pop("_id", None)
    ch["created_at"] = iso(ch.get("created_at"))
    ch["expires_at"] = iso(ch.get("expires_at"))
    ch["updated_at"] = iso(ch.get("updated_at"))
    # remaining days
    exp = ch.get("expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp)
            delta = exp_dt - now_utc()
            ch["remaining_days"] = max(0, delta.days)
        except Exception:
            ch["remaining_days"] = 0
    else:
        ch["remaining_days"] = 0
    return ch


@api.post("/channels")
async def create_channel(payload: CreateChannelIn, user: Dict[str, Any] = Depends(get_current_user)):
    # Debit wallet
    new_balance = await _debit_wallet(user["id"], CHANNEL_PRICE, f"Channel creation: {payload.name}")

    stream_name = gen_stream_name()
    fluss_result = await flussonic.create_stream(stream_name)
    publish = flussonic.build_publish_urls(stream_name)
    playback = flussonic.build_playback_outputs(stream_name)

    now = now_utc()
    channel = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": payload.name,
        "category": payload.category,
        "language": payload.language,
        "description": payload.description,
        "logo_base64": payload.logo_base64,
        "stream_name": stream_name,
        "status": "active",
        "flussonic_provisioned": fluss_result.get("success", False),
        "flussonic_error": fluss_result.get("error"),
        "publish": publish,
        "playback": playback,
        "created_at": now,
        "expires_at": now + timedelta(days=CHANNEL_VALIDITY_DAYS),
        "updated_at": now,
    }
    await db.channels.insert_one(channel)
    await notify(
        user["id"],
        "Channel Created",
        f"'{payload.name}' is live. RTMP publishing enabled for {CHANNEL_VALIDITY_DAYS} days.",
        "channel_created",
    )
    return {"channel": _serialize_channel(channel), "wallet_balance": new_balance}


@api.get("/channels")
async def list_channels(user: Dict[str, Any] = Depends(get_current_user)):
    cursor = db.channels.find({"user_id": user["id"]}).sort("created_at", -1)
    items = await cursor.to_list(length=500)
    return {"channels": [_serialize_channel(c) for c in items]}


@api.get("/channels/{channel_id}")
async def get_channel(channel_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id})
    if not ch or (ch["user_id"] != user["id"] and user.get("role") != "admin"):
        raise HTTPException(status_code=404, detail="Channel not found")
    return {"channel": _serialize_channel(ch)}


@api.post("/channels/{channel_id}/renew")
async def renew_channel(channel_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id, "user_id": user["id"]})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    new_balance = await _debit_wallet(user["id"], CHANNEL_PRICE, f"Channel renewal: {ch['name']}")

    # Re-enable stream (works whether it was disabled or expired)
    await flussonic.enable_stream(ch["stream_name"])

    now = now_utc()
    current_exp = ch.get("expires_at") or now
    if hasattr(current_exp, "tzinfo") and current_exp.tzinfo is None:
        current_exp = current_exp.replace(tzinfo=timezone.utc)
    # If expired, extend from now, else extend from current expiry
    base = max(current_exp, now)
    new_exp = base + timedelta(days=CHANNEL_VALIDITY_DAYS)

    await db.channels.update_one(
        {"id": channel_id},
        {"$set": {"status": "active", "expires_at": new_exp, "updated_at": now}},
    )
    updated = await db.channels.find_one({"id": channel_id})
    await notify(user["id"], "Renewal Successful", f"'{ch['name']}' renewed for {CHANNEL_VALIDITY_DAYS} days.", "renewal")
    return {"channel": _serialize_channel(updated), "wallet_balance": new_balance}


@api.post("/channels/{channel_id}/disable")
async def disable_channel(channel_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id, "user_id": user["id"]})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Preserve stream config on Flussonic; only stop publishing/playback
    await flussonic.disable_stream(ch["stream_name"])
    await db.channels.update_one(
        {"id": channel_id}, {"$set": {"status": "disabled", "updated_at": now_utc()}}
    )
    return {"ok": True}


@api.post("/channels/{channel_id}/enable")
async def enable_channel(channel_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id, "user_id": user["id"]})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    exp = ch.get("expires_at")
    if exp and exp.replace(tzinfo=timezone.utc) < now_utc():
        raise HTTPException(status_code=400, detail="Channel expired. Please renew.")
    await flussonic.enable_stream(ch["stream_name"])
    await db.channels.update_one(
        {"id": channel_id}, {"$set": {"status": "active", "updated_at": now_utc()}}
    )
    return {"ok": True}


@api.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id, "user_id": user["id"]})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    await flussonic.delete_stream(ch["stream_name"])
    await db.channels.delete_one({"id": channel_id})
    return {"ok": True}


@api.get("/channels/{channel_id}/monitor")
async def monitor_channel(channel_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id})
    if not ch or (ch["user_id"] != user["id"] and user.get("role") != "admin"):
        raise HTTPException(status_code=404, detail="Channel not found")
    raw = await flussonic.get_stream_health(ch["stream_name"])
    metrics = flussonic.parse_health(raw)
    return {"metrics": metrics, "raw": raw or {}}


# --- Routes: Dashboard ---
@api.get("/dashboard")
async def dashboard(user: Dict[str, Any] = Depends(get_current_user)):
    channels = await db.channels.find({"user_id": user["id"]}).to_list(length=500)
    active = [c for c in channels if c["status"] == "active"]
    expired = [c for c in channels if c["status"] == "expired"]
    disabled = [c for c in channels if c["status"] == "disabled"]

    # monthly charge = active channels * 500 (recurring)
    monthly = len(active) * CHANNEL_PRICE

    # Recent activity: last 10 transactions + notifications
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    notifs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)

    def _serialize_dt(item):
        item = dict(item)
        if "created_at" in item:
            item["created_at"] = iso(item["created_at"])
        return item

    return {
        "wallet_balance": user.get("wallet_balance", 0),
        "channel_price": CHANNEL_PRICE,
        "active_channels": len(active),
        "expired_channels": len(expired),
        "disabled_channels": len(disabled),
        "total_channels": len(channels),
        "monthly_charges": monthly,
        "recent_transactions": [_serialize_dt(t) for t in txs],
        "recent_notifications": [_serialize_dt(n) for n in notifs],
    }


# --- Routes: Notifications ---
@api.get("/notifications")
async def list_notifications(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for n in items:
        if isinstance(n.get("created_at"), datetime):
            n["created_at"] = iso(n["created_at"])
    return {"notifications": items}


@api.post("/notifications/read-all")
async def mark_all_read(user: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# --- Routes: Admin ---
@api.get("/admin/overview")
async def admin_overview(admin: Dict[str, Any] = Depends(require_admin)):
    users_count = await db.users.count_documents({"role": {"$ne": "admin"}})
    channels = await db.channels.find({}).to_list(length=5000)
    total_channels = len(channels)
    active = sum(1 for c in channels if c["status"] == "active")
    expired = sum(1 for c in channels if c["status"] == "expired")

    # revenue = sum of debit transactions
    revenue_agg = await db.transactions.aggregate(
        [{"$match": {"type": "debit"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    ).to_list(1)
    revenue = revenue_agg[0]["total"] if revenue_agg else 0
    recharges_agg = await db.transactions.aggregate(
        [{"$match": {"type": "credit"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    ).to_list(1)
    total_recharges = recharges_agg[0]["total"] if recharges_agg else 0

    return {
        "users": users_count,
        "total_channels": total_channels,
        "active_channels": active,
        "expired_channels": expired,
        "revenue": revenue,
        "total_recharges": total_recharges,
    }


@api.get("/admin/users")
async def admin_users(admin: Dict[str, Any] = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "otp_hash": 0, "reset_token": 0}).to_list(length=1000)
    for u in users:
        if isinstance(u.get("created_at"), datetime):
            u["created_at"] = iso(u["created_at"])
    return {"users": users}


@api.get("/admin/channels")
async def admin_channels(admin: Dict[str, Any] = Depends(require_admin)):
    channels = await db.channels.find({}).to_list(length=5000)
    return {"channels": [_serialize_channel(c) for c in channels]}


@api.post("/admin/wallet/adjust")
async def admin_wallet_adjust(payload: AdminWalletAdjustIn, admin: Dict[str, Any] = Depends(require_admin)):
    user = await db.users.find_one({"id": payload.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_balance = max(0, user.get("wallet_balance", 0) + payload.amount)
    await db.users.update_one({"id": payload.user_id}, {"$set": {"wallet_balance": new_balance}})
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": payload.user_id,
            "amount": abs(payload.amount),
            "type": "credit" if payload.amount >= 0 else "debit",
            "reason": f"Admin: {payload.reason}",
            "balance_after": new_balance,
            "created_at": now_utc(),
        }
    )
    await notify(
        payload.user_id,
        "Wallet Updated by Admin",
        f"{'Credited' if payload.amount >= 0 else 'Debited'} ₹{abs(payload.amount)}. Reason: {payload.reason}",
        "admin_wallet",
    )
    return {"user_id": payload.user_id, "new_balance": new_balance}


@api.delete("/admin/channels/{channel_id}")
async def admin_delete_channel(channel_id: str, admin: Dict[str, Any] = Depends(require_admin)):
    ch = await db.channels.find_one({"id": channel_id})
    if not ch:
        raise HTTPException(status_code=404, detail="Not found")
    await flussonic.delete_stream(ch["stream_name"])
    await db.channels.delete_one({"id": channel_id})
    return {"ok": True}


@api.post("/admin/channels/{channel_id}/disable")
async def admin_disable_channel(channel_id: str, admin: Dict[str, Any] = Depends(require_admin)):
    ch = await db.channels.find_one({"id": channel_id})
    if not ch:
        raise HTTPException(status_code=404, detail="Not found")
    # Preserve stream config on Flussonic; only stop it
    await flussonic.disable_stream(ch["stream_name"])
    await db.channels.update_one({"id": channel_id}, {"$set": {"status": "disabled", "updated_at": now_utc()}})
    return {"ok": True}


@api.post("/admin/expire-now")
async def admin_expire_now(admin: Dict[str, Any] = Depends(require_admin)):
    await expire_channels_task()
    return {"ok": True}


app.include_router(api)
