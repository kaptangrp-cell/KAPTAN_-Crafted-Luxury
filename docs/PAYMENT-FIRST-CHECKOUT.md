# Payment-first checkout

## Behaviour

- Starting payment creates a private checkout draft and reserves inventory, not an order.
- Only server-verified Stripe/PayPal payment promotes that draft into an order and its items in one transaction.
- Repeated payment callbacks cannot create duplicate orders or count sales twice.
- Failed/cancelled/abandoned attempts do not remove cart items. Confirmed payment removes only purchased quantities, once.
- Customer/admin histories, exports and fulfilment exclude older unpaid records. Paid orders that were later refunded remain visible. Historical records are not deleted.
- A failed confirmation page keeps the cart accessible and does not show an order number as a confirmed order.

## Activate in Supabase

1. Open the Supabase project matching this store's environment settings. Do not rely on the older project ID in supabase/config.toml.
2. Open SQL Editor → New query.
3. Paste the complete contents of `docs/APPLY-PAYMENT-FIRST.sql` and run it. This includes both checkout migrations in a transaction and is safe to reapply.
4. Deploy the matching application changes to Vercel, then refresh checkout.

Until setup succeeds, the new application disables payment instead of falling back to creating unpaid orders. The SQL changes also disable checkout creation by old application releases; existing in-flight payments can still settle. Coordinate the SQL and app deployment to minimise the checkout interruption.

## Verification — 10 October 2026

- Type checking and production build passed in the implementation run.
- 23 automated tests passed, including payment-first database settlement, backwards compatibility, duplicate callbacks, cancellation, ownership and persisted-cart retention.
- Live schema inspection: `checkout_drafts` SELECT returned PGRST205 (table absent from the API schema); `create_checkout_draft` was absent from the API description. The earlier HEAD/zero-row probe returned 204 and was not sufficient evidence of deployment.
- Browser: a temporary cart item remained after navigating to checkout and reloading. Payment was correctly unavailable while setup was missing.
- Local card configuration is incomplete; PayPal credentials are present with sandbox selected. No real payment or production deployment was performed.

After applying the SQL, verify a sandbox successful payment, declined/cancelled payment, retry, browser refresh, and repeated confirmation. Confirm zero new orders before payment, exactly one after payment, stock released on cancellation, and cart contents retained until success. Use provider test credentials; do not use live customer orders for testing.

The final verification run passed all 23 tests, type checking and production build. The combined SQL setup was executed twice successfully in the isolated database tests. The cart and checkout now show a loading state until saved cart hydration finishes, instead of briefly showing a false empty-cart message. The temporary browser test item was removed after verification, restoring the original empty cart.
