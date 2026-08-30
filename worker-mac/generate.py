from __future__ import annotations

import asyncio
import hashlib
import httpx
from dataclasses import dataclass, field
from typing import Optional

from worker_mac.r2 import upload_audio


@dataclass
class JobHandle:
    task_id: str
    poll_url: str
    audio_url_template: str


@dataclass
class GenResult:
    task_id: str
    audio_paths: list[str]
    seeds: list[int]


ACE_STEP_URL = "http://localhost:8001"


async def submit(spec: dict) -> JobHandle:
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        resp = await client.post(
            f"{ACE_STEP_URL}/release_task",
            json={
                "caption": spec["caption"],
                "bpm": spec["bpm"],
                "duration": spec["durationSec"],
                "instrumental": spec["instrumental"],
                "batch_size": spec["batchSize"],
                "inference_steps": 8,
                "seed": spec["seed"],
                "audio_format": "wav",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    task_id = data.get("task_id") or data.get("taskId") or "unknown"
    return JobHandle(
        task_id=task_id,
        poll_url=f"{ACE_STEP_URL}/query_result",
        audio_url_template=f"{ACE_STEP_URL}/v1/audio",
    )


async def poll(handle: JobHandle) -> Optional[GenResult]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        resp = await client.get(
            handle.poll_url,
            params={"task_id": handle.task_id},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status", "").lower()
    if status not in ("done", "completed", "success"):
        return None

    audio_urls = []
    seeds = []
    results = data.get("results") or data.get("outputs") or []
    for i, item in enumerate(results):
        url = item.get("audio_url") or item.get("url") or f"{handle.audio_url_template}?task_id={handle.task_id}&idx={i}"
        audio_urls.append(url)
        seeds.append(item.get("seed", -1))

    if not audio_urls:
        audio_urls = [f"{handle.audio_url_template}?task_id={handle.task_id}"]
        seeds = [-1]

    return GenResult(task_id=handle.task_id, audio_paths=audio_urls, seeds=seeds)
