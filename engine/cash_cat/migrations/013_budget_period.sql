-- Budget amount is "per period" (stored in monthly_cents). Period can be weekly, monthly, or custom length in days.

ALTER TABLE budgets ADD COLUMN budget_period TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE budgets ADD COLUMN custom_period_days INTEGER NULL;
