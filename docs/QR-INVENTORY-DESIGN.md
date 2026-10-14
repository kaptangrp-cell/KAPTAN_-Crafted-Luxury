# KAPTAN QR inventory design

Status: design implemented locally on 14 October 2026. See [setup and implementation decisions](QR-INVENTORY-SETUP.md) for the shipped scope, activation steps and differences from this proposal. No hosted database or live inventory changes have been applied.

## Product experience

Add a dedicated `/warehouse` workspace, separate from `/admin`. Optimise it for a phone held in one hand and for USB/Bluetooth scanners that enter a code followed by Enter. Show four large actions: Receive, Dispatch, Return, Inspect. An employee sees only authorised actions. Use English/German labels, large touch targets, product photos, colour names and size text, and clear success/error messages. Sound/vibration are optional; feedback must never rely on colour or sound alone.

Scanning is an explicit operation, not a toggle: receiving the same unit twice must never sell it. The screen always displays the active mode, current batch/order, last confirmed unit, and progress. A green success appears only after the database commits. Unknown, duplicate, wrong-variant, unpaid-order, and disconnected cases have distinct messages. Network retries reuse the same operation ID. Offline scanning cannot change stock or show a completed operation; the user reconnects and retries.

## Two identities, one label on each unit

Every exact product + colour + size combination has one immutable variant ID and a unique human-readable SKU, such as `KPT-BELT-BRN-100`. A variant without size uses an explicit “One size”; a product without options gets one default inventory variant. Store colour and size in structured fields; do not depend on splitting display text for identity. Normalised option combinations must be unique within a product. Variant identities cannot be repurposed once units or orders reference them.

Every physical unit additionally has its own serial identity. Ten identical brown 100 cm belts have the same variant SKU but ten different unit QR codes. Each QR resolves to its unit, and therefore to the exact colour/size variant. Print product name, colour, size, SKU, a short unit reference, and the QR on the label. QR payload: a versioned, random opaque unit token, with no customer data or price. Knowing a token conveys no authority to change stock.

Optional shelf QR codes identify variants or locations for lookup only. They cannot receive or sell units. Prefixes distinguish unit, location, and order codes. Replacement labels retain the existing unit identity; reprints never create stock and are logged. Print batches can be resumed and only missing labels reprinted.

## Employee access

Keep existing `admin` and `customer` roles intact. Add separate, admin-managed warehouse membership and capabilities, rather than treating warehouse employees as admins. A customer profile cannot grant itself membership by editing profile fields. Administrators assign an existing verified account and can revoke access immediately.

| Capability | What the employee can do |
| --- | --- |
| Receive | Scan expected labelled units into their assigned location |
| Dispatch | Scan paid orders, pack matching units, confirm carrier handoff |
| Return | Scan a previously dispatched/sold unit into quarantine |
| Inspect | Scan quarantined units; pass for sale or reject as damaged |
| Counter sale (optional, off by default) | Scan eligible units and confirm a recorded in-person sale |
| Supervisor (optional) | Reprint labels, review discrepancies and approve corrections within warehouse scope |

An admin can grant several capabilities to one employee. Admins manage products, label batches, staff permissions, stock audit, and exceptions. Warehouse permissions never grant product editing, prices, cost/margin, analytics, customer browsing, exports, financial refunds, or payment administration. Dispatch only reveals the minimum fulfilment information needed for the selected order. An address is available only if the employee also needs to prepare the shipping label; it is not shown for routine scanning.

Enforce these boundaries in server handlers and database policies/functions, not only navigation. Check current membership, location scope and action capability on every mutation; do not trust client role flags or stale tokens. Revoke direct unit/event/quantity writes from ordinary authenticated clients. Never ship a privileged database key to the browser. Only admin-authorised functions may change warehouse membership.

## Workflows and stock effects

