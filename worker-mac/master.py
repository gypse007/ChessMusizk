from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from worker_mac.r2 import upload_audio, upload_json
from worker_mac.analyze import analyze_audio, map_anchors_to_landmarks


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def master_take(wav_path: str, target_sec: int = 60, watermark_sting: str | None = None) -> str:
    measured = _measure(wav_path)
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "take"
        loud = Path(tmp) / "loud.wav"
        final = Path(tmp) / "final.wav"

        _run([
            "ffmpeg", "-y", "-i", wav_path,
            "-af", f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={measured['I']}:measured_TP={measured['TP']}:measured_LRA={measured['LRA']}:measured_thresh={measured['thresh']}:offset={measured['offset']}:linear=true",
            "-ar", "48000", str(loud),
        ])

        if target_sec == 60:
            fade_start = 59.6
        else:
            fade_start = 74.6

        filters = [f"afade=t=out:st={fade_start}:d=0.4", f"atrim=0:{target_sec}"]
        if watermark_sting and Path(watermark_sting).exists():
            filters.append(f"amix=inputs=2:duration=first:dropout_transition=2[out]")
            filter_complex = f"[0:a]{','.join(filters[:2])}[a];[a][1:a]{filters[2]}"
            _run([
                "ffmpeg", "-y", "-i", str(loud), "-i", watermark_sting,
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-ar", "48000", str(final),
            ])
        else:
            _run([
                "ffmpeg", "-y", "-i", str(loud),
                "-af", ",".join(filters),
                "-t", str(target_sec),
                "-ar", "48000", str(final),
            ])

        out_path = Path(wav_path).with_suffix(".mastered.wav")
        _run(["ffmpeg", "-y", "-i", str(final), str(out_path)])
        return str(out_path)


def _measure(wav_path: str) -> dict[str, str]:
    result = subprocess.run(
        ["ffmpeg", "-i", wav_path, "-af", "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    stderr = result.stderr
    data: dict[str, str] = {}
    for line in stderr.splitlines():
        if ":" in line and any(k in line for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")):
            key, val = line.split(":", 1)
            data[key.strip()] = val.strip()
    return {
        "I": data.get("input_i", "-16.0"),
        "TP": data.get("input_tp", "-2.0"),
        "LRA": data.get("input_lra", "8.0"),
        "thresh": data.get("input_thresh", "-21.0"),
        "offset": data.get("target_offset", "0.0"),
    }


def encode_opus(wav_path: str) -> str:
    out = Path(wav_path).with_suffix(".opus")
    _run(["ffmpeg", "-y", "-i", wav_path, "-c:a", "libopus", "-b:a", "128k", str(out)])
    return str(out)


def package_take(wav_path: str, job_id: str, idx: int, target_sec: int, anchors: list[Anchor]) -> dict:
    opus_path = encode_opus(wav_path)
    landmarks, _ = analyze_audio(wav_path)
    anchor_map = map_anchors_to_landmarks(anchors, landmarks, float(target_sec))
    audio_key = f"takes/{job_id}_{idx}.opus"
    audio_url = upload_audio(audio_key, opus_path, "audio/opus")
    landmark_key = f"takes/{job_id}_{idx}.landmarks.json"
    upload_json(landmark_key, {
        "landmarks": [lm.__dict__ for lm in landmarks],
        "anchor_map": [{"ply": int(k), "tSec": float(v)} for k, v in anchor_map.items()],
    })
    return {
        "audio_key": audio_key,
        "audio_url": audio_url,
        "landmark_key": landmark_key,
        "landmarks": [lm.__dict__ for lm in landmarks],
        "anchor_map": [{"ply": int(k), "tSec": float(v)} for k, v in anchor_map.items()],
    }
