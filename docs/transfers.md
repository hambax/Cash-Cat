# Inter-account transfers and card repayments

## Behaviour

- **Automatic pairing** runs after each successful **Akahu sync**. It looks for two transactions on **different** linked accounts with the **same absolute amount**, **opposite signs** (outflow on one account, inflow on the other), within a **five-day** date window.
- **Account type** on each linked account (`everyday`, `credit_card`, `savings`, etc.) is set on **Connect Akahu** (or inferred from Akahu names when you first load accounts). This steers classification:
  - **`card_repayment`**: one leg is a **credit card** account and the other is **everyday**, **savings**, **loan**, **other**, or **unknown**.
  - **`internal_transfer`**: otherwise (e.g. savings ↔ everyday).
- **Manual pairs** can be created via `POST /transfers` (debit id = negative amount row, credit id = positive amount row, same absolute value).

## Analytics

- Paired rows with `excluded = 1` are **left out of headline income and expense** on the dashboard and in monthly charts:
  - **Negative** legs are excluded from **expense** totals.
  - **Positive** legs are excluded from **income** totals.
- **Category spending** totals ignore **negative** legs that are part of a pair, so a bank payment to a card does not inflate category spend after the card purchases are already counted.

## Determinism

- Matches are **greedy**, **one-to-one**, ordered by **date** then **transaction id**. Same inputs and DB state yield the same pairs.

## Disclaimer

Linking rules are **informational** for budgeting. Bank and Akahu descriptions vary; this is **not** tax or accounting advice.
