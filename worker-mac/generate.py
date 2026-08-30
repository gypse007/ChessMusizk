from __future__ import annotations

import asyncio
import json
import time
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


class TaskLostError(Exception):
    pass


ACE_STEP_URL = "http://localhost:8001"


async def submit(spec: dict, *, client: Optional[httpx.AsyncClient] = None) -> JobHandle:
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
    try:
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
        if resp.status_code >= 500:
            raise TaskLostError(f"submit failed with {resp.status_code}")
        resp.raise_for_status()
        body = resp.json()
        data = body.get("data") or {}
        task_id = data.get("task_id") or "unknown"
        return JobHandle(
            task_id=task_id,
            poll_url=f"{ACE_STEP_URL}/query_result",
            audio_url_template=f"{ACE_STEP_URL}/v1/audio",
        )
    finally:
        if owns_client:
            await client.aclose()


async def submit_with_retry(spec: dict, client: httpx.AsyncClient, max_retries: int = 3) -> JobHandle:
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            return await submit(spec, client=client)
        except (TaskLostError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
    raise TaskLostError(f"submit failed after {max_retries} retries: {last_exc}")


async def wait_for_server_ready(client: httpx.AsyncClient, timeout: float = 300.0) -> None:
    deadline = time.monotonic() + timeout
    stable_ok_count = 0
    required_stable = 2
    while time.monotonic() < deadline:
        try:
            resp = await client.get(f"{ACE_STEP_URL}/health")
            if resp.status_code == 200:
                body = resp.json()
                data = body.get("data") or {}
                if data.get("models_initialized"):
                    return
                if data.get("status") == "ok":
                    stable_ok_count += 1
                    if stable_ok_count >= required_stable:
                        return
                    continue
        except Exception:
            pass
        stable_ok_count = 0
        await asyncio.sleep(5)
    raise TaskLostError("server did not become ready within timeout")


async def poll(handle: JobHandle, *, client: Optional[httpx.AsyncClient] = None) -> Optional[GenResult]:
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
    try:
        resp = await client.post(
            handle.poll_url,
            json={"task_id_list": [handle.task_id]},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        body = resp.json()
        items = body.get("data") or []
        if not items:
            raise TaskLostError("server returned no data for task")

        raw = items[0].get("status")
        try:
            s = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"non-numeric status {raw!r}")

        if s == 1:
            pass
        elif s == 0:
            return None
        elif s == 2:
            raise ValueError(f"task failed with status {s}")
        else:
            raise ValueError(f"unknown status code {s}")

        audio_urls = []
        seeds = []
        results = items[0].get("result") or "[]"
        try:
            parsed_results = json.loads(results) if isinstance(results, str) else results
        except (json.JSONDecodeError, TypeError):
            parsed_results = []

        for i, item in enumerate(parsed_results):
            url = item.get("audio_url") or item.get("url") or f"{handle.audio_url_template}?task_id={handle.task_id}&idx={i}"
            audio_urls.append(url)
            seeds.append(item.get("seed", -1))

        if not audio_urls:
            audio_urls = [f"{handle.audio_url_template}?task_id={handle.task_id}"]
            seeds = [-1]

        return GenResult(task_id=handle.task_id, audio_paths=audio_urls, seeds=seeds)
    finally:
        if owns_client:
            await client.aclose()


async def poll_with_branches(
    client: httpx.AsyncClient,
    handle: JobHandle,
    spec: dict,
    job_id: str,
) -> Optional[GenResult]:
    deadline = time.monotonic() + 600.0
    resubmitted = False
    backoff = 1.0

    while True:
        try:
            result = await poll(handle, client=client)
            if result:
                return result
            backoff = 1.0
        except TaskLostError:
            if not resubmitted:
                handle = await submit_with_retry(spec, client)
                resubmitted = True
                continue
            raise
        except (httpx.ConnectError, httpx.ReadError):
            if not resubmitted:
                await asyncio.sleep(backoff)
                handle = await submit_with_retry(spec, client)
                resubmitted = True
                backoff = 1.0
                continue
            raise
        except ValueError:
            raise

        if time.monotonic() > deadline:
            if not resubmitted:
                handle = await submit_with_retry(spec, client)
                resubmitted = True
                deadline = time.monotonic() + 600.0
                continue
            raise TimeoutError("task stuck beyond resubmit deadline")

        await asyncio.sleep(min(backoff, 30.0))
        backoff = min(backoff * 2, 30.0)
