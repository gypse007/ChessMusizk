from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import httpx

from worker_mac.generate import submit_with_retry, wait_for_server_ready, poll_with_branches, GenResult
from worker_mac.grammar import event_graph_to_spec
from worker_mac.master import master_take, package_take
from worker_mac.watermark import mix_watermark
from worker_mac.r2 import upload_audio, upload_json
from worker_mac.c2m_types import JobStatus


WORKER_BASE_URL = os.environ["WORKER_BASE_URL"]
WORKER_SHARED_TOKEN = os.environ["WORKER_SHARED_TOKEN"]
WATERMARK_STING = os.environ.get("WATERMARK_STING", "")


async def claim_job(client: httpx.AsyncClient) -> dict | None:
    resp = await client.get(
        f"{WORKER_BASE_URL}/internal/claim",
        headers={"Authorization": f"Bearer {WORKER_SHARED_TOKEN}"},
    )
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    return resp.json()


async def post_status(client: httpx.AsyncClient, job_id: str, status: JobStatus) -> None:
    await client.post(
        f"{WORKER_BASE_URL}/internal/status",
        headers={"Authorization": f"Bearer {WORKER_SHARED_TOKEN}", "Content-Type": "application/json"},
        json={"job_id": job_id, "status": status},
    )


async def complete_job(client: httpx.AsyncClient, job_id: str, takes: list[dict]) -> None:
    await client.post(
        f"{WORKER_BASE_URL}/internal/complete",
        headers={"Authorization": f"Bearer {WORKER_SHARED_TOKEN}", "Content-Type": "application/json"},
        json={"job_id": job_id, "takes": takes},
    )


async def process_job(client: httpx.AsyncClient, job: dict) -> None:
    job_id = job["id"]
    pgn = job["pgn"]
    target_sec = job["targetSec"]
    event_graph = job.get("eventGraph")

    if not event_graph:
        await post_status(client, job_id, JobStatus.failed)
        return

    from worker_mac.c2m_types import EventGraph, Anchor, MoveNode

    moves = [
        MoveNode(
            ply=m["ply"],
            san=m["san"],
            fen=m["fen"],
            evalBefore=m["evalBefore"],
            evalAfter=m["evalAfter"],
            evalSwing=m["evalSwing"],
            classification=m["classification"],
            phase=m["phase"],
            flags=m.get("flags", {}),
        )
        for m in event_graph.get("moves", [])
    ]
    anchors = [Anchor(**a) for a in event_graph.get("anchors", [])]
    graph = EventGraph(
        moves=moves,
        anchors=anchors,
        totalPlies=event_graph.get("totalPlies", len(moves)),
        targetDurationSec=target_sec,
    )

    await post_status(client, job_id, JobStatus.arc)
    spec = event_graph_to_spec(graph)

    await post_status(client, job_id, JobStatus.composing)

    await wait_for_server_ready(client)
    handle = await submit_with_retry(spec.__dict__, client)
    result = await poll_with_branches(client, handle, spec.__dict__, job_id)
    if not result:
        await post_status(client, job_id, JobStatus.failed)
        return

    await post_status(client, job_id, JobStatus.mastering)
    takes = []
    for idx, audio_path in enumerate(result.audio_paths):
        take_data = package_take(audio_path, job_id, idx, target_sec, spec.anchors)
        takes.append(take_data)

    await complete_job(client, job_id, takes)


async def main() -> None:
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        while True:
            try:
                job = await claim_job(client)
                if job:
                    await process_job(client, job)
                else:
                    await asyncio.sleep(5)
            except Exception as exc:
                print(f"poller error: {exc}")
                await asyncio.sleep(10)


if __name__ == "__main__":
    asyncio.run(main())
