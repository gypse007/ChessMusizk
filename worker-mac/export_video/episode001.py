"""
Legends of the 64 - Episode 001 Video Renderer
Generates a deterministic 1080x1920 (9:16) cinematic vertical video for Pilot Episode 001:
"The Magician from Riga" (Mikhail Tal vs Mikhail Botvinnik, 1960 Game 6).
"""

import math
import os
import subprocess
from typing import Dict, Any, List

def create_svg_frame(
    frame_idx: int,
    fps: int,
    total_frames: int,
    episode_data: Dict[str, Any]
) -> str:
    t = frame_idx / fps
    width = 1080
    height = 1920

    # Act timeline breakdown:
    # 0.0 - 5.0s: Hook & Character Reveal
    # 5.0 - 12.0s: The Boss & The Impasse
    # 12.0 - 20.0s: The Impossible Sacrifice (21...Nf4!!)
    # 20.0 - 32.0s: The Collapse & Boss Defeat
    # 32.0 - 40.0s: Victory & Product Teaser

    # Dynamic states
    boss_hp = 100
    aura_opacity = 0.2
    act_title = "ACT I: THE FORGOTTEN SANCTUM"
    subtitle = "AN ANCIENT DUNGEON UNBEATEN FOR CENTURIES"
    board_highlight_square = None
    sacrifice_pulse = 0.0

    if t < 5.0:
        act_title = "LEGENDS OF THE 64 — EPISODE 001"
        subtitle = "SOME WARRIORS PROTECT THEIR WEAPONS. TAL SACRIFICED HIS."
        aura_opacity = 0.3 + 0.1 * math.sin(t * 4)
    elif t < 12.0:
        act_title = "BOSS TRIAL: THE IRON PATRIARCH"
        subtitle = "BOTVINNIK BUILT A WALL OF STONE. CONVENTIONAL CALCULATION IS FATAL."
        boss_hp = 100
        aura_opacity = 0.4
    elif t < 20.0:
        act_title = "THE SACRIFICIAL INVOCATION: 21... Nf4!!"
        subtitle = "THE MAGICIAN SURRENDERS HIS KNIGHT TO FRACTURE REALITY."
        progress = (t - 12.0) / 8.0
        boss_hp = int(100 - progress * 40)
        board_highlight_square = "f4"
        sacrifice_pulse = abs(math.sin((t - 12.0) * 8))
        aura_opacity = 0.7 + 0.3 * sacrifice_pulse
    elif t < 32.0:
        act_title = "THE DEFENSIVE MATRIX COLLAPSES"
        subtitle = "22.gxf4 exf4 23.Bd2 Qf6! THE BLACK QUEEN PENETRATES."
        progress = (t - 20.0) / 12.0
        boss_hp = max(0, int(60 - progress * 60))
        aura_opacity = 0.6 + 0.2 * math.cos(t * 5)
    else:
        act_title = "DUNGEON CLEARED: THE MAGICIAN FROM RIGA"
        subtitle = "ONE SACRIFICE. ONE LEGEND. 64 SQUARES. COMING SOON."
        boss_hp = 0
        aura_opacity = 0.8 + 0.2 * math.sin(t * 3)

    # Chessboard coordinates: 8x8 grid centered at (140, 520) with size 800x800
    board_x = 140
    board_y = 520
    sq_size = 100

    # Simplified representation of key pieces around move 21...Nf4
    # Black: Kf8, Qc7, Be7, Nf6, pawn f5, pawn c5, pawn a5
    # White: Kg1, Qe2, Bd3, Nf3, pawn f2, pawn g2, pawn h2, pawn c4, pawn d4
    squares_svg = []
    for r in range(8):
        for c in range(8):
            is_dark = (r + c) % 2 == 1
            sq_color = "#27272a" if is_dark else "#3f3f46"
            sq_x = board_x + c * sq_size
            sq_y = board_y + r * sq_size

            # File and rank notation (e.g. f4 is col 5, row 4 from top: row 0=rank 8, row 4=rank 4)
            file_char = chr(ord('a') + c)
            rank_char = str(8 - r)
            coord = f"{file_char}{rank_char}"

            stroke_attr = 'stroke="#18181b" stroke-width="1"'
            if coord == board_highlight_square:
                sq_color = "#7c3aed"
                stroke_attr = f'stroke="#ec4899" stroke-width="{int(4 + 6 * sacrifice_pulse)}"'

            squares_svg.append(f'<rect x="{sq_x}" y="{sq_y}" width="{sq_size}" height="{sq_size}" fill="{sq_color}" {stroke_attr} />')

    # Piece symbols for aesthetic tactical display
    # Botvinnik King g1 -> col 6, row 7
    # Tal Knight f4 -> col 5, row 4
    # White Pawns d4 (col 3, row 4), c4 (col 2, row 4)
    pieces_svg = [
        # White King g1
        f'<text x="{board_x + 6 * sq_size + 50}" y="{board_y + 7 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#ffffff">♔</text>',
        # White Queen e2
        f'<text x="{board_x + 4 * sq_size + 50}" y="{board_y + 6 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#ffffff">♕</text>',
        # White Bishop d3
        f'<text x="{board_x + 3 * sq_size + 50}" y="{board_y + 5 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#ffffff">♗</text>',
        # Black King g8
        f'<text x="{board_x + 6 * sq_size + 50}" y="{board_y + 0 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#a855f7">♚</text>',
        # Black Queen c7
        f'<text x="{board_x + 2 * sq_size + 50}" y="{board_y + 1 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#a855f7">♛</text>',
        # Black Bishop e7
        f'<text x="{board_x + 4 * sq_size + 50}" y="{board_y + 1 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#a855f7">♝</text>',
    ]

    if t >= 12.0 and t < 22.0:
        # Knight on f4 glowing with sacrifice aura
        pieces_svg.append(
            f'<text x="{board_x + 5 * sq_size + 50}" y="{board_y + 4 * sq_size + 70}" font-size="70" text-anchor="middle" fill="#f43f5e" font-weight="bold">♞</text>'
        )
    elif t < 12.0:
        # Knight on e6 (col 4, row 2) before sacrifice
        pieces_svg.append(
            f'<text x="{board_x + 4 * sq_size + 50}" y="{board_y + 2 * sq_size + 70}" font-size="64" text-anchor="middle" fill="#a855f7">♞</text>'
        )

    grid_elements = "\n".join(squares_svg)
    piece_elements = "\n".join(pieces_svg)

    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="60%" stop-color="#09090b" />
      <stop offset="100%" stop-color="#020202" />
    </radialGradient>
    <linearGradient id="auraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="{aura_opacity}" />
      <stop offset="50%" stop-color="#ec4899" stop-opacity="{aura_opacity * 0.7}" />
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="15" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="{width}" height="{height}" fill="url(#bgGrad)" />

  <!-- Dynamic Aura Wave -->
  <circle cx="{width // 2}" cy="920" r="{450 + int(40 * math.sin(t * 3))}" fill="url(#auraGrad)" filter="url(#glow)" />

  <!-- Top HUD: Game Franchise Branding -->
  <g transform="translate(60, 80)">
    <rect x="0" y="0" width="960" height="90" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="2" />
    <text x="40" y="55" font-family="sans-serif" font-size="28" font-weight="900" fill="#facc15" letter-spacing="4">LEGENDS OF THE 64</text>
    <text x="920" y="55" font-family="sans-serif" font-size="22" font-weight="bold" fill="#a1a1aa" text-anchor="end">EPISODE 001</text>
  </g>

  <!-- Boss Health & Threat Bar -->
  <g transform="translate(60, 200)">
    <!-- Legend Card (Left) -->
    <rect x="0" y="0" width="460" height="150" rx="16" fill="#111827" stroke="#8b5cf6" stroke-width="2" />
    <text x="30" y="45" font-family="sans-serif" font-size="24" font-weight="bold" fill="#8b5cf6">MIKHAIL TAL</text>
    <text x="30" y="80" font-family="sans-serif" font-size="16" fill="#9ca3af">CHAOS STRATEGIST</text>
    <text x="30" y="115" font-family="sans-serif" font-size="18" font-weight="bold" fill="#f43f5e">MANA: 100% [READY]</text>

    <!-- Boss Card (Right) -->
    <rect x="500" y="0" width="460" height="150" rx="16" fill="#18181b" stroke="#ef4444" stroke-width="2" />
    <text x="530" y="45" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ef4444">THE IRON PATRIARCH</text>
    <text x="530" y="80" font-family="sans-serif" font-size="16" fill="#9ca3af">HP: {boss_hp} / 100</text>
    <!-- HP Progress bar -->
    <rect x="530" y="100" width="400" height="16" rx="8" fill="#27272a" />
    <rect x="530" y="100" width="{int(400 * (boss_hp / 100.0))}" height="16" rx="8" fill="#ef4444" />
  </g>

  <!-- Tactical Chessboard Container -->
  <g id="chessboard_group">
    <!-- Stone Border -->
    <rect x="{board_x - 16}" y="{board_y - 16}" width="{800 + 32}" height="{800 + 32}" rx="16" fill="#09090b" stroke="#52525b" stroke-width="4" />
    {grid_elements}
    {piece_elements}
  </g>

  <!-- Bottom Narrative HUD -->
  <g transform="translate(60, 1420)">
    <rect x="0" y="0" width="960" height="240" rx="20" fill="#09090b" stroke="#71717a" stroke-width="2" />
    <text x="480" y="60" font-family="sans-serif" font-size="26" font-weight="900" fill="#a855f7" text-anchor="middle" letter-spacing="2">
      {act_title}
    </text>
    <foreignObject x="40" y="90" width="880" height="120">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: sans-serif; font-size: 22px; color: #f4f4f5; text-align: center; line-height: 1.5; font-weight: 600;">
        {subtitle}
      </div>
    </foreignObject>
  </g>

  <!-- Product Call to Action Bar -->
  <g transform="translate(60, 1720)">
    <rect x="0" y="0" width="960" height="120" rx="20" fill="#7c3aed" />
    <text x="480" y="70" font-family="sans-serif" font-size="30" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
      EVERY MOVE HAS A CONSEQUENCE. ENTER THE 64.
    </text>
  </g>
</svg>
"""
    return svg_content
