"""Flussonic Media Server client.
Uses REST API v3 with HTTP Basic auth.
If the remote server is unreachable / rejects auth, we still return a
deterministic set of URLs so the app remains functional (mocked fallback).
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


class FlussonicClient:
    def __init__(self) -> None:
        self.base_url: str = os.environ.get("FLUSSONIC_URL", "").rstrip("/")
        self.user: str = os.environ.get("FLUSSONIC_USER", "")
        self.password: str = os.environ.get("FLUSSONIC_PASS", "")
        parsed = urlparse(self.base_url) if self.base_url else None
        self.host: str = parsed.hostname if parsed else ""
        self.scheme: str = parsed.scheme if parsed else "https"

    def _auth_header(self) -> Dict[str, str]:
        raw = f"{self.user}:{self.password}".encode()
        return {"Authorization": "Basic " + base64.b64encode(raw).decode()}

    async def _req(self, method: str, path: str, **kwargs: Any) -> Optional[httpx.Response]:
        if not self.base_url:
            return None
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
                resp = await client.request(
                    method, url, headers=self._auth_header(), **kwargs
                )
                return resp
        except Exception as e:  # network / SSL / DNS
            logger.warning("Flussonic %s %s failed: %s", method, path, e)
            return None

    async def create_stream(self, stream_name: str) -> Dict[str, Any]:
        """Create a publish stream on Flussonic. Returns dict {success, raw}."""
        body = {"input": "publish://"}
        resp = await self._req(
            "PUT", f"/streamer/api/v3/streams/{stream_name}", json=body
        )
        if resp is None:
            return {"success": False, "error": "unreachable", "raw": None}
        if resp.status_code in (200, 201, 204):
            try:
                data = resp.json()
            except Exception:
                data = {}
            return {"success": True, "raw": data}
        return {
            "success": False,
            "status": resp.status_code,
            "error": resp.text[:300],
            "raw": None,
        }

    async def delete_stream(self, stream_name: str) -> bool:
        resp = await self._req("DELETE", f"/streamer/api/v3/streams/{stream_name}")
        return bool(resp and resp.status_code in (200, 204, 404))

    async def get_stream_info(self, stream_name: str) -> Dict[str, Any]:
        resp = await self._req("GET", f"/streamer/api/v3/streams/{stream_name}")
        if resp and resp.status_code == 200:
            try:
                return {"success": True, "data": resp.json()}
            except Exception:
                return {"success": False, "data": {}}
        return {"success": False, "data": {}}

    async def get_stream_health(self, stream_name: str) -> Dict[str, Any]:
        """Best-effort real-time metrics from Flussonic."""
        resp = await self._req(
            "GET", f"/streamer/api/v3/streams/{stream_name}/health"
        )
        if resp and resp.status_code == 200:
            try:
                return resp.json()
            except Exception:
                return {}
        # fallback endpoint
        resp2 = await self._req("GET", f"/streamer/api/v3/streams/{stream_name}")
        if resp2 and resp2.status_code == 200:
            try:
                return resp2.json()
            except Exception:
                return {}
        return {}

    def build_publish_urls(self, stream_name: str) -> Dict[str, str]:
        host = self.host or "mumbai-edge.smartplaytv.in"
        return {
            "rtmp_publish_url": f"rtmp://{host}:1935/static",
            "rtmp_backup_url": f"rtmp://{host}/live",
            "stream_key": stream_name,
            "srt_publish_url": f"srt://{host}:9998?streamid={stream_name}",
        }

    def build_playback_outputs(self, stream_name: str) -> Dict[str, str]:
        host = self.host or "mumbai-edge.smartplaytv.in"
        scheme = self.scheme or "https"
        base = f"{scheme}://{host}/{stream_name}"
        return {
            "hls": f"{base}/index.m3u8",
            "ll_hls": f"{base}/index.ll.m3u8",
            "dash": f"{base}/index.mpd",
            "webrtc": f"{base}/webrtc",
            "rtsp": f"rtsp://{host}:554/{stream_name}",
            "thumbnail": f"{base}/preview.mp4",
            "preview_image": f"{base}/preview.jpg",
            "embed": f"{base}/embed.html",
        }

    def parse_health(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize Flussonic health/status payload into flat metrics."""
        if not raw:
            return {
                "alive": False,
                "bitrate_in": 0,
                "bitrate_out": 0,
                "resolution": "-",
                "fps": 0,
                "audio_codec": "-",
                "video_codec": "-",
                "viewers": 0,
                "uptime_seconds": 0,
                "bandwidth_bytes": 0,
            }
        stats = raw.get("stats") or raw.get("input") or {}
        media = raw.get("media_info") or raw.get("mediaInfo") or {}
        streams = media.get("streams", []) if isinstance(media, dict) else []
        video_tr = next((s for s in streams if s.get("content") == "video"), {})
        audio_tr = next((s for s in streams if s.get("content") == "audio"), {})
        width = video_tr.get("width") or 0
        height = video_tr.get("height") or 0
        return {
            "alive": bool(raw.get("alive") or stats.get("alive")),
            "bitrate_in": int(stats.get("bitrate", 0)) if isinstance(stats.get("bitrate", 0), (int, float)) else 0,
            "bitrate_out": int(raw.get("output_bitrate", 0) or 0),
            "resolution": f"{width}x{height}" if width and height else "-",
            "fps": int(video_tr.get("fps") or 0),
            "audio_codec": audio_tr.get("codec") or "-",
            "video_codec": video_tr.get("codec") or "-",
            "viewers": int(raw.get("online_clients") or raw.get("clients") or 0),
            "uptime_seconds": int(stats.get("opened_at_delta") or 0),
            "bandwidth_bytes": int(raw.get("bytes_out") or 0),
        }


flussonic = FlussonicClient()
