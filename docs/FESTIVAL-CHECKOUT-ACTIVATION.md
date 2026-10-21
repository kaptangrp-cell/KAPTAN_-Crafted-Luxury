# Festival checkout: remaining activation work

## Business choices already confirmed

- Germany, EUR, current §19 Kleinunternehmer tax mode.
- Cash, PayPal and Revolut bank transfer.
- Each scanned physical unit must be identified and reconciled with online stock.
- Seller is the signed-in, authorized staff account, not a freely editable name.
- No paid subscriptions may be purchased on the owner's behalf.

## External prerequisite

The owner must identify a certified till/TSE provider or device. An ordinary PayPal or Revolut account is not a TSE. Credentials must be installed directly in server environment settings, not shared in chat or the browser application.

For a cloud integration, obtain the provider's signing, receipt, cancellation, export, retention, outage/recovery and sandbox specifications. Fiskaly SIGN DE with DSFinV-K is one possible integration to evaluate, not an activated or purchased service. A hardware TSE requires a supported device bridge; it cannot simply be attached to Vercel.

Registration/notification to the tax authority and business operating documentation must be completed by the owner/adviser where applicable. Software deployment does not perform these legal submissions.

## Required engineering and acceptance criteria — NOT implemented yet

1. Start a durable transaction with exact unit IDs and immutable server-priced lines. Prevent concurrent online checkout/other festival operators from selling the same units. Recover leases and uncertain provider outcomes before releasing anything.
2. Start/sign the fiscal transaction at the points required by the selected provider. Store immutable transaction IDs, timestamps, signature and counters, including aborted attempts. Never synthesize live signatures or treat a sandbox response as live evidence.
3. Cash: exact tendered amount and change, opening float, cash movements, counted closing balance and discrepancy review. PayPal: verify completion, currency, amount and recipient server-side. Revolut transfer: distinguish pending promise from confirmed received funds; reconcile by unique bank reference. A selected method is not proof of payment.
4. Complete the order and unit transitions exactly once after confirmed payment and fiscal processing. Preserve sold-by actor, event location and dates. Handle uncertain retries as reconciliation, never as a second charge/sale.
5. Issue the correct German consumer receipt or full customer invoice, with current seller/tax details, fiscal fields, printed/digital delivery and archived original. Do not invent an email or address for anonymous customers. Business/public authority invoices require their applicable billing details and format/routing.
6. Book the appropriate cash, PayPal or Revolut account, revenue, tax treatment, fees and historical cost. Avoid importing both a receipt and its invoice as separate revenue. Preserve supplier advances separately from received inventory costs and actual payment evidence.
7. Signed cancellations/refunds and cash effects must reverse the original sale without deleting it. Physical returns enter inspection/quarantine; a refund alone must not make a unit sellable again.
8. Implement DSFinV-K cash point closings, TSE export, retention and audit access, with retry/reconciliation for failed exports. Audit downloads are not to be labelled compliant until validated against the provider's requirements.
9. Validate sandbox happy paths and payment/fiscal/database failure recovery, duplicate requests, mixed tenders if supported, concurrency, returns, permissions and no-secret browser bundles. Complete a supervised live acceptance transaction only with the owner's authorization.

The currently deployed festival basket is preparation-only. It is not a functioning or certified cash register. The old warehouse Counter sale action only adjusts inventory and is not a substitute for checkout.

Primary references checked 2026-10-21:
- https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html
- https://developer.fiskaly.com/dsfinvk/main_resources_timeline
- https://workspace.fiskaly.com/
