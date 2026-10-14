# KAPTAN Finance — foundation release

## Current delivery (15 October 2026)

This is the first incremental release, not the complete ERP requested in the brief. The architecture and posting contract are in [ARCHITECTURE.md](ARCHITECTURE.md).

Implemented locally:
- Integrated `/finance` workspace, linked from Admin, English/German, responsive layout.
- Separate owner/accountant/staff/auditor authorization and RLS. Existing store admins are finance owners. Membership does not grant shop or warehouse permissions.
- Internal, unmapped accounts; 2026 monthly periods; owner-confirmed EÜR setting.
- Exact integer-cent journals, source references, balanced draft submission, idempotent posting, immutable journal/line history, exact linked reversals.
- Period closing and owner-only reopening, both with reason; posting/closing serialize on the period row.
- Period trial-balance movements from posted journals only; latest 100 journal details and latest 50 audit events.
- Exact money parsing/display and deterministic cost-allocation primitive. Cost allocation is not yet connected to imports/inventory.

Not implemented in this release: private document upload/storage/extraction, automatic store accounting, supplier workflow, bank/import processing, historical stock valuation, complete financial statements, EÜR schedules/threshold engine, tax submissions, accountant exports, forecasting. Existing invoice generation/archive is separate and retains its previous deployment limitations. Nothing in this release posts historical orders automatically.

## Deployment

1. Back up the target database and verify a restore in an isolated staging environment. Keep the existing shop migrations in their recorded order; do not reset production.
2. Apply only the new `supabase/migrations/20261015100000_finance_foundation.sql` through the normal authorized Supabase migration process. It is transactional and depends on existing Supabase Auth, authenticated/anon roles and `public.is_admin()`. It does not alter products, orders, payments or inventory. Re-running it manually is not supported: let migration history track application.
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
| Documents / retention | Design documented | Private upload pipeline, validation, original preservation, retention classes/holds |
| Reporting | Posted period trial movements only | Reconciled GuV/Bilanz/cash flow/EÜR/exports |
| E-invoice | Existing local UBL/KoSIT generator and archive | Receiving/parser, live worker and delivery verification |
| GoBD / GDPR | Role separation and traceability foundation | Procedures, access logs, restore tests, legal retention review; no certification claimed |

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and ESLint for changed TS files. `tests/finance.test.mjs` runs isolated PostgreSQL-compatible tests: exact cent arithmetic/allocation; balanced postings; idempotency conflicts; posted/line/audit immutability; role restrictions; customer/anonymous isolation; period closure/reopening; reversal/retry and zero-net trial reconciliation. These are foundation tests, not end-to-end provider, import, tax-year or production acceptance tests.
