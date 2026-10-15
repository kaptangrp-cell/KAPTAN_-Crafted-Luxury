# Documents, expenses, reports and shop inbox

Implemented locally on 15 October 2026. No live deployment or real bookkeeping was performed. No paid extraction, banking or AI subscription was introduced. Existing hosting/storage plan quotas still apply.

## What can now be used after deployment

**Finance → Documents & expenses**
- Multiple file selection or drag/drop; PDF, PNG, JPEG and UTF-8 XML, max 3 MB per original. Size is intentionally bounded for Vercel request/response limits.
- The server checks membership before processing bytes. It determines MIME from content, hashes the exact original with SHA-256, reserves immutable metadata and uploads without overwrite to private `finance-originals` storage.
- All browser access to that bucket is blocked by a restrictive Storage policy, even if another permissive policy exists. Authenticated server functions mediate reads and writes. Reads verify the stored fingerprint and log access; no public or signed file links are generated.
- A repeated hash returns the existing record. Interrupted uploads can retry the same file; no deletion or overwrite endpoint is supplied. Files are not yet classified by statutory retention period, and there is no automatic deletion.
- Original preview/download, filename search, supplier/number search, review history and pagination. PDF uses a sandboxed iframe; XML is escaped text, never executed or trusted as instructions. XML preservation is **not** XRechnung validation or extraction; PDF preservation is **not** ZUGFeRD extraction. No malware-scanning certification is claimed.
- Staff can prepare an expense review against an original. Corrections to an unposted review create a linked immutable replacement. Owners/accountants review and post; the post control requires unchanged saved values and explicit confirmation. Auditors read only.

**Supported expense scope**: ordinary domestic EUR operating expenses, gross including non-deductible input VAT, with the owner-confirmed §19 setup. It does not yet handle inventory purchases, assets/depreciation, customs, reverse charge or recoverable VAT. Do not force these into the ordinary expense form.

Posting an expense creates `Dr EXPENSE / Cr AP`, once. Posting requires a preserved original and an open period. A second posted expense with the same document, or case-insensitive trimmed supplier name + invoice number, is rejected atomically. Different spellings of a supplier are not guaranteed duplicates; supplier master-data/identity matching remains outstanding.

Actual payments are recorded separately with payment evidence: `Dr AP / Cr BANK or CASH`. No transfer is initiated. Partial payments and retry-safe identifiers are supported; the database locks the expense and rejects overpayment. Reversed payment journals stop contributing to the paid amount. A reversed expense cannot receive new payments. Structured credit-note/corrected supplier-invoice workflows remain outstanding; current original/supplier-number uniqueness is deliberately not bypassed after reversal.

**Finance → Financial overview**
- Period revenue, expenses and result; end-date bank, inventory, AR/AP book balances; opening/closing account balances; internal financial position including cumulative result; recorded cash inflows/outflows.
- Every figure uses the same posted ledger. Drafts/future entries are excluded. Owner movements are not income/expenses. Bank-to-cash transfers are netted per journal so they do not inflate inflow/outflow.
- Cash and balance reconciliation differences, exact EUR-cent account CSV export with spreadsheet-formula escaping.
- These are provisional internal reports, not a statutory Bilanz, EÜR, bank reconciliation, tax estimate or complete cash-flow statement. Operating/investing/financing classification is not implemented. Missing opening balances and costs remain material limitations.

**Finance → Store accounting inbox**
- A transactional trigger collects newly issued invoice IDs exactly once. It does not capture carts or unpaid checkouts. The existing invoice worker must actually issue invoices; a missing worker means no issued-invoice events.
- Owner-only rescan collects existing issued invoices for review without posting them. Test and historical orders are never silently backfilled into the ledger.
- Owners/accountants can download an archived invoice, confirm it represents a real unposted customer payment, then import a supported advance.
- Import checks issued advance type, §19 mode, explicit EUR source snapshot, bound paid checkout, currently paid order and exact invoice/order total. It posts `Dr CLEARING / Cr ADVANCES` using the payment date. This is **not revenue**, bank settlement or an EÜR classification.
- A unique order key prevents a second import. Unsupported final invoices/credits remain visible for separate review. An exception persists the reason and attempt count without partially posting, so a corrected open-period/setup issue can be retried.
- Sales capture is automatic; ledger posting still requires review. Automatic supply/revenue recognition, refunds, processor fees, payouts, COGS and EÜR facts remain outstanding. Old legacy orders without verified checkout binding are deliberately not imported by this path.

## Deployment order

Apply the existing foundation first if not already applied, then these additive migrations:
1. `20261015100000_finance_foundation.sql`
2. `20261015110000_finance_documents_expenses.sql`
3. `20261015120000_finance_reports.sql`
4. `20261015130000_finance_sales_inbox.sql`

The last migration also depends on existing `orders`, `order_checkouts` and the invoice archive migration. Do not re-run migrations already recorded as applied. No historic rows are changed. The Storage bucket must not already exist under this reserved name; inspect any conflict instead of overwriting its settings. Use the standard authenticated Supabase deployment process after backup/restore verification. Deploy the matching Vercel app with the existing server-only Supabase service key.

Before production reliance, verify actual Supabase Storage permissions, upload/retry/download and authenticated browser role flows in staging; PGlite tests do not implement the Storage HTTP service. Real PostgreSQL concurrent-session acceptance, retention classification, backup restores and accountant review remain required. No deployment credential or signed-in staging session is available to this implementation.

## Tests and evidence

- `finance-expenses.test.mjs`: original byte/hash checks, 3 MB boundary, hostile entity/HTML rejection, restrictive bucket policy against a permissive policy, membership denial, immutable originals/reviews, duplicate rollback, partial/full payment, overpayment, retry conflict and reversal reconciliation.
- `finance-reports.test.mjs`: opening balances, period/future cutoffs, draft exclusion, owner contributions/drawings, bank/cash transfers, P&L/position/cash reconciliation, export formula escaping and anonymous denial.
- `finance-sales.test.mjs`: issued-only capture and duplicate trigger, payment binding, exact totals, retry-safe import, zero revenue for advances, refusal of unpaid/final invoices, persistent errors, closed-period retry and role denial.

Relevant references: [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control), and [BMF Kleinunternehmer application, 18 March 2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-03-18-sonderregelung-kleinunternehmer.pdf). No legal certification is asserted.
