# Purchasing and unit operations

## Available in this release

Admins: open **Admin → Festival sales** (`/admin/festival`). The dedicated workspace has Sell, Purchases, Unit history and Setup tabs.

Warehouse employees continue to use `/warehouse`; adding the admin tab does not give employees access to other admin pages. Existing staff permissions remain authoritative.

- **Purchases & labels** (admin): upload the original supplier order/advance invoice, select each colour/size and ordered quantity, save. Uploading preserves evidence; it does not assert payment or book expenditure.
- When goods arrive, create labels against the purchase line (maximum 200 per batch). Repeated requests return the same batch; total labels cannot exceed the ordered quantity.
- Scan **Receive** to add physical stock. Printing labels does not add stock.
- **Find a product**: scan the existing QR payload or type the new readable number. Inspect history and, with receive permission, move a received unit to another shelf or event location.
- IDs use K + product-word initials + first variant colour character + a globally unique sequence, for example `KPLWB-123` for Premium Leather Wallet / Black. Size is printed separately and remains part of the immutable variant. Product renaming does not change previously assigned numbers. Existing QR payloads continue to work.
- **Festival scan basket** (sell permission): scan unique available units, inspect current prices, save and reopen your preparations. Seller is the logged-in employee. Saved preparations do not reserve inventory; reopening checks availability and refreshes prices.

## Not complete / not a live till

The user selected PayPal, Revolut bank transfer and cash on 2026-10-21. No TSE provider has been chosen or connected. The festival interface is deliberately preparation-only: it cannot take payment, issue a fiscal receipt, create a sales invoice, or post a sale to Finance. The existing legacy sell scan still only changes physical inventory; it is not a checkout.

Still needed for live festival sales:

1. Select certified till/TSE integration and implement its signing, receipt, export and recovery contract. Do not treat PayPal or Revolut accounts as a TSE.
2. Atomic checkout: verify payment/reference, lock exact scanned units, create paid order and immutable sale snapshots, update inventory, record actual seller and location. Retry keys must cover provider and database retries.
3. Consumer receipt vs full business invoice rules, optional customer details, invoice worker/email delivery and Finance settlement routing (cash, PayPal, Revolut), without duplicate revenue recognition.
4. Refund/cancellation and cash balancing workflows, DSFinV-K and applicable register configuration/registration.
5. Supplier advance payment bookkeeping and later cost allocation remain in Finance; the purchase workflow currently links evidence only.

Official fiscal references consulted:
https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html
https://amtliche-handbuecher.bundesfinanzministerium.de/ao/2026/Abgabenordnung/Vierter-Teil/Zweiter-Abschnitt/Erster-Unterabschnitt/Paragraf-146a/inhalt.html

## Deployment

Apply `supabase/migrations/20261021100000_unit_operations.sql` before deploying the application. The migration backfills readable IDs without manufacturing stock events. It preserves existing UUID QR codes and warehouse permission boundaries. Test with `node --test tests/unit-operations.test.mjs`; full suite, typecheck, ESLint and build are also required.
