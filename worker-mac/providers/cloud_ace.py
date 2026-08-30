from __future__ import annotations

from worker_mac.providers import JobHandle, GenResult, MusicGenerator
from worker_mac.c2m_types import SoundtrackSpec


class CloudACEGenerator:
    def __init__(self, endpoint: str, api_key: str):
        self.endpoint = endpoint
        self.api_key = api_key

    async def submit(self, spec: SoundtrackSpec) -> JobHandle:
        raise NotImplementedError("Cloud ACE generator not yet implemented")

    async def poll(self, handle: JobHandle) -> GenResult | None:
        raise NotImplementedError("Cloud ACE generator not yet implemented")
