"""Flussonic Media Server client.
Uses REST API v3 with HTTP Basic auth.
Env is read LAZILY (per call) because this module may be imported before
server.py's load_dotenv() has run.
"""
from __future__ import annotations

import base64
import logging
import os
import time
import traceback
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


class FlussonicClient:
    def _cfg(self) -> Dict[str, str]:
        base_url = (os.environ.get("FLUSSONIC_URL") or "").rstrip("/")
        parsed = urlparse(base_url) if base_url else None
        return {
            "base_url": base_url,
            "user": os.environ.get("FLUSSONIC_USER", ""),
            "password": os.environ.get("FLUSSONIC_PASS", ""),
            "host": (parsed.hostname if parsed else "") or "",
            "scheme": (parsed.scheme if parsed else "https") or "https",
        }

    @property
    def host(self) -> str:
        return self._cfg()["host"]

    @property
    def scheme(self) -> str:
        return self._cfg()["scheme"]

    def _auth_header(self, cfg: Dict[str, str]) -> Dict[str, str]:
        raw = f"{cfg['user']}:{cfg['password']}".encode()
        return {"Authorization": "Basic " + base64.b64encode(raw).decode()}

    async def _req(self, method: str, path: str, **kwargs: Any) -> Optional[httpx.Response]:
        cfg = self._cfg()
        if not cfg["base_url"]:
            print(f"[FLUSSONIC] base_url empty; skipping {method} {path}", flush=True)
            return None
        url = f"{cfg['base_url']}{path}"
        try:
            async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
                resp = await client.request(
                    method, url, headers=self._auth_header(cfg), **kwargs
                )
                return resp
        except Exception as e:  # network / SSL / DNS
            print(f"[FLUSSONIC] {method} {url} FAILED: {type(e).__name__}: {e}", flush=True)
            traceback.print_exc()
            return None

    async def create_stream(self, stream_name: str) -> Dict[str, Any]:
        return await self._put_stream(stream_name, disabled=False)

    async def disable_stream(self, stream_name: str) -> Dict[str, Any]:
        """Keep stream config on Flussonic but stop publishing/playback."""
        return await self._put_stream(stream_name, disabled=True)

    async def enable_stream(self, stream_name: str) -> Dict[str, Any]:
        """Re-enable a previously disabled stream (recreates if missing)."""
        return await self._put_stream(stream_name, disabled=False)

    async def _put_stream(self, stream_name: str, disabled: bool) -> Dict[str, Any]:
        body = {"inputs": [{"url": "publish://"}], "disabled": disabled}
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
        resp = await self._req("GET", f"/streamer/api/v3/streams/{stream_name}")
        if resp and resp.status_code == 200:
            try:
                return resp.json()
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
        """Normalize Flussonic v3 stream payload into flat metrics.

        Flussonic v3 shape (from GET /streamer/api/v3/streams/{name}):
          {"stats": {"alive": bool, "bytes_in": n, "bytes_out": n,
                     "online_clients": n, "inputs_bandwidth": n,
                     "out_bandwidth": n, "opened_at": ms},
           "inputs": [{"stats": {"media_info": {"tracks": [...]}}}]}
        """
        if not raw:
            return _empty_metrics()
        stats = raw.get("stats") or {}
        inputs = raw.get("inputs") or []
        media = {}
        if inputs and isinstance(inputs, list):
            first = inputs[0] or {}
            media = ((first.get("stats") or {}).get("media_info")) or {}
        tracks = media.get("tracks") or media.get("streams") or []
        video_tr = next((t for t in tracks if t.get("content") == "video"), {}) or {}
        audio_tr = next((t for t in tracks if t.get("content") == "audio"), {}) or {}
        width = video_tr.get("width") or 0
        height = video_tr.get("height") or 0

        opened_ms = stats.get("opened_at") or 0
        uptime = 0
        if opened_ms:
            uptime = max(0, int(time.time()) - int(opened_ms / 1000))

        return {
            "alive": bool(stats.get("alive")),
            "bitrate_in": int(stats.get("inputs_bandwidth") or 0),
            "bitrate_out": int(stats.get("out_bandwidth") or 0),
            "resolution": f"{width}x{height}" if width and height else "-",
            "fps": int(video_tr.get("fps") or 0),
            "audio_codec": audio_tr.get("codec") or "-",
            "video_codec": video_tr.get("codec") or "-",
            "viewers": int(stats.get("online_clients") or stats.get("client_count") or 0),
            "uptime_seconds": uptime if bool(stats.get("alive")) else 0,
            "bandwidth_bytes": int(stats.get("bytes_out") or 0),
        }


def _empty_metrics() -> Dict[str, Any]:
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


flussonic = FlussonicClient()
