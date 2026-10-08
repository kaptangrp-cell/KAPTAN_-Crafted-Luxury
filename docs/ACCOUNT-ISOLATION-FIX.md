# Customer order isolation — 8 October 2026

The reported symptom was a newly created account showing an older order. Source review found two paths that could produce it: customer order queries accepted matching checkout email as well as account ownership, and customer query caches used shared keys without an account ID. The screenshot alone cannot establish which path produced that specific production record.

## Changes

- Customer order history and detail now require `orders.user_id` to equal the authenticated account ID. Queries use the caller's authenticated Supabase client, so database row-level security applies as well. A contact email is not proof of order ownership.
- Guest orders no longer appear automatically in a newly registered account merely because the email matches. Existing secure guest confirmation links retain their separate authorization flow. An explicit, verified guest-order claim workflow would be needed to attach guest orders to an account later.
- Orders, order details, profile, wishlist and saved-address cache keys include the account ID. Switching identities cancels old queries and clears caches. Late profile responses cannot restore the former account's name or admin role.
- Authentication has one persistent listener at the app root. Protected views wait for initialization and reset when accounts change. Profile loading is deferred outside the authentication callback.
- Order-load failures are shown as errors with a retry action rather than being mistaken for an empty history.
- The admin list still defaults to the latest 100 orders, with an explanatory label. Its new exact order-number search searches older records too. Customer names on existing orders are checkout snapshots, not automatically changed to a newly registered profile name.

No orders were deleted, reassigned or modified. No new migration is required for these fixes; earlier checkout release prerequisites still apply.

## Verification

Automated regression cases cover a new account sharing an email with an old/guest order, owned orders using a different contact email, unauthorized detail access, query failures, switching A to B, late old-account query completion, sign-out, same-account refresh, and stale admin profiles. These are isolated tests, not a production-data audit.

Local validation passed: TypeScript, lint with zero errors (six existing warnings), all eight regression tests, and the production build.

After deploying the new commit:

1. In a private window, sign in as Fatma and open My Orders. If no orders belong to that account ID, the empty state should appear.
2. In a normal window, sign in as a test customer with orders. Sign out and sign in as a different new test customer. The second customer must not see the first customer's orders, profile or wishlist, even briefly.
3. Copy the first test customer's order URL and open it as the second customer. Access should be denied without revealing order details.
4. As admin, search the exact order number shown in the screenshot. Compare its stored customer details with the actual buyer. This lookup does not reassign ownership.
5. If the new account still has that order after this release and a fresh login, an authorized database administrator must inspect that specific order's `user_id` and the account ID. Do not delete/reassign the record until its true ownership is confirmed.