| Operation | Employee flow | Physical and online effect |
| --- | --- | --- |
| Prepare receipt | Admin chooses variant quantities, location and optional supplier reference; creates/prints unit labels | Units become Expected. No stock increase |
| Receive | Employee selects receipt, attaches labels if needed, scans each unit | Expected → Available; physical sellable and online available each increase by one |
| Checkout | Customer starts payment using the existing server checkout flow | Reserve variant quantity atomically; physical stock stays put, online availability decreases |
| Payment | Verified settlement confirms order, or verified cancellation releases hold | Paid reservation persists until fulfilment; release increases availability once |
| Pack | Employee scans paid order, then each unit | Available physical unit → Packed and assigned to the matching order line; consumes its existing reservation, no second availability deduction |
| Dispatch | Scan the packed units at carrier handoff; require all units of a package before confirmation | Packed → Dispatched; warehouse on-hand decreases, online availability unchanged |
| Return | Scan unit and reference its original sale/order | Dispatched/Sold → Quarantine; physically received but not sellable; availability unchanged |
| Inspect | Scan quarantined unit, choose Pass or Reject; rejection requires reason | Pass → Available, availability +1; Reject → Damaged, availability unchanged |
| Counter sale | Scan eligible unit; review basket, record payment reference/method, then confirm | Available → Sold; on-hand and availability -1, without consuming stock held for online buyers |

Dispatch means handoff from the warehouse, not proof of customer delivery. Actual delivery status is separate. A warehouse return does not automatically issue a financial refund. Partial returns and partial shipments are supported per unit; order totals are not blindly restocked.

Normal receiving can include a condition check; visibly damaged incoming units go directly to quarantine instead of becoming sellable. Inspection rejection remains a physical unit in the warehouse until a separately authorised disposal/supplier-return event. Incorrect scans are corrected with compensating events, never deletion of history.

## Quantities and reservations

Maintain separate physical state and commercial reservations. For each variant:

`available_to_buy = physically_available_units − active_unallocated_reservation_quantity`

Packed units are no longer physically available, and their reservation quantity is already allocated, so the same unit is never subtracted twice. Example: receive 10 → available 10; reserve 2 → available 8; pack 2 → physically available 8 and unallocated reservations 0 → available still 8; dispatch 2 → available still 8. A returned unit increases availability only after inspection passes.

A paid order holds stock until packed or explicitly cancelled. Payment attempts can expire only through the existing payment reconciliation process, after confirming they cannot settle. Do not release a reservation merely because a browser closes or a local timer expires. Cancellation after packing requires scanned unpacking/inspection before the physical unit can return to saleable stock. Return after dispatch follows the return workflow.

Counter sales must check the unreserved quantity under the same variant lock as checkout, even if the scanned unit itself has no order assignment. This prevents selling the last physical unit held for an online buyer. Packing can select any eligible unit of the exact reserved variant; FIFO is a suggested picking order, not a forced serial allocation at checkout.

## Data and transaction design

Proposed tables:

- `warehouse_memberships`: user, enabled state and warehouse/location scope.
- `warehouse_permissions`: membership and allowed action; admin-managed.
- `warehouse_locations`: warehouse and shelf/bin identifiers.
- `inventory_receipts`: expected variant quantities, supplier reference, destination and receipt status.
- `inventory_units`: immutable variant ID, unique token/serial, receipt, physical state, location, current order-line allocation and version.
- `inventory_events`: append-only operation ID, unit, action, prior/new state, actor, time, location, receipt/order reference and reason. No broad customer data.
- `inventory_reservations`: checkout/order line, variant, reserved/unallocated quantities and reservation state.
- `inventory_balances`: server-maintained per-variant projection of physical, reserved, available, packed, quarantine and damaged quantities.

