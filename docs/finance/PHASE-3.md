# Finance increment: inventory, sales lifecycle, tax review and exports

Implemented locally on 15 October 2026. This increment does not complete the full original ERP specification or establish legal certification. Production deployment and authenticated browser/Storage acceptance are not performed here.

## Inventory & import costs

Open **Finance → Inventory & costs**. Upload original supplier/customs/logistics documents in Documents first. Select received QR units that have no prior outbound history. Enter original unit purchase prices, currency (EUR/PKR/USD/GBP), rational conversion rate, rate date/source and EUR cost components. One customs original can support both customs duty and non-recoverable import VAT.

Allocation uses integer-cent largest remainders, ordered by unit ID; quantity, purchase value, weight and manual relative weights are supported. Purchase cost converts the foreign total once with half-up rounding; the declared EUR purchase component must reconcile. Freight, insurance, duty, import VAT, clearance and other costs retain separate components. The current workflow is for §19 non-recoverable tax. It does not determine tax eligibility or permit input VAT recovery.

Review the allocation before posting **Dr STOCK / Cr AP**. Costing never changes warehouse quantities or marks expected units received. Each serial unit receives an immutable cost. Original documents cannot also be posted through the ordinary expense workflow. Actual payments are separate, evidence-linked, partial, retry-safe postings **Dr AP / Cr selected bank/cash**; overpayment is rejected. Components sharing a document are grouped for payment.

Future QR changes create an ordered finance queue. Dispatch/sale consumes an assigned unit cost only once. Quarantine does not itself restore cost; a successful inspection returning the unit to available stock restores original cost. Damage still in stock posts to WRITE_OFF. All movements use the original serial cost, not current product cost. Missing costs and closed periods remain visible as failures, without altering warehouse actions. Cost movement dates cannot precede cost recognition.

The panel reconciles unit values to the STOCK ledger and shows missing costs and pending events. Specific-identification management valuation is separate from EÜR payment treatment. Existing outbound stock requires historical reconstruction; it is not silently assigned today's cost. Standalone reversal of cost-linked journals is blocked because it would orphan the cost ledger. A coordinated cost-correction workflow, non-QR valuation, purchase orders, supplier master records, recoverable import VAT and FX settlement differences remain outstanding. Do not use an ordinary expense to bypass a correction.

## Sales completion and refunds

Open **Finance → Store accounting inbox**. Issued §19 EUR finals must reference a posted advance for the same order, reconcile exactly and preserve the original line allocation. Posting recognizes goods and shipping revenue on the recorded supply date, with no second receipt. A full issued credit must reference its posted original. It removes advances or reverses goods/shipping revenue and creates REFUNDS_DUE; it does not send money.

Record actual partial/full refunds only with a ready original, unique payment reference, payment date, amount and cash/bank/provider-clearing account. The database rejects over-refunds and conflicting retries. A standalone sales-source reversal is blocked; linked invoice correction preserves the lifecycle. Regular-VAT sales, partial credit-note generation, provider-verified automatic refunds/fees and richer invoice adjustments are not implemented by this increment.

## Owner-controlled automation

Open **Finance → Automation**. Default is off. Only an owner can authorize future supported invoice and/or QR cost postings. There is no historical backfill. The approval actor and policy changes are audited. When triggered, handlers run with the stored approval identity and restore the original caller identity before returning; the caller cannot provide an actor. The owner must still hold the admin role. Unsupported, missing-cost or closed-period events remain in their queue with an error. Actual refunds and tax classifications still require evidence and review.

The source trigger is transactional. Local tests cover identity restoration and failure isolation; live concurrency and production configuration need staging verification. No scheduled paid service or new subscription is used.

## Tax review workspace

