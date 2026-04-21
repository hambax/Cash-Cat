# Categorisation (Cash Cat engine)

## Behaviour

- **Deterministic:** For a given engine version, the same transaction text and amount maps to the same category. Rules are evaluated in a **fixed order**; the **first match** wins.
- **Layers:** Built-in keyword rules (see `engine/cash_cat/categorisation/builtins.py` and `nz_lexicon.py`) run first. Rows in the `rules` table (JSON in `pattern`) run **after** built-ins so you can add stricter matches later via the API or SQL.
- **Overrides:** If `category_assignments.is_override = 1` for a transaction, automatic categorisation **never** changes that row.
- **Re-apply:** `POST /categorisation/reapply` with `{"mode":"reapply"}` deletes all **non-override** assignments and classifies again. Use this after changing rules or display names (keys unchanged).

## NZ-specific coverage

- **Investments:** Platforms and brokers (e.g. Sharesies, Hatch, Kernel, InvestNow) and generic securities wording where safe.
- **KiwiSaver & super:** Provider names, IRD-related wording, salary sacrifice, and “KiwiSaver” phrases. Evaluated **before** generic investment rules to reduce overlap.

Lists are maintained in `nz_lexicon.py`; keep terms **alphabetically sorted** within each list where practical for reviewability.

## Disclaimer

Categories are **informational** for budgeting and trends. They are **not** tax, legal, or financial advice. Accuracy depends on how your bank labels transactions.
