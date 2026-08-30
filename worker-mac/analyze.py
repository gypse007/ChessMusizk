from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

import librosa
import numpy as np

from packages.shared.src.index import Anchor, Landmark, LandmarkType


def analyze_audio(file_path: str) -> tuple[list[Landmark], dict[int, float]]:
    y, sr = librosa.load(file_path, sr=None, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    rms = librosa.feature.rms(y=y)[0]
    rms_frames = np.array([librosa.frames_to_time(i, sr=sr) for i in range(len(rms))])

    landmarks: list[Landmark] = []

    for t in onset_times:
        landmarks.append(Landmark(tSec=float(t), type="onset"))

    beat_times = librosa.frames_to_time(beats, sr=sr)
    for t in beat_times:
        landmarks.append(Landmark(tSec=float(t), type="beat"))

    threshold = np.percentile(rms, 90)
    for idx, val in enumerate(rms):
        if val > threshold:
            t = float(rms_frames[idx])
            if not any(abs(lm.tSec - t) < 0.05 for lm in landmarks):
                landmarks.append(Landmark(tSec=t, type="energy_peak"))

    landmarks.sort(key=lambda lm: lm.tSec)
    return landmarks, {"_beats": beat_times.tolist()}


def map_anchors_to_landmarks(
    anchors: list[Anchor],
    landmarks: list[Landmark],
    duration_sec: float,
) -> dict[int, float]:
    anchor_map: dict[int, float] = {}
    beat_times = [lm.tSec for lm in landmarks if lm.type == "beat"]
    if not beat_times:
        beat_times = [0.0, duration_sec]

    for anchor in anchors:
        if anchor.intent == "energy_peak":
            peaks = [lm.tSec for lm in landmarks if lm.type == "energy_peak"]
            anchor_map[anchor.ply] = peaks[len(peaks) // 2] if peaks else duration_sec * 0.75
        elif anchor.intent == "texture_drop":
            drops = [lm.tSec for lm in landmarks if lm.type == "texture_drop"]
            anchor_map[anchor.ply] = drops[len(drops) // 2] if drops else duration_sec * 0.35
        elif anchor.intent == "accent":
            onsets = [lm.tSec for lm in landmarks if lm.type == "onset"]
            anchor_map[anchor.ply] = onsets[len(onsets) // 2] if onsets else duration_sec * 0.5
        else:
            idx = min(anchor.ply, len(beat_times) - 1)
            anchor_map[anchor.ply] = beat_times[max(0, idx)]

    return anchor_map
