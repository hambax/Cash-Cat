"""
Built-in rule list — evaluated in order; first match wins.
User DB rules are appended after this list (see engine.py).
"""

from __future__ import annotations

from typing import Any

from cash_cat.categorisation import nz_lexicon as nz

# Each rule: category_key, kind, terms or pattern, optional amount_sign


def built_in_rules() -> list[dict[str, Any]]:
    """Ordered rules — most specific before generic."""
    rules: list[dict[str, Any]] = []

    def add(cat: str, terms: list[str], sign: str = "negative") -> None:
        rules.append(
            {
                "category_key": cat,
                "kind": "contains_any",
                "terms": terms,
                "amount_sign": sign,
            }
        )

    # Retirement & KiwiSaver — before generic investments where names overlap
    add("retirement_kiwisaver", nz.RETIREMENT_KIWISAVER)
    add("investments", nz.INVESTMENTS)

    # Positive flows
    add("interest_earned", nz.INTEREST_EARNED, sign="positive")
    add("income", nz.INCOME, sign="positive")
    add("transfer", nz.TRANSFERS, sign="positive")

    # Expenses (default sign negative)
    add("groceries", nz.GROCERIES)
    add("dining", nz.DINING)
    # After dining so "Uber Eats" matches dining before substring "uber" here.
    add("rideshare", nz.RIDESHARE)
    # VTNZ, mechanics, tyre shops — before transport (fuel / PT / tolls).
    add("vehicle_maintenance", nz.VEHICLE_MAINTENANCE)
    # Fuel + PT + taxis + NZ petrol stations (Z, BP, …) — former FUEL preset merged into transport.
    add("transport", nz.TRANSPORT)
    add("utilities_internet", nz.UTILITIES_NET)
    add("utilities_power", nz.UTILITIES_POWER)
    add("rent_mortgage", nz.RENT)
    add("health_insurance", nz.HEALTH_INSURANCE)
    add("insurance", nz.INSURANCE)
    add("healthcare", nz.HEALTHCARE)
    add("entertainment", nz.ENTERTAINMENT)
    add("subscriptions_software", nz.SUBSCRIPTIONS)
    add("education", nz.EDUCATION)
    add("children", nz.CHILDREN)
    add("pets", nz.PETS)
    add("gifts_donations", nz.GIFTS)
    add("travel", nz.TRAVEL)
    add("shopping", nz.SHOPPING)
    add("personal_care", nz.PERSONAL_CARE)
    add("fees_bank", nz.FEES_BANK)
    add("cash_withdrawal", nz.CASH)

    # Negative transfers (payments out that look like transfers)
    add("transfer", nz.TRANSFERS, sign="negative")

    return rules
