# Original ERP brief — completion matrix

Status as of 15 October 2026. “Local” means code and automated tests where documented; it does not mean production deployment, legal certification or browser acceptance.

| Area | Local implementation | Outstanding |
|---|---|---|
| Accounting | Balanced immutable journals, source links, idempotency, reversals, monthly period locks, roles/RLS/audit | Configurable fiscal years, verified SKR mappings, tax codes/cost centers/subledgers, richer correction workflows |
| Documents | Private originals, fingerprints, previews, versioned expense review, duplicates, partial payments | Structured UBL/CII extraction and receiving validation, ZUGFeRD extraction, OCR, supplier recognition/master records, retention classes/holds |
| Store integration | Issued-invoice event capture, reviewed/optional automatic supported §19 advances/finals/full credits, exception queue, evidence-linked refunds | Regular VAT integration, partial credits, automatically verified provider refunds/fees/settlements, full event reconciliation |
| Banking | Revolut/PayPal CSV mapping, originals, balances, deterministic matches, multi-account transfers | Real export acceptance, split/aggregate matching, CAMT/MT940, optional authorized bank connectors |
| Imports & stock | Exact serial costs, foreign purchase values/rates, allocation, QR cost movements, reconciliation, evidence-linked payments | Cost corrections, non-QR valuation, recoverable VAT, FX settlement differences, purchase orders, supplier balances, historical reconstruction |
| Statements | Posted-ledger overview, profit/internal position/cash totals, account balances | Full statutory-style presentation, operating/investing/financing cash classification, detailed drill-down and comparison analytics |
| Tax | Review-based cash allocation, draft category totals, §19 warnings, source/version/period controls | Official EÜR form mapping, fixed assets/AfA, tax adjustments, regular VAT/RC/EU/OSS rules, tax-year closure, applicability/estimates |
| Returns/submission | Draft accountant data only | No ELSTER submission without a supported authorized integration; no submission claims |
| Analytics | Existing store analytics and ledger overview | Historical product/category profitability, budgets, forecasts/runway/break-even, contribution margin, authorized-data assistant |
| Exports | CSV/Excel/JSON journals and trial balance, browser print, individual originals | Rendered PDF package, structured archive package, validated DATEV mapping/import |
| Operations | Deployment documentation and local test suites | Production migrations/app deployment, live worker, browser/Storage/concurrency acceptance, restore/retention procedures |

No existing accountant mapping was supplied, and the owner agreed to a clearly labelled internal chart. That remains the correct label until an accountant supplies and validates a mapping. Optional paid services are not required by the implementation.
