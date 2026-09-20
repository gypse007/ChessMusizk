import json
from worker_mac.c2m_types import EventGraph, MoveNode, Anchor, SoundtrackSpec


def test_event_graph_serialization_contract():
    move = MoveNode(
        ply=1,
        san="e4",
        fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        evalBefore=0.2,
        evalAfter=0.3,
        evalSwing=0.1,
        classification="good",
        phase="opening",
        flags={"check": False, "capture": False},
    )
    anchor = Anchor(ply=1, kind="check", intent="accent")
    graph = EventGraph(
        moves=[move],
        anchors=[anchor],
        totalPlies=1,
        targetDurationSec=60,
        termination="resignation",
        speedTier="blitz",
    )

    d = graph.to_dict()
    json_str = json.dumps(d)
    parsed = json.loads(json_str)

    assert parsed["moves"][0]["ply"] == 1
    assert parsed["moves"][0]["san"] == "e4"
    assert parsed["moves"][0]["classification"] == "good"
    assert parsed["anchors"][0]["kind"] == "check"
    assert parsed["termination"] == "resignation"
    assert parsed["speedTier"] == "blitz"


def test_soundtrack_spec_serialization_contract():
    anchor = Anchor(ply=48, kind="reversal", intent="interrupt")
    spec = SoundtrackSpec(
        caption="hybrid electronic orchestral, rising tension",
        bpm=110,
        durationSec=60,
        seed=123456,
        instrumental=True,
        batchSize=2,
        negativePrompt="no vocals, no lyrics",
        anchors=[anchor],
    )

    d = spec.to_dict()
    json_str = json.dumps(d)
    parsed = json.loads(json_str)

    assert parsed["bpm"] == 110
    assert parsed["seed"] == 123456
    assert parsed["instrumental"] is True
    assert parsed["batchSize"] == 2
    assert parsed["anchors"][0]["kind"] == "reversal"
