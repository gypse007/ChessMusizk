import pytest
try:
    from worker_mac.timecontrol import parse_timecontrol, classify_speed
    from worker_mac.timeprofile import extract_time_profile, clk_seconds, emt_seconds
    from worker_mac.grammar import STYLE_PROFILES, get_negative_prompt_for_style
except ImportError:
    from timecontrol import parse_timecontrol, classify_speed
    from timeprofile import extract_time_profile, clk_seconds, emt_seconds
    from grammar import STYLE_PROFILES, get_negative_prompt_for_style


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
