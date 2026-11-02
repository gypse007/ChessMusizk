"""
Legends of the 64 - Automated Production Pipeline Orchestrator.
Builds deterministic video episodes by coupling chess validation, narrative generation,
and procedural video rendering.
"""

import os
import sys
import json
import subprocess
from pathlib import Path

# Add project root, worker-mac directory, and self_created_tools to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)
sys.path.append(os.path.dirname(current_dir))
sys.path.append("/home/jules/self_created_tools")

from export_video.episode001 import create_svg_frame

def render_episode(output_path: str, duration_sec: int = 5, fps: int = 15):
    """
    Renders an episode to an MP4 video using ffmpeg and procedural SVG frames.
    """
    out_dir = Path("/tmp/legends_frames")
    out_dir.mkdir(parents=True, exist_ok=True)

    total_frames = duration_sec * fps
    print(f"Generating {total_frames} frames for {duration_sec}s preview...")

    # Load Tal 1960 metadata
    meta_path = Path("docs/research/historical_chess_tal_1960.json")
    episode_data = {}
    if meta_path.exists():
        with open(meta_path) as f:
            episode_data = json.load(f)

    # Render frames to SVG and convert to PNG using ffmpeg or direct svg piping
    for i in range(total_frames):
        svg_code = create_svg_frame(i, fps, total_frames, episode_data)
        svg_file = out_dir / f"frame_{i:04d}.svg"
        with open(svg_file, "w") as f:
            f.write(svg_code)

    print("Encoding frames into MP4 via ffmpeg...")
    # Use ffmpeg with librsvg / svg input pattern
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate", str(fps),
        "-i", str(out_dir / "frame_%04d.svg"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path
    ]
    subprocess.run(cmd, check=True)
    print(f"Render complete: {output_path}")

def main():
    out_file = sys.argv[1] if len(sys.argv) > 1 else "/tmp/legends_episode_001.mp4"
    render_episode(out_file, duration_sec=3, fps=10)

if __name__ == "__main__":
    main()
