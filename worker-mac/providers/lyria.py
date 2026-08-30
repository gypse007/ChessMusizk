from __future__ import annotations

from worker_mac.providers import JobHandle, GenResult, MusicGenerator
from worker_mac.c2m_types import SoundtrackSpec


class LyriaGenerator:
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def submit(self, spec: SoundtrackSpec) -> JobHandle:
        raise NotImplementedError("Lyria generator not yet implemented")

    async def poll(self, handle: JobHandle) -> GenResult | None:
        raise NotImplementedError("Lyria generator not yet implemented")
