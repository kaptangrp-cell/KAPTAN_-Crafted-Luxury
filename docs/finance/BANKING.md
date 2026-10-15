# Revolut and PayPal CSV imports

Implemented locally, not deployed. Open **Admin → Finance → Bank & PayPal** after applying `20261015140000_finance_banking.sql` after the four finance migrations listed in PHASE-2.md and deploying the matching app.

## Workflow

1. Owner creates separate **Revolut EUR** and **PayPal EUR** accounts. Each has its own ledger account. The original BANK account remains available for existing entries.
2. Staff, accountants and owners can upload an original UTF-8 CSV (up to 3 MB / 1,000 transactions). Select its delimiter, inspect the raw preview, apply a Revolut or PayPal preset, and review column/date/decimal mappings. Unknown layouts can use explicit custom mapping.
3. Enter the actual statement start/end dates and opening/closing EUR balances, using the selected decimal format. Confirm these against the original. The server re-reads the preserved original, verifies its fingerprint and parses every row; browser-supplied transaction arrays are never accepted.
4. Import checks opening + movements = closing. It creates immutable bank evidence, **no journals**. Identical retries reuse the import. Conflicting retries, overlapping statement dates or duplicate transaction IDs on the same account reject the entire import. Use consecutive, non-overlapping statement periods. There is no silent transaction deletion/filtering.
5. Owners/accountants review suggestions (same account and signed net amount, within three days), or enter an existing posted journal ID. Matching checks exact account movement and does not post again. One journal can match both account legs of an inter-account transfer, but only once per account.
6. Separate reviewed posting actions cover owner contributions/drawings, a processor settlement against CLEARING, or a standalone bank fee. Other transactions use reviewed journals or supplier payments, then matching. A matched journal must have every active bank match explicitly released with a reason before reversal. Match history remains intact.
7. Compare statement and ledger opening/closing balances and matched counts. Review continuity with the previous statement. Matching all rows alone is not proof of complete bookkeeping. First-statement opening balances require separate evidence and review.

## Provider details and limits

- PayPal: use **Activity Download** CSV, with Gross, signed Fee and Net. The preset requires `Gross + Fee = Net` and uses **Net** as the balance movement. Gross/fee values remain visible beside each imported line; they do not automatically create a second fee posting. English and common German headers are supported; alternate export layouts need explicit mapping. Monthly multi-section reports are not supported.
- A net PayPal receipt with a withheld fee needs a reviewed compound journal (for example net PayPal debit + fee debit against the already-recorded gross clearing amount), with the original as evidence. Choose accounts according to what is already recorded; do not recognize a sale twice. A transfer from PayPal to Revolut uses both accounts and is not revenue.
- Revolut: preset uses Completed Date, Amount, Description, Fee, Currency, State and Type. Nonzero fee rows require custom mapping and verification of the actual net balance movement because export layouts/fee semantics can vary. Fees are never silently added or deducted.
- Provider presets require completed status and EUR. Pending transactions, zero movements, PayPal memo rows and recognized currency-conversion types stop import for review. No FX accounting, automatic bank connection, provider API access or paid service is introduced. Custom mapping remains an explicit manual review path, not a certification of an unfamiliar layout.
- Only UTF-8 text; no spreadsheet formulas/macros execute. Data appears as escaped text, originals remain in the private archive, server-only Storage access is unchanged. CSV downloads are evidence originals: spreadsheet applications may interpret their contents; prefer the in-app text preview.
- UI shows latest 60 statements per account and 30 transaction lines per page. Underlying originals and statements are retained. No split/aggregate bank matching, automated fuzzy matching, empty-statement import, EÜR classification or statutory submission is implemented.
- Supplier payment forms now support all created bank accounts. Financial reports aggregate all bank/cash accounts and net transfers per journal. PayPal is included as a liquid account for these **internal** reports, not asserted to be a bank for statutory classification.

## Verification

`tests/finance-banking.test.mjs` covers exact decimal parsing, quoted CSV/newlines, English/German PayPal, Revolut, signed fee/net consistency, pending/FX/non-EUR rejection, immutable import records, balance/duplicate/overlap rollback, idempotency, role isolation, matching both legs of a transfer, reversal protection, supplier payments from added accounts and multi-account cash reconciliation.

Before production use: apply migrations in staging, verify actual Supabase Storage upload/retry/read permissions, exercise authenticated browser flows and concurrent PostgreSQL sessions, and compare a redacted real export from each provider. No real export was supplied for acceptance testing. Existing backups, retention procedures and accountant review remain outside these local tests. No real bank transaction, journal or deployment was made by this implementation.

Provider references: [PayPal Activity Download](https://developer.paypal.com/reports/activity-download/), [PayPal monthly/custom statements](https://developer.paypal.com/reports/monthly-custom-statements/), [Revolut statements](https://help.revolut.com/en-US/help/managing-my-business/viewing-my-account-statements/how-can-i-download-a-statement-of-balances/business/).
