# KAPTAN Finance — implementation status

## Current delivery (15 October 2026)

The foundation and subsequent increments are implemented locally; this is not yet the complete ERP requested in the brief. See [PHASE-2.md](PHASE-2.md) for documents, expenses, financial reports, sales inbox, deployment order and verification gaps. The architecture and posting contract are in [ARCHITECTURE.md](ARCHITECTURE.md).

Implemented locally:
- Integrated `/finance` workspace, linked from Admin, English/German, responsive layout.
- Separate owner/accountant/staff/auditor authorization and RLS. Existing store admins are finance owners. Membership does not grant shop or warehouse permissions.
- Internal, unmapped accounts; 2026 monthly periods; owner-confirmed EÜR setting.
- Exact integer-cent journals, source references, balanced draft submission, idempotent posting, immutable journal/line history, exact linked reversals.
- Period closing and owner-only reopening, both with reason; posting/closing serialize on the period row.
- Period trial-balance movements from posted journals only; latest 100 journal details and latest 50 audit events.
- Exact money parsing/display and deterministic cost-allocation primitive. Cost allocation is not yet connected to imports/inventory.

Added since the foundation: private document archive with original previews, versioned expense review and posting, evidence-linked partial payments, ledger financial overview and CSV export, and an automatic issued-invoice inbox with reviewed advance imports.

Banking increment: [BANKING.md](BANKING.md) documents Revolut/PayPal CSV presets, private originals, exact balance checks, reviewed matching and separate bank ledger accounts. This increment is local and not deployed.

Additional local delivery: [PHASE-3.md](PHASE-3.md) covers QR unit costing/import allocation, sales completion/refund payments, draft tax reviews, accountant exports and owner-controlled future-event automation. [COMPLETION-MATRIX.md](COMPLETION-MATRIX.md) tracks the original brief without implying the full ERP is complete.

Still outstanding: structured invoice extraction/validation, regular-VAT/partial-credit/provider lifecycle integration, supplier master data, advanced bank matching, cost corrections and non-QR valuation, complete statements, official EÜR schedules and special tax rules, tax submissions, validated export mappings and forecasting. Existing invoice worker deployment limitations remain. Nothing posts historical orders automatically.

## Deployment

1. Back up the target database and verify a restore in an isolated staging environment. Keep the existing shop migrations in their recorded order; do not reset production.
2. Apply the foundation and subsequent additive migrations in the order documented in [PHASE-2.md](PHASE-2.md), beginning with `supabase/migrations/20261015100000_finance_foundation.sql` through the normal authorized Supabase migration process. It is transactional and depends on existing Supabase Auth, authenticated/anon roles and `public.is_admin()`. It does not alter products, orders, payments or inventory. Re-running it manually is not supported: let migration history track application.
3. Deploy the matching application build to Vercel using existing environment variables. No new key, paid service or subscription is introduced. Never put a service-role key in a VITE/browser variable.
4. Sign in as an existing admin and open **Admin → Finance** (`/finance`). Without the migration the page reports that setup is required instead of showing fabricated figures.
5. In staging only, exercise each role: staff can save a balanced draft but cannot post; accountant can post and close but cannot reopen; auditor can read only; customers/anonymous users cannot read financial tables. Verify period closure, reversal, membership removal and logout/account switching in a browser.
6. Verify a real PostgreSQL concurrent posting/closing test before production reliance. Local PGlite integration tests validate transaction constraints/permissions, but do not establish live concurrent-session behavior or Supabase deployment configuration.

Migration and app are **not deployed by this implementation**. No real journal, role assignment, payment, order, email or tax filing has been created. Full authenticated browser acceptance remains pending a migrated staging environment/session.

## Using the foundation

- Owner: Access tab → enter an existing user's Supabase UUID → select Accountant, Finance staff or Auditor. Remove access using the same UUID. User search/invitation is future work; never share owner credentials.
- Journals: enter booking date, description and source reference, then debit/credit account lines. Amounts use either decimal comma or point, at most two decimals, without thousands separators. Save a draft; an owner/accountant reviews expanded line details before choosing Post journal.
- Use a new draft for corrections to a draft. Posted journals cannot be edited. Enter a correction reason and a date in an open period, then reverse the original; prepare the replacement separately. Repeated reversal returns the existing reversal.
- Periods: provide a reason before closing. Closing does not certify reconciliation or close an entire tax year; the comprehensive closing checklist is still pending. Only an owner can reopen.
- Trial balance: amounts are movements within the selected dates, not opening/closing balances or a statutory Bilanz. Drafts are excluded. Missing historical/opening records make derived figures incomplete.
- The audit screen is a recent-events view, not a full audit export. Supabase database owners remain privileged; these controls are not external WORM storage or certification.

## Compliance evidence and gaps

| Area | Current evidence | Outstanding gate |
|---|---|---|
| Balanced bookkeeping | SQL constraints, atomic RPC, exact cents; automated integration tests | Independent accounting review and live concurrency validation |
| Access isolation | RLS, no authenticated table mutations, role checks inside RPCs | Live Supabase role/browser verification, membership UI search |
| Historical integrity | Immutable posted entries, exact reversal link, append-only audit | Backup/restore evidence, external preservation and access logging |
| EÜR / §19 | Owner-confirmed architecture; existing exempt invoice implementation | Cash-tax facts, special rules, turnover thresholds and accountant review |
| Revenue / costs | Explicit posting contract; no fabricated automatic postings | Provider refunds/fees/settlements, recognition evidence, opening balances, cost layers |
| Documents / retention | Private archive, fingerprints, access log, immutable originals/reviews | Live Storage acceptance, structured validation, retention classes/holds |
| Reporting | Exact ledger overview, opening/closing balances, internal position, cash movements, CSV | Complete bank/inventory reconciliation, statutory statements, EÜR, advanced exports |
| E-invoice | Existing local UBL/KoSIT generator and archive | Receiving/parser, live worker and delivery verification |
| GoBD / GDPR | Role separation and traceability foundation | Procedures, access logs, restore tests, legal retention review; no certification claimed |

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and ESLint for changed TS files. `tests/finance.test.mjs` runs isolated PostgreSQL-compatible tests: exact cent arithmetic/allocation; balanced postings; idempotency conflicts; posted/line/audit immutability; role restrictions; customer/anonymous isolation; period closure/reopening; reversal/retry and zero-net trial reconciliation. These are foundation tests, not end-to-end provider, import, tax-year or production acceptance tests.

## Suppliers, incoming invoices and assets

See [Phase 4](PHASE-4.md) for supplier maintenance, retention review, structured invoice extraction, the local receiving-validation queue and the internal fixed-asset register. Apply migrations through `20261015220000_finance_assets.sql` with the matching application and worker deployment. The [completion matrix](COMPLETION-MATRIX.md) separates implemented scope from outstanding work.

Local verification for this increment: 64 tests passed; TypeScript, changed-file ESLint and the production build passed. No production migration or live worker acceptance was performed.
