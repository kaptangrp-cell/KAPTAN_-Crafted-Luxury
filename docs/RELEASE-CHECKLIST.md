# Checkout and storefront changes — 7 October 2026

## Vercel security-block correction

The failed deployment of commit `e41479f` stopped during dependency installation: Vercel rejected `@tanstack/start-server-core@1.169.14` for CVE-2026-102989. This was unrelated to the Recharts deprecation warning. The earlier local build did not detect Vercel's security block.

The framework is now pinned to `@tanstack/react-start@1.168.60`, with `@tanstack/start-server-core@1.169.39` resolved in `package-lock.json`, matching the patched releases in [TanStack's advisory](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8). A dependency regression test checks every locked copy of both packages. Vercel now uses `npm ci` to install the verified lockfile. A fresh installation in an empty temporary directory succeeded. The router error handler uses the updated framework type; generated database types received formatting-only changes required by lint.

Validation after the correction: clean `npm ci` passed; `npm run check` passed TypeScript, lint (zero errors, six React Refresh warnings), all five regression tests, and the production build. One low-severity dependency advisory remains unrelated to this deployment block.

Commit and push these corrections, then redeploy that new commit. Do not redeploy the old commit or enable `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS`. No Vercel deployment was triggered by this local fix. The checkout migration and configuration prerequisites below still apply.

These changes are implemented locally. They have not been deployed and the connected production database has not been migrated. Do not deploy application code alone: the new server checkout requires the accompanying migration.

## Rollout order

1. Back up the target database and apply `supabase/migrations/20261006090000_checkout_integrity.sql` to a staging database first. It adds `product_images.media_type`, extends supported order statuses, introduces a private `order_checkouts` table, and installs two service-role-only transaction functions. Existing orders are not rewritten. Direct authenticated inserts into orders are revoked; the storefront now creates orders through the validated server function.
2. Set server configuration using `.env.example`. Required: Supabase URL, publishable and service-role keys, a canonical HTTPS `PUBLIC_SITE_URL`, and configured payment-provider credentials. Card payments also require the Stripe webhook secret. Use test/sandbox credentials in staging; never put service-role keys or payment secrets in VITE variables.
3. Deploy the matching application version. Configure Stripe to POST to `/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and `payment_intent.succeeded`. The handler verifies signatures, amounts, currencies, references and provider IDs, and returns 500 when durable settlement fails so delivery can be retried.
4. Schedule an hourly POST to `/internal/reconcile-checkouts`, with `Authorization: Bearer <CHECKOUT_CRON_SECRET>`. This is a server scheduler, not a browser action. It checks up to 100 reservations older than 12 hours per run. Alert on non-2xx responses and `needsAttention`. Do not place the secret in a URL or source file. No hosted scheduler was configured by this local change.
5. Test the release scenarios below with sandbox accounts before switching production traffic. Keep the previous app artifact and database backup available. Do not blindly drop the new table or restore the old unauthenticated checkout code after accepting new orders; first reconcile pending payments/reservations.

## Behavior changes

- A random HttpOnly, SameSite=Lax browser cookie scopes guest checkout access. Signed-in order ownership is taken from validated server authentication, never a caller-supplied user ID. Account owners can also read their own checkout. An arbitrary order UUID alone no longer authorizes payment actions.
- A stable request key and a server payload hash make retries reuse the same order. Product/variant availability, quantities, ownership and prices are checked transactionally. Cart quantities are aggregated before reserving stock. Price changes reject checkout rather than silently charging a changed amount.
- `stock_quantity` is reserved on creation; `sold_count` increments only once on confirmed payment. Confirmed cancellation/expiry restores the reservation exactly once. New pending orders cancelled through admin use the provider cancellation path first.
- The cart survives redirects/cancellation. Confirmed success removes only the purchased quantities, retaining items added in the meantime. This receipt cleanup is tied to the current browser tab's checkout attempt.
- New card and wallet payments return to a public, access-controlled confirmation page. PayPal retains its existing public confirmation page with strengthened verification and safe capture retries. Old PayPal return tokens are accepted only when they match the provider ID previously stored on the old order and all provider values verify. Signed Stripe webhooks retain a verified legacy-order settlement path. Existing stock/sales figures for legacy orders are not recalculated.
- Stripe sessions expire after one hour. The reconciler checks provider state before releasing stock. PayPal capture is claimed before external capture; a claimed but indeterminate capture is deliberately held for retry/manual reconciliation, not automatically released. A provider ID lost between provider creation and database persistence is also flagged for attention; retry the same checkout promptly to recover the idempotent provider result. Initial creation retries older than 25 minutes require support rather than risking a duplicate charge.
- Payment options stay disabled when credentials, canonical origin, or the checkout table are unavailable. This local environment lacks the service-role key, so that safe unavailable state was the browser test target; no real order was submitted.
- Catalogue search has a visible submit action, mobile filters collapse, listings paginate in pages of 24, product titles are proper links, variant products ask shoppers to choose options, quantity controls have accessible names, and checkout reads contact → shipping → payment → summary.
- The homepage promotes available featured products and shows only actual review data. Generic social links are hidden until actual account URLs are configured. Existing typography and black/gold styling are preserved. Formatting was normalized across source files so lint can run reliably; most incidental diffs are formatting.

## Business data still required

The code cannot establish actual product dimensions/materials, genuine testimonials, social account ownership, legal terms, taxes, or country-specific shipping costs. Supply those values rather than publishing invented claims. Current €5.99 shipping and free shipping strictly above €50 are preserved; `SHIPPING_COUNTRIES` optionally restricts destinations. Review these rates before offering international fulfillment. Existing descriptive product copy and category records still need editorial review. No legal compliance certification is implied.

## Tests before production

- Guest and account checkout; guest confirmation after payment; owned versus unrelated order access.
- Card success, decline, cancellation, additional authentication, delayed payment, page closed after payment, webhook/database outage, duplicate/out-of-order events.
- PayPal success, cancellation, return reload, repeated capture, wrong internal order/provider ID, incorrect amount/currency/reference, indeterminate capture recovery.
- Concurrent checkout of the last item using independent database connections; duplicate product lines; missing/foreign/sold-out variants; changed prices; rejected cart rollback; repeated release/settlement.
- Old pending Stripe/PayPal orders through the deployment boundary.
- Shipping allowlist, real carrier rates, notification emails, refunds, account recovery, admin fulfillment, wishlist persistence and real product data.
- Keyboard/screen-reader and mobile-device checks, including wallet-capable devices; test both languages and themes.

`npm run check` runs types, lint, isolated PostgreSQL/payment regression tests and a production build. The PostgreSQL tests use PGlite and a minimal schema fixture; they do not replace applying migrations to a staging copy or a multi-connection load test. Browser checks use local code and the public configured catalogue. Actual money movement, live migrations and production deployment were not performed.

## Dependency maintenance

Compatible npm security updates were applied. SheetJS was updated to the official 0.20.3 tarball, as documented at https://docs.sheetjs.com/docs/getting-started/installation/frameworks/. `package-lock.json` is authoritative for this release; use `npm ci`. The older `bun.lock` is not synchronized; do not deploy from it without regenerating and verifying it separately.

## Final local regression results — 7 October 2026

- TypeScript passed; ESLint reported zero errors and six existing React Refresh warnings.
- All four regression tests passed: transactional inventory/order settlement, Stripe verification, PayPal capture verification, and spreadsheet import/export round trips.
- The final production build passed. Framework deprecation and dependency bundling warnings remain; they did not prevent the build.
- A fresh browser checkout restored its saved cart and display currency after reload with no console errors/warnings. At 390px wide, content stayed within the viewport and the form followed contact, shipping, payment, summary order. Screenshots: `audit/10-checkout-after-fixes.jpg` and `audit/11-mobile-checkout-after-fixes.jpg`.
- Product detail purchase buttons now require an available option where applicable. Sold-out options are disabled, selected options expose their pressed state, quantities respect product/variant stock and the 50-unit limit, and bundles preserve the main product option. Companion products needing their own option selection are excluded from one-click bundles. These paths passed static checks; live variant-specific checkout still requires staging data and credentials.
- Wallet initialization now has the same retry-age guard as hosted checkout. A provider initialization timeout retains the checkout attempt for support/recovery; only a confirmed released reservation clears the attempt for a new checkout.
- The last dependency audit retained one low-severity esbuild development-server advisory. Compatible updates were applied; no forced major upgrade was used. Recheck advisories in CI before release.

Local verification is complete within the available environment. The migration, hosted scheduler, provider webhook setup and sandbox payment scenarios above remain release prerequisites.
