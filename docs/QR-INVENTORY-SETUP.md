# QR warehouse implementation and activation

Implemented in source, 14 October 2026. The migration is not applied to the hosted database and this change has not been deployed.

## Where to find it after deployment

- **Admin → QR Inventory** (`/admin/inventory`): activate products, create individual labels, reload/reprint recent label batches, see inventory totals and scan history.
- **Admin → Staff & Permissions** (`/admin/staff`): enter an existing, email-verified employee account, select Receive / Dispatch / Return / Inspect / optional Counter sale, and save. Uncheck all to revoke access. Selecting an employee loads their current permissions.
- **Account menu → Warehouse** (`/warehouse`): restricted employee scanning workspace. It appears for authorised users; permissions refresh periodically and every mutation checks the current database permissions. Employees are not promoted to admin.

## Install before use

1. Back up the database and test the migration in a staging copy. The database must already have the payment-first checkout migration from 9 October 2026.
2. Apply `supabase/migrations/20261014090000_qr_warehouse.sql` using the existing database deployment workflow, then deploy the matching application build. Do not reapply the older payment SQL afterwards: it would replace the QR-aware reservation routines.
3. Use a test product in staging and run the full receive → checkout → pack → dispatch → return → inspect flow. Confirm realtime subscriptions are enabled for the public product and variant projections. The app also refetches visible product queries every 30 seconds and on reconnect.
4. Assign employee permissions using Admin → Staff & Permissions. Test with a separate non-admin account.
5. Activate live products one at a time only after reconciling existing orders and preparing a physical opening count.

The migration itself creates warehouse tables, functions, guards and indexes; it leaves all existing products in legacy inventory mode. No existing quantities are reset simply by installing it. A missing migration produces a setup message in the workspace, and the Warehouse account link remains hidden.

## Opening count

Choose a product in QR Inventory. Finish/reconcile its active orders and unpaid payment holds first; activation is blocked while these exist. Review the warning and check the acknowledgement. Activation intentionally sets that product's available stock to zero and disables manual quantity changes. Previous quantities are retained in the activation operation's audit payload.

For each exact colour/size variant, enter the physical quantity and shelf, generate labels, print and attach one label per unit, then use Receive to scan each unit into saleable inventory. Do not use the previous available quantity as the physical count without counting. A product with no options gets a default One size variant. Separate colour and size option rows must be converted to combined variants before activation.

Every unit label contains a random unique unit UUID, the exact variant, a stable variant SKU and shelf. The SKU is derived from the full variant UUID to avoid collisions. Reprints keep the same unit identity and never increase stock. Existing unit/variant identities cannot be deleted or repurposed by ordinary product editing; archive by availability instead.

## Daily use

- Receive: scan an Expected unit once. Repeated scans cannot increment stock again.
- Dispatch: load a paid order number, choose Pack and scan its matching units. Choose Confirm carrier handoff and scan them again when they leave. For all-QR orders, the final pack updates the order to packaging and the final dispatch updates it to out for delivery. Mixed legacy/QR orders remain under the existing order workflow, with a database guard requiring every QR unit to be scanned before delivery status can advance. Carrier handoff does not claim delivery to the customer.
- Return: scan a dispatched or counter-sold unit into quarantine. No financial refund is issued by a warehouse scan.
- Inspect: scan to pass quarantine stock back into availability, or reject with a reason. Cancelled reserved/packed units first use Cancelled order → inspection, then pass or reject. Damaged incoming or available units can also be rejected with a reason.
- Counter sale: optional explicit permission; enter an external receipt/payment reference and scan available units. This records the physical sale, not payment collection. Reserved units cannot be counter-sold.

The camera uses a bundled free QR decoder. Camera access requires a secure browser context and camera permission. USB/Bluetooth keyboard scanners can enter the unit token and Enter in the scanner field. No external QR service is called. Test a real printed label on your actual phone/scanner before live use; physical camera/hardware testing has not been completed here.

## Implementation decisions and limits

For this implementation, checkout reserves specific unit IDs atomically rather than maintaining a separate quantity reservation table. This reduces the number of stock authorities. Packing can substitute any available unit of the identical variant, atomically releasing the originally reserved serial. Receiving + reservation + packing + dispatch are covered by database tests; packing and dispatch do not deduct stock a second time.

The source of truth is `inventory_units` with append-only `inventory_events`; product and variant stock quantities are guarded projections of Available units. Payment settlement/release keeps the existing verified-payment and idempotent-request logic. Paid cancellations do not blindly restock units; physical release requires inspection scans. Cash payment processing, financial refunds, carrier tracking integration and automatic refund emails remain outside the scanner.

Warehouse scope is currently the whole store, with a shelf/location label per unit. Multi-warehouse permission scopes, transfers, supplier purchasing, automatic expiry/disposal workflows, thermal-printer templates and offline writes are not implemented. All stock-changing scans require a server connection. No success is shown until the transaction commits. Keep the same input and retry after a network error to reuse its operation ID.

All five staff permissions are independent. The UI, server authentication middleware and database RPCs enforce access; private unit/event/staff tables are not directly accessible to regular clients. Staff membership never changes the profile admin role. Employee data queries do not expose customer names, addresses, prices, costs or payment information. Admins can review recent stock events; label-batch creation, activation and permission assignments are retained in private idempotency/audit operations. Reprinting is read-only.

New QR libraries are free packages. Existing hosting/database usage limits, optional printers, scanners and labels still apply. No new paid service or subscription is introduced.

## Verification

- Automated PGlite tests execute the actual migration and checkout functions: unique labels, duplicate receiving, projection protection, role protection, checkout holds, payment settlement, physical substitution when packing, dispatch guard, returns, inspection, counter sales, cancellation release, revoked and limited permissions, and private-table access denial.
- Browser checks: unauthenticated Warehouse redirects to sign-in. Staff controls, mobile scanner confirmation and generated labels checked using an isolated local sample-data harness, not live inventory.
- A real authenticated hosted-database workflow and physical camera/label scan must be verified after staging migration.
