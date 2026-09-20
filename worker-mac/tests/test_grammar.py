import pytest
from worker_mac.c2m_types import EventGraph, MoveNode, Anchor
from worker_mac.grammar import (
    event_graph_to_spec,
    get_negative_prompt_for_style,
    cap_anchors,
    STYLE_PROFILES,
)


def test_speed_tier_negative_prompts():
    for speed in ["ultrabullet", "bullet", "blitz", "rapid", "classical", "daily", "unknown"]:
        neg = get_negative_prompt_for_style(speed)
        if speed in ("ultrabullet", "bullet"):
            assert "no EDM" not in neg, f"{speed} negative prompt should not contain 'no EDM'"
        else:
            assert "no EDM" in neg, f"{speed} negative prompt should contain 'no EDM'"


def test_empty_game_raises_value_error():
    empty_graph = EventGraph(
        moves=[],
        anchors=[],
        totalPlies=0,
        targetDurationSec=60,
    )
    with pytest.raises(ValueError, match="empty game"):
        event_graph_to_spec(empty_graph)


def test_seed_derivation():
    pgn1 = "1. e4 e5 2. Nf3 Nc6"
    pgn2 = "1. d4 d5 2. c4 e6"

    node = MoveNode(
        ply=1, san="e4", fen="fen1", evalBefore=0.0, evalAfter=0.2, evalSwing=0.2,
        classification="good", phase="opening", flags={"check": False}
    )
    graph = EventGraph(moves=[node], anchors=[], totalPlies=1, targetDurationSec=60)

    spec1 = event_graph_to_spec(graph, pgn_str=pgn1)
    spec2 = event_graph_to_spec(graph, pgn_str=pgn1)
    spec3 = event_graph_to_spec(graph, pgn_str=pgn2)

    assert spec1.seed != -1
    assert spec1.seed == spec2.seed, "Same PGN should produce same seed"
    assert spec1.seed != spec3.seed, "Different PGNs should produce different seeds"

    spec_no_pgn = event_graph_to_spec(graph, pgn_str=None)
    assert spec_no_pgn.seed == -1


def test_caption_bloat_aggregation():
    # 10 check moves
    moves = []
    for i in range(1, 11):
        moves.append(MoveNode(
            ply=i, san=f"R{i}+", fen="fen", evalBefore=0.0, evalAfter=0.0, evalSwing=0.0,
            classification="good", phase="middlegame", flags={"check": True}
        ))
    graph = EventGraph(moves=moves, anchors=[], totalPlies=10, targetDurationSec=60)
    spec = event_graph_to_spec(graph)

    assert "rhythmic accent check, rhythmic accent check, rhythmic accent check" not in spec.caption
    assert "frequent check accents" in spec.caption or "(x" in spec.caption


def test_blunder_reversal_anchor():
    moves = [
        MoveNode(
            ply=1, san="Qxh7+", fen="fen", evalBefore=3.5, evalAfter=-4.0, evalSwing=-7.5,
            classification="blunder", phase="middlegame", flags={}
        )
    ]
    graph = EventGraph(moves=moves, anchors=[], totalPlies=1, targetDurationSec=60)
    spec = event_graph_to_spec(graph)

    reversal_anchors = [a for a in spec.anchors if a.kind == "reversal"]
    assert len(reversal_anchors) == 1
    assert reversal_anchors[0].intent == "interrupt"


def test_termination_cadence_mapping():
    moves = [MoveNode(ply=1, san="e4", fen="fen", evalBefore=0, evalAfter=0, evalSwing=0, classification="good", phase="opening")]

    g_mate = EventGraph(moves=moves, anchors=[], totalPlies=1, targetDurationSec=60, termination="checkmate")
    spec_mate = event_graph_to_spec(g_mate)
    assert any(a.kind == "checkmate" and a.intent == "final_cadence" for a in spec_mate.anchors)

    g_resign = EventGraph(moves=moves, anchors=[], totalPlies=1, targetDurationSec=60, termination="resignation")
    spec_resign = event_graph_to_spec(g_resign)
    assert any(a.kind == "hard_cut" and a.intent == "final_cadence" for a in spec_resign.anchors)

    g_timeout = EventGraph(moves=moves, anchors=[], totalPlies=1, targetDurationSec=60, termination="timeout")
    spec_timeout = event_graph_to_spec(g_timeout)
    assert any(a.kind == "flag_fall" and a.intent == "final_cadence" for a in spec_timeout.anchors)

    g_draw = EventGraph(moves=moves, anchors=[], totalPlies=1, targetDurationSec=60, termination="draw")
    spec_draw = event_graph_to_spec(g_draw)
    assert any(a.kind == "unresolved_fade" and a.intent == "final_cadence" for a in spec_draw.anchors)


def test_anchor_capping():
    # Create 20 check anchors for a 60s game (limit = 10)
    anchors = [Anchor(ply=i, kind="check", intent="accent") for i in range(1, 21)]
    anchors.append(Anchor(ply=21, kind="checkmate", intent="final_cadence"))

    capped = cap_anchors(anchors, duration_sec=60)
    assert len(capped) == 10
    # Final cadence has priority 0 so it must be preserved
    assert any(a.kind == "checkmate" for a in capped)
