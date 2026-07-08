# Channel Broadcaster — Product Requirements Document

## Product
Cross-platform (Expo React Native) mobile app for **broadcasters** to create and manage live TV channels backed by a Flussonic Media Server. **Not** a viewer/OTT app — this is a broadcaster operations portal (IPTV operators, TV stations, churches, event organizers, educational institutions).

## Stack
- Frontend: Expo SDK 54 (React Native 0.81), Expo Router, TypeScript
- Backend: FastAPI + Motor (MongoDB)
- Streaming: Flussonic Media Server REST API v3 (basic auth)
- Auth: JWT (bcrypt password hashing) + Mock OTP login + Forgot password
- Payments: Razorpay — MOCKED (simulated `/wallet/recharge`)
- Admin: In-app admin section (`role: admin` gate)

## Business Rules
- Each channel costs ₹500 for 30 days.
- Channel creation debits wallet, provisions Flussonic stream via `PUT /streamer/api/v3/streams/{name}`.
- Renewal deducts ₹500 and extends validity by 30 days (adds to remaining time if still active).
- Background task expires channels hourly (`expire_channels_task`); admin can trigger via `/api/admin/expire-now`.
- Insufficient balance blocks channel creation/renewal.

## Feature List
1. **Auth**: register / login / OTP (mock) / forgot password / JWT me
2. **Dashboard**: wallet balance, active/expired/monthly stats, recent activity
3. **Wallet**: balance, recharge (mock), transaction history
4. **Channels**: list with filter chips, create (name/category/language/description/logo), detail (URLs, monitoring, preview), renew, disable/enable, delete
5. **Streaming Info**: publish (RTMP, backup, stream key masked, SRT) + all Flussonic playback outputs (HLS, LL-HLS, DASH, WebRTC, RTSP, thumbnail, preview image, embed). Each URL has copy/share/QR actions.
6. **Live Monitoring**: bitrate in/out, resolution, FPS, codecs, viewers, uptime, polled every 10s.
7. **Built-in Preview**: HLS player using `expo-video`.
8. **Notifications**: channel_created / recharge / expiry / renewal / admin_wallet — in-app list with mark-all-read.
9. **Admin Portal**: overview stats (users, channels, revenue, recharges), users list with wallet adjust modal, channels list with disable/delete, run expiry job.

## API Surface (all `/api/*`)
- POST `/auth/register` `/auth/login` `/auth/otp/request` `/auth/otp/verify` `/auth/forgot-password` `/auth/reset-password`
- GET `/auth/me`
- GET/POST `/wallet` `/wallet/recharge` `/wallet/transactions`
- GET/POST/DELETE `/channels`, `/channels/{id}`, `/channels/{id}/renew|disable|enable|monitor`
- GET `/dashboard`
- GET/POST `/notifications` `/notifications/read-all`
- Admin: `/admin/overview`, `/admin/users`, `/admin/channels`, `/admin/wallet/adjust`, `/admin/channels/{id}/disable`, DELETE `/admin/channels/{id}`, `/admin/expire-now`

## Mocked components
- **Razorpay** payment: `/api/wallet/recharge` credits wallet directly without gateway call.
- **OTP**: returned in response `mock_otp` field for on-screen display (Twilio not integrated).
- **Password reset token**: returned in response `mock_reset_token`.

## Real integrations
- **Flussonic**: real basic-auth calls to `https://mumbai-edge.smartplaytv.in` for create/delete/monitor. Failures are non-fatal; app still returns deterministic URL structures.

## Security Notes
- JWT signed with `JWT_SECRET` from `.env`
- Bcrypt password + OTP hashing
- Role-based route guards (`require_admin`)
- Basic-auth to Flussonic uses `.env` values only
