import pytest
try:
    from worker_mac.timecontrol import parse_timecontrol, classify_speed
    from worker_mac.timeprofile import extract_time_profile, clk_seconds, emt_seconds
    from worker_mac.grammar import STYLE_PROFILES, get_negative_prompt_for_style, event_graph_to_spec, cap_anchors, derive_seed_from_pgn
    from worker_mac.c2m_types import EventGraph, MoveNode, Anchor
except ImportError:
    from timecontrol import parse_timecontrol, classify_speed
    from timeprofile import extract_time_profile, clk_seconds, emt_seconds
    from grammar import STYLE_PROFILES, get_negative_prompt_for_style, event_graph_to_spec, cap_anchors, derive_seed_from_pgn
    from c2m_types import EventGraph, MoveNode, Anchor


GOLDEN_FIXTURES = [
    ("30", "ultrabullet"),
    ("20+1", "ultrabullet"),
    ("60", "bullet"),
    ("60+1", "bullet"),
    ("120+1", "bullet"),
    ("180", "blitz"),
    ("300+3", "blitz"),
    ("600", "rapid"),
    ("3600", "rapid"),
    ("1/86400", "daily"),
    ("40/7200+30:20/900+30", "classical"),
    ("-", "unknown"),
    ("?", "unknown"),
    ("", "unknown"),
    (None, "unknown"),
]


@pytest.mark.parametrize("tc_str, expected_speed", GOLDEN_FIXTURES)
def test_timecontrol_golden_fixtures(tc_str, expected_speed):
    tc = parse_timecontrol(tc_str)
    speed = classify_speed(tc)
    assert speed == expected_speed, f"Expected {expected_speed} for {tc_str}, got {speed}"


def test_bullet_negative_prompt_never_contains_no_edm():
    bullet_profile = STYLE_PROFILES["bullet"]
    assert "no edm" not in bullet_profile.negative.lower()

    negative_full = get_negative_prompt_for_style("bullet")
    assert "no edm" not in negative_full.lower()


def test_rapid_negative_prompt_contains_no_edm():
    negative_full = get_negative_prompt_for_style("rapid")
    assert "no edm" in negative_full.lower()


def test_clk_seconds_parsing():
    assert clk_seconds("[%clk 1:30:15.5]") == 5415.5
    assert clk_seconds("[%clk 0:00:05]") == 5.0
    assert clk_seconds("no clk here") is None


def test_extract_time_profile_with_clk():
    pgn = """[Event "Blitz"]
[TimeControl "180+2"]
[Termination "Normal"]

1. e4 {%clk 0:02:59} 1... e5 {%clk 0:02:58}
2. Nf3 {%clk 0:00:08} 2... Nc6 {%clk 0:00:05}
1-0"""
    profile = extract_time_profile(pgn)
    assert profile.speed == "blitz"
    assert profile.zeitnot_count == 2
    assert profile.min_clock_s == 5.0
    assert profile.zeitnot_plies == [3, 4]


def test_empty_pgn_raises_value_error():
    with pytest.raises(ValueError, match="empty game"):
        extract_time_profile("")

    empty_graph = EventGraph(moves=[], anchors=[], totalPlies=0, targetDurationSec=60)
    with pytest.raises(ValueError, match="empty game"):
        event_graph_to_spec(empty_graph)


def test_caption_deduplication_and_seed_derivation():
    moves = [
        MoveNode(ply=1, san="e4", fen="", evalBefore=0, evalAfter=0, evalSwing=0, classification="good", phase="opening", flags={"check": True}),
        MoveNode(ply=2, san="e5", fen="", evalBefore=0, evalAfter=0, evalSwing=0, classification="good", phase="opening", flags={"check": True}),
        MoveNode(ply=3, san="Nf3", fen="", evalBefore=0, evalAfter=0, evalSwing=0, classification="good", phase="opening", flags={"check": True}),
    ]
    graph = EventGraph(moves=moves, anchors=[], totalPlies=3, targetDurationSec=60, termination="resignation")
    pgn = "1. e4 e5 2. Nf3"
    spec = event_graph_to_spec(graph, pgn_str=pgn)

    assert "rhythmic accent check (x3)" in spec.caption
    assert "resignation abrupt cut" in spec.caption
    assert spec.seed > 0
    assert spec.seed == derive_seed_from_pgn(pgn)


def test_anchor_capping():
    anchors = [
        Anchor(ply=i, kind="check", intent="accent") for i in range(1, 20)
    ]
    anchors.append(Anchor(ply=20, kind="checkmate", intent="final_cadence"))

    capped = cap_anchors(anchors, duration_sec=60)
    assert len(capped) == 10
    assert capped[-1].kind == "checkmate"
