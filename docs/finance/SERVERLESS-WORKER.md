# Serverless invoice worker

## Current status (16 October 2026)

Implemented locally, **not deployed or scheduled**. The pinned Linux x64 package is 179 MiB. A bundled synthetic health check accepted a valid invoice and rejected an invalid tax total using the local macOS Java runtime. The Linux runtime has not yet been executed on Vercel. Existing invoice fixtures (advance, final, credit, public buyer and regular-VAT rounding) passed the local KoSIT validator.

The live Vercel dashboard identifies the team as Hobby. Vercel restricts Hobby to personal/non-commercial use (https://vercel.com/docs/plans/hobby). Kaptan requested no paid subscriptions, so no plan change or live worker activation was made. Commercial hosting eligibility must be resolved first. This also concerns hosting the commercial storefront, not just its worker.

## Implementation

- The normal Vercel build invokes the packager, which does nothing unless `KAPTAN_SERVERLESS_WORKER_BUILD=true`. Local packaging can be tested with `node scripts/invoices/build-serverless.mjs --prepare`.
- Official Temurin Java, KoSIT and XRechnung configuration downloads are pinned and checked by SHA-256. No validation service receives customer documents.
- A separate Node 24 function at `/api/invoice-worker` uses server-only credentials already needed by the worker. Browser bundles do not include these credentials.
- Only POST requests with a dedicated `INVOICE_WORKER_SECRET` (at least 32 characters; use cryptographically random bytes) are accepted. A missing or weak secret fails closed.
- `?mode=health` validates synthetic documents without accessing the database or sending email.
- `?mode=invoices` processes at most one invoice and three deliveries. `?mode=incoming` processes at most one incoming validation job. Both require `INVOICE_SERVERLESS_ENABLED=true`.
- Function duration is 60 seconds, child execution 50 seconds and each Java validation 18 seconds. Existing leases and provider idempotency handle interrupted jobs; ambiguous email retries still require review.
- Failure responses omit child output and customer data. An HTTP 200 means the pass finished, not that every invoice was issued; item failures remain in the admin queues.

## Activation gates

1. Resolve hosting eligibility without silently upgrading or purchasing a subscription.
2. Configure the dedicated worker secret and existing server-only Supabase/email variables, plus the confirmed Steuernummer. Do not put secrets in source, URLs or client variables.
3. Enable packaging, deploy, then run the authenticated health check against the Linux function. Confirm timing, function size and no unplanned charges.
4. Review existing queued invoices and email recipients before enabling real processing. Historical test orders must not generate customer invoices.
5. Enable processing only after acceptance. The prepared `deploy/invoices/supabase-scheduler.sql` installs two named minute schedules with processing disabled. It requires Supabase Cron, pg_net and Vault. Save the matching secret as `kaptan_invoice_worker_secret` in Vault, deploy the SQL, and explicitly enable its two rows after review. Only eligible queues trigger HTTP calls; repeat dispatches within 55 seconds are suppressed. No scheduler has been installed in production yet. The URL is fixed to the verified production domain; credentials are absent from cron commands.
6. Verify a complete issued invoice, preserved validation report and email receipt, plus incoming validation, retry behavior and queue monitoring. Hosting quotas still apply; serverless does not guarantee unlimited or interruption-free processing.

The existing Docker deployment remains available for a suitable self-hosted machine.

## Commands after the hosting upgrade

1. Set `KAPTAN_SERVERLESS_WORKER_BUILD=true` in Vercel and deploy this source. Keep `INVOICE_SERVERLESS_ENABLED=false`.
2. Configure `INVOICE_WORKER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL` and `INVOICE_STEUERNUMMER` as server-only production environment variables. A changed Vercel variable requires a redeployment. Use the existing verified email sender and confirmed tax number.
3. With the same private worker secret in the local ignored `.env`, run `npm run invoices:check-worker`. It submits only a synthetic health request to the fixed Kaptan URL and must succeed before processing is enabled.
4. Review the real invoice and delivery queues. Then set `INVOICE_SERVERLESS_ENABLED=true`, redeploy, install the prepared scheduler, and enable its configuration. Never treat historical test orders as real customer sales.
5. Verify queue results and actual mail delivery. The SQL file includes a query for the last HTTP status and a pause command. Turning off its enabled flags stops dispatch without deleting documents.

`npm run invoices:package` rebuilds the pinned Linux function locally for size inspection. It does not deploy, create a schedule, or send mail.

## Verification

All 68 tests passed, including new authentication/disabled-mode/batch-limit tests. Changed-file ESLint and the production application build passed. Packaging produced 179.0 MiB and the bundled synthetic validator health script passed with the local macOS Java runtime. This does not establish Linux/Vercel runtime compatibility or live invoice/email delivery.

The additional scheduler integration test passed: inactive and empty queues make no HTTP request, active leases are skipped, expired leases become eligible, repeat dispatches are throttled, missing secrets fail closed, normal users cannot invoke the dispatcher or read its configuration, and reinstalling does not duplicate named jobs. The full suite now contains 69 tests (68 previously passed plus this new test).

Owner direction: finish the build now and defer subscription purchase and production activation. No worker credentials, live schedules, plan changes or customer processing were enabled as part of this build.