Open **Finance → Tax review**. The EÜR draft is a **review workpaper**, not an Anlage EÜR form, final taxable profit or submitted return. Classify posted bank/cash/provider-clearing movements with signed allocations, actual evidence, tax date and review reason. Allocations must reconcile to the journal's net movement. Use split lines for gross receipt/fee combinations; transfers and owner funds must not inflate income. Asset purchases are held outside the draft result pending separate depreciation review. Book reversals are not proof of money moving: review the original and correction together.

Corrections append a new review version; old reviews remain immutable. Dates may differ by up to ten days only as a technical review window, **not an automatic application of the recurring-payment exception**. A legal basis must be checked separately. Affected ledger/tax periods are locked against concurrent closure; closed periods reject changes.

The turnover monitor uses only the explicit reviewed §19 receipt portions. The first business year is owner-confirmed 2026. It uses a EUR 25,000 first-year threshold and later-year EUR 25,000 prior-year / EUR 100,000 current-year thresholds, checked against official sources on 15 October 2026. Positive receipts trigger conservative warnings even if later refunds reduce net receipts. Missing activity, excluded turnover, timing and other businesses still need review. It never confirms eligibility or changes shop tax settings automatically. Revalidate rules for subsequent years.

Sources: [§19 UStG](https://www.gesetze-im-internet.de/ustg_1980/__19.html), [Hessen official Kleinunternehmer guidance](https://finanzamt.hessen.de/steuern/umsatzsteuer-kleinunternehmer), [§4 EStG](https://www.gesetze-im-internet.de/estg/__4.html).

Fixed assets/AfA, ten-day timing tests, private-use adjustments, regular VAT/reverse charge/EU/OSS/import tax returns, trade/income tax estimates, tax-year approval/locking beyond existing ledger periods and official form mappings remain outstanding. ELSTER submission is intentionally not implemented without an authorized supported integration, as required by the original brief.

## Accountant exports

Open **Finance → Financial overview**. Journal CSV, Excel and JSON exports include exact integer cents, draft/posted status, source references and reversal links. Reports use posted entries only. Exports are limited to 20,000 journal lines per request and reject larger periods rather than silently truncate. CSV text is protected against formula interpretation; Excel amounts are strings to preserve exactness. Excel includes instructions, journals and trial balance. JSON includes the report snapshot and generation time. Export access is audited.

Print / Save as PDF uses the browser's print dialog with a white print layout and period label. This is not an independently rendered standalone PDF export. Original documents remain individually downloadable from the private archive. No DATEV compatibility, verified SKR mapping or complete archival package is claimed.

## Additive deployment order

After existing finance migrations through `20261015140000_finance_banking.sql`, apply in order:

1. `20261015150000_finance_costing.sql`
2. `20261015160000_finance_sales_completion.sql`
3. `20261015170000_finance_tax_review.sql`
4. `20261015180000_finance_exports.sql`
5. `20261015190000_finance_automation.sql`

Existing QR warehouse and invoice archive migrations are required. Use tracked migrations in a backed-up staging database first; do not reset production or re-run already applied migrations. Deploy the matching app. Automation stays off until the owner explicitly enables it. No production records or real transfers were changed in this implementation.

## Test evidence and remaining acceptance

- Cost tests: FX rounding, deterministic allocation, original-cost stock/sale/inspection return/damage reconciliation, document double-post prevention, payment limits, immutable history and role denial.
- Sales completion: advance → supply → full credit → partial refund, exact revenue/cash conservation, duplicate prevention, over-refund rejection and linked correction protection.
- Tax review: signed cash reconciliation, turnover validation, append-only correction, role and closed-period protections, owner-fund exclusion.
- Exports: exact large cents, draft separation, source traceability, formula protection and anonymous denial.
- Automation: owner authorization, future verified receipts, unsupported/missing-cost failure isolation and restoring the scanner/provider caller identity.

Still required: real export files, real PostgreSQL concurrent-session tests, authenticated responsive browser and print acceptance, actual Supabase Storage permissions, backups/restore evidence, worker deployment and independent accounting/legal validation. Broader original scope remains listed in COMPLETION-MATRIX.md.
