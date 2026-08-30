from __future__ import annotations

from worker_mac.generate import submit, poll, JobHandle, GenResult
from worker_mac.c2m_types import SoundtrackSpec


class LocalACEGenerator:
    async def submit(self, spec: SoundtrackSpec) -> JobHandle:
        return await submit(spec.__dict__)

    async def poll(self, handle: JobHandle) -> GenResult | None:
        return await poll(handle)