Every successful action updates the unit, reservation where applicable, append-only event and balances in one database transaction. Lock affected variants in a consistent order, then units/reservations using the same order across checkout, scans, cancellation and settlement. Check expected state/version and all constraints after acquiring locks. Reject unknown units, mismatched variants, quantities beyond the order, invalid transitions and insufficient unreserved stock. Unique operation IDs make retries idempotent; a second distinct Receive against an Available unit is a duplicate, not another increment.

Events plus current unit/reservation records are authoritative. Balances and existing stock columns are projections only; never independently editable sources of truth. An internal reconciliation report compares projections against units and reservations and reports discrepancies for supervisor review.

## Integration with this repository

Current `src/lib/product-options.ts` already creates one option per colour/size combination. Preserve existing variant IDs and cart/order references while adding structured identity fields and SKUs. Review existing duplicates and colour-only/size-only options before conversion; never invent physical combinations or infer stock for them silently.

Current `create_checkout_draft` and `settle_checkout_order` in `supabase/migrations/20261009190000_payment_before_order.sql` reserve/release numeric stock before payment and promote verified payment into an order. Replace their stock mutation internals with the shared reservation/balance mechanism in a new migration. Preserve request-key idempotency, payment verification, reconciliation, and legacy draft settlement. Do not add scan deductions alongside the old deductions.

Add warehouse server functions and a route outside `src/routes/_authenticated/admin`. Keep existing admin guards unchanged. Extend admin inventory tools for label preparation, member permissions and audit. Disable direct stock editing and quantity-changing imports for QR-managed products; every existing write path, including admin option/product updates and legacy order-status routines, must be audited and converted or blocked.

Publish only safe variant availability changes to the storefront, not serials, staff events or order information. Subscribe relevant catalogue/product views and invalidate/refetch their stock queries after each committed change. On reconnect, refetch authoritative balances; checkout always revalidates stock even if a buyer's page is stale. Use the existing database/realtime infrastructure if supported by its configured plan; fallback to short polling without a new paid service.

## Safe introduction

1. Implement and test in a non-production database, including access denial and concurrent operations.
2. Prepare labels and identify valid variants; reconcile active unpaid checkouts, paid unfulfilled orders and existing stock.
3. Temporarily pause stock writes/checkout for the cutover count. Existing numeric stock may already exclude reservations; do not create units from that number alone.
4. Physically count and scan opening stock into units, import active reservations, and reconcile on-hand, packed and available quantities. Opening-count events are explicitly marked.
5. Enable QR management for the reconciled products and resume checkout. Use one explicit inventory mode per product during any staged rollout, with no mixed write path within a product.
6. Verify receive → reserve → pack → dispatch → return → inspect end to end. Rollback must reconcile events and payment holds; do not simply restore an old quantity snapshot after trading resumes.

No new paid scanner service, AI subscription or inventory platform is required by this design. Generate QR labels in the app using a reviewed free library, print via the browser, and scan through a phone camera with a compatible free decoder or a keyboard-style QR scanner. Camera permission and HTTPS are required for the phone flow; test on the actual devices. Existing hosting/database usage limits and optional printer/scanner hardware still apply.

## Acceptance criteria

- Receiving the same QR twice adds exactly one unit, including concurrent scans from two employees.
- Ten identical variants have ten unit identities; reprinting any label adds zero units.
- Scanning the wrong colour or size cannot fulfil an order line.
- Last-unit checkout and counter sale race results in one success, never negative availability.
- Repeated payment webhooks, releases and pack scans do not double-reserve, deduct or restock.
- Returned/damaged units remain unavailable until an authorised inspection passes.
- A revoked employee cannot scan again; direct calls cannot bypass capabilities or location scope.
- Warehouse accounts cannot access admin routes, customer lists, prices/cost administration or refund endpoints.
- Network failure never displays uncommitted success; retry preserves the operation ID.
- Storefront availability refreshes after commits and reconnects; authoritative checkout validation prevents stale-page overselling.
- Existing unpaid drafts and paid unfulfilled orders survive cutover without losing or duplicating stock holds.
