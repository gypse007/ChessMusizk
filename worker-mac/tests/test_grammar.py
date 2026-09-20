import pytest
try:
    from worker_mac.c2m_types import EventGraph, MoveNode, Anchor, SoundtrackSpec
    from worker_mac.grammar import event_graph_to_spec, STYLE_PROFILES, get_negative_prompt_for_style
    from worker_mac.timeprofile import TimeProfile
except ImportError:
    from c2m_types import EventGraph, MoveNode, Anchor, SoundtrackSpec
    from grammar import event_graph_to_spec, STYLE_PROFILES, get_negative_prompt_for_style
    from timeprofile import TimeProfile


def test_event_graph_to_spec_bullet():
    moves = [
        MoveNode(
            ply=10,
            san="Qxd8+",
            fen="",
            evalBefore=0.0,
            evalAfter=0.0,
            evalSwing=0.0,
            classification="good",
            phase="opening",
            flags={"queenExchange": True},
        ),
        MoveNode(
            ply=20,
            san="e8=Q",
            fen="",
            evalBefore=0.0,
            evalAfter=0.0,
            evalSwing=0.0,
            classification="brilliant",
            phase="middlegame",
            flags={"promotion": True},
        ),
    ]
    graph = EventGraph(moves=moves, anchors=[], totalPlies=30, targetDurationSec=60)
    tp = TimeProfile(speed="bullet", pace_median_s=2.0)
    spec = event_graph_to_spec(graph, time_profile=tp)

    assert spec.durationSec == 60
    assert "filter sweep drop buildup" in spec.caption
    assert "euphoric main stage synth drop climax" in spec.caption
    assert "no edm" not in spec.negativePrompt.lower()


def test_event_graph_to_spec_rapid():
    moves = [
        MoveNode(
            ply=10,
            san="Qxd8+",
            fen="",
            evalBefore=0.0,
            evalAfter=0.0,
            evalSwing=0.0,
            classification="good",
            phase="opening",
            flags={"queenExchange": True},
        ),
    ]
    graph = EventGraph(moves=moves, anchors=[], totalPlies=30, targetDurationSec=120)
    tp = TimeProfile(speed="rapid", pace_median_s=15.0)
    spec = event_graph_to_spec(graph, time_profile=tp)

    assert "sudden texture reduction" in spec.caption
    assert "no edm" in spec.negativePrompt.lower()
