import pytest
try:
    from worker_mac.c2m_types import EventGraph, MoveNode, Anchor
    from worker_mac.grammar import event_graph_to_spec, STYLE_PROFILES, get_negative_prompt_for_style
    from worker_mac.timeprofile import TimeProfile
except ImportError:
    from c2m_types import EventGraph, MoveNode, Anchor
    from grammar import event_graph_to_spec, STYLE_PROFILES, get_negative_prompt_for_style
    from timeprofile import TimeProfile


def test_event_graph_to_spec_bullet_with_pgn():
    pgn = """[Event "Bullet"]
[TimeControl "60+0"]
[Termination "Normal"]

1. e4 {%clk 0:00:59} 1... e5 {%clk 0:00:58}
2. Qh5 {%clk 0:00:58} 2... Nc6 {%clk 0:00:57}
3. Bc4 {%clk 0:00:57} 3... Nf6 {%clk 0:00:55}
4. Qxf7# {%clk 0:00:56} 1-0"""

    moves = [
        MoveNode(ply=1, san="e4", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="opening"),
        MoveNode(ply=2, san="e5", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="opening"),
        MoveNode(ply=3, san="Qh5", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="opening"),
        MoveNode(ply=4, san="Nc6", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="opening"),
        MoveNode(ply=5, san="Bc4", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="opening"),
        MoveNode(ply=6, san="Nf6", fen="", evalBefore=0.0, evalAfter=-5.0, evalSwing=-5.0, classification="blunder", phase="opening"),
        MoveNode(ply=7, san="Qxf7#", fen="", evalBefore=5.0, evalAfter=10.0, evalSwing=5.0, classification="brilliant", phase="opening", flags={"check": True}),
    ]

    graph = EventGraph(moves=moves, anchors=[], totalPlies=7, targetDurationSec=60)
    spec = event_graph_to_spec(graph, pgn_str=pgn)

    assert spec.durationSec == 60
    assert "no edm" not in spec.negativePrompt.lower()
    assert 124 <= spec.bpm <= 132
    assert "energetic synth bass" in spec.caption


def test_event_graph_to_spec_rapid_events():
    moves = [
        MoveNode(ply=12, san="Qxd8+", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="middlegame", flags={"queenExchange": True}),
        MoveNode(ply=30, san="e8=Q", fen="", evalBefore=2.0, evalAfter=8.0, evalSwing=6.0, classification="good", phase="endgame", flags={"promotion": True}),
    ]
    graph = EventGraph(moves=moves, anchors=[], totalPlies=30, targetDurationSec=120)
    setattr(graph, "timeCategory", "rapid")

    spec = event_graph_to_spec(graph)
    assert "no edm" in spec.negativePrompt.lower()
    assert "sudden texture reduction" in spec.caption
    assert "climax crescendo" in spec.caption
    assert len(spec.anchors) == 2


def test_event_graph_to_spec_bullet_promotions_and_exchanges():
    moves = [
        MoveNode(ply=10, san="Qxd8+", fen="", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0, classification="good", phase="middlegame", flags={"queenExchange": True}),
        MoveNode(ply=25, san="a8=Q", fen="", evalBefore=3.0, evalAfter=9.0, evalSwing=6.0, classification="good", phase="endgame", flags={"promotion": True}),
    ]
    graph = EventGraph(moves=moves, anchors=[], totalPlies=25, targetDurationSec=30)
    time_profile = TimeProfile(speed="bullet", pace_median_s=1.2)

    spec = event_graph_to_spec(graph, time_profile=time_profile)
    assert "no edm" not in spec.negativePrompt.lower()
    assert "filter sweep drop buildup" in spec.caption
    assert "euphoric main stage synth drop climax" in spec.caption
