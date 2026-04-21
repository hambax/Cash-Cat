"""Determinism tests for categorisation."""

from __future__ import annotations

from cash_cat.categorisation.builtins import built_in_rules
from cash_cat.categorisation.engine import classify_transaction
from cash_cat.categorisation.matchers import match_rule


def test_builtins_order_stable():
    rules = built_in_rules()
    keys = [r["category_key"] for r in rules]
    assert keys == [r["category_key"] for r in built_in_rules()]


def test_sharesies_investment_negative():
    rules = built_in_rules()
    key = classify_transaction(
        -5000,
        "Sharesies payment",
        None,
        None,
        rules,
    )
    assert key == "investments"


def test_milford_kiwisaver():
    rules = built_in_rules()
    key = classify_transaction(
        -12000,
        "Milford KiwiSaver contribution",
        None,
        None,
        rules,
    )
    assert key == "retirement_kiwisaver"


def test_countdown_groceries():
    rules = built_in_rules()
    key = classify_transaction(
        -8900,
        "Countdown online",
        None,
        None,
        rules,
    )
    assert key == "groceries"


def test_butcher_groceries_bakery_dining():
    rules = built_in_rules()
    assert classify_transaction(-4500, "Local Butcher Ltd Ponsonby", None, None, rules) == "groceries"
    assert classify_transaction(-890, "Village Bakery coffee", None, None, rules) == "dining"


def test_vtnz_vehicle_maintenance():
    rules = built_in_rules()
    assert classify_transaction(-8900, "VTNZ Auckland WOF", None, None, rules) == "vehicle_maintenance"


def test_bridgestone_tyre_vehicle_maintenance():
    rules = built_in_rules()
    assert (
        classify_transaction(-12000, "Bridgestone Tyre Centre Christchurch", None, None, rules)
        == "vehicle_maintenance"
    )


def test_z_energy_transport():
    rules = built_in_rules()
    assert (
        classify_transaction(-6500, "Visa purchase z energy limited auckland", None, None, rules)
        == "transport"
    )


def test_z_prefix_station_transport():
    rules = built_in_rules()
    assert classify_transaction(-8000, "purchase z te rapa", None, None, rules) == "transport"


def test_uber_eats_stays_dining():
    rules = built_in_rules()
    assert classify_transaction(-4500, "Uber Eats", None, None, rules) == "dining"


def test_uber_trip_rideshare():
    rules = built_in_rules()
    assert classify_transaction(-2300, "Uber trip help uber com", None, None, rules) == "rideshare"


def test_at_public_transport_auckland():
    """Auckland Transport — card text may truncate 'Transport' to 'Transpo'."""
    rules = built_in_rules()
    assert classify_transaction(-500, "AT Public Transpo", None, None, rules) == "transport"
    assert classify_transaction(-500, "AT Public Transport", None, None, rules) == "transport"


def test_nz_transport_agency_toll_transport():
    rules = built_in_rules()
    assert (
        classify_transaction(
            -350,
            "NZ TRANSPORTAGENCY-TOLL PALM NTH CARD 6245",
            None,
            None,
            rules,
        )
        == "transport"
    )


def test_tuck_shop_dining():
    rules = built_in_rules()
    assert classify_transaction(-1200, "Tuck Shop 524651 4702 93324", None, None, rules) == "dining"


def test_interest_earned_bonus_and_credit():
    rules = built_in_rules()
    assert classify_transaction(42, "Bonus interest", None, None, rules) == "interest_earned"
    assert classify_transaction(120, "Credit interest savings account", None, None, rules) == "interest_earned"


def test_parkable_transport():
    """Parkable — NZ parking payments; grouped under transport (incl. parking-style merchants)."""
    rules = built_in_rules()
    assert classify_transaction(-1200, "Parkable Wellington CBD", None, None, rules) == "transport"


def test_one_new_zealand_utilities_internet():
    """Full legal name on statements; 'one nz' alone does not match 'one new zealand'."""
    rules = built_in_rules()
    assert (
        classify_transaction(
            -7990,
            "Direct debit One New Zealand Limited broadband",
            None,
            None,
            rules,
        )
        == "utilities_internet"
    )


def test_southern_cross_health_insurance():
    """Bank text may truncate 'Health' (e.g. 'Southern Cross Healt …'); 'southern cross' still matches."""
    rules = built_in_rules()
    assert (
        classify_transaction(
            -15000,
            "Southern Cross Healt 40991865 23384932",
            None,
            None,
            rules,
        )
        == "health_insurance"
    )


def test_aia_insurance():
    rules = built_in_rules()
    assert classify_transaction(-20000, "AIA premium direct debit", None, None, rules) == "insurance"


def test_unknown_other():
    rules = built_in_rules()
    key = classify_transaction(
        -100,
        "xyzunknownmerchant 12345",
        None,
        None,
        rules,
    )
    assert key is None


def test_first_match_wins_order():
    """If two rules could match, earlier rule in list wins."""
    rules = [
        {"category_key": "a", "kind": "contains_any", "terms": ["foo"], "amount_sign": "any"},
        {"category_key": "b", "kind": "contains_any", "terms": ["foo", "bar"], "amount_sign": "any"},
    ]
    key = classify_transaction(-100, "foo bar baz", None, None, rules)
    assert key == "a"


def test_match_rule_amount_sign():
    haystack = "salary deposit"
    assert match_rule(
        haystack,
        {"kind": "contains_any", "terms": ["salary"], "amount_sign": "positive"},
        amount_cents=5000,
    )
    assert not match_rule(
        haystack,
        {"kind": "contains_any", "terms": ["salary"], "amount_sign": "negative"},
        amount_cents=5000,
    )
