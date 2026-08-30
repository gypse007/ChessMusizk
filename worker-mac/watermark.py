from __future__ import annotations

import os
import subprocess
from pathlib import Path


def mix_watermark(bed_path: str, sting_path: str, output_path: str) -> str:
    if not Path(sting_path).exists():
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "1.0", "-c:a", "pcm_s16le", sting_path],
            check=True,
            capture_output=True,
        )
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", bed_path,
            "-i", sting_path,
            "-filter_complex",
            f"[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[out]",
            "-map", "[out]",
            "-ar", "48000",
            output_path,
        ],
        check=True,
        capture_output=True,
    )
    return output_path
