import pytest
from worker_mac.timeprofile import (
    parse_time_control,
    parse_clock_time,
    extract_termination,
    extract_time_profile,
)


def test_time_control_parsing():
    # 20+1 ordering trap: base 20 is <= 30, but est = 20 + 40*1 = 60s -> bullet, not ultrabullet!
    speed, est = parse_time_control("20+1")
    assert speed == "bullet"
    assert est == 60.0

    # 15+0 -> ultrabullet (< 30)
    speed, est = parse_time_control("15+0")
    assert speed == "ultrabullet"
    assert est == 15.0

    # 180+2 -> 180 + 80 = 260 -> blitz
    speed, est = parse_time_control("180+2")
    assert speed == "blitz"
    assert est == 260.0

    # 300 -> 300 -> blitz
    speed, est = parse_time_control("300")
    assert speed == "blitz"
    assert est == 300.0

    # 600 -> rapid
    speed, est = parse_time_control("600")
    assert speed == "rapid"
    assert est == 600.0

    # 3600 -> classical
    speed, est = parse_time_control("3600")
    assert speed == "classical"
    assert est == 3600.0

    # Daily: 1/86400 -> daily
    speed, est = parse_time_control("1/86400")
    assert speed == "daily"

    # Unknown
    speed, est = parse_time_control("-")
    assert speed == "unknown"
    assert est is None

    speed, est = parse_time_control("?")
    assert speed == "unknown"


def test_clock_time_parsing():
    assert parse_clock_time("1:02:03") == 3723.0
    assert parse_clock_time("03:12.5") == 192.5
    assert parse_clock_time("10.2") == 10.2
    assert parse_clock_time("invalid") is None


def test_termination_parsing():
    pgn_checkmate = '[Result "1-0"]\n[Termination "Normal - White won by checkmate"]\n'
    assert extract_termination(pgn_checkmate) == "checkmate"

    pgn_resignation = '[Result "0-1"]\n[Termination "Black won by resignation"]\n'
    assert extract_termination(pgn_resignation) == "resignation"

    pgn_timeout = '[Result "1-0"]\n[Termination "White won on time / time forfeit"]\n'
    assert extract_termination(pgn_timeout) == "timeout"

    pgn_draw = '[Result "1/2-1/2"]\n[Termination "Game drawn by stalemate"]\n'
    assert extract_termination(pgn_draw) == "draw"


def test_extract_time_profile():
    pgn = """[Event "Live Chess"]
[Site "Chess.com"]
[TimeControl "180+2"]
[Result "1-0"]
[Termination "White won on time"]

1. e4 { [%clk 0:02:59.8] } 1... e5 { [%clk 0:02:58.0] }
2. Nf3 { [%clk 0:00:10.0] } 2... Nc6 { [%clk 0:00:08.0] }
3. Bc4 { [%clk 0:00:11.8] } 3... Nf6 { [%clk 0:00:07.9] }
"""
    tp = extract_time_profile(pgn)
    assert tp.speed_tier == "blitz"
    # Zeitnot check (< 15s)
    assert 3 in tp.zeitnot_plies  # ply 3: 10s
    assert 4 in tp.zeitnot_plies  # ply 4: 8s
    assert 5 in tp.zeitnot_plies  # ply 5: 11.8s
    assert 6 in tp.zeitnot_plies  # ply 6: 7.9s

    # Premove burst check (move duration < 0.5s):
    # ply 5: White clock went from 10.0 to 11.8 with +2 inc -> elapsed = 10.0 - 11.8 + 2.0 = 0.2s (< 0.5s)
    assert 5 in tp.premove_burst_plies
