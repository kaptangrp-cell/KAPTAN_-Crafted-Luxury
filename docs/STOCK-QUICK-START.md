# Salt lamp stock: quick start

Open **Admin → Stock & labels** (German: **Bestand & Etiketten**).

## Once per new product

Create the salt lamp product and its size/colour options in Products. Open **Stock & labels → Product setup** and enable stock tracking for it. Review the activation notice: tracking derives sellable stock from received individual items.

## For each delivery

Choose **Add stock**. Your delivery form stays in place when you switch between the top-level stock tabs.

1. **Delivery:** enter the supplier, invoice/reference, date, product options and quantity. Attach the supplier document, then select **Save & continue to labels**.
2. **Labels:** choose the delivery, enter its shelf location and create the required labels. Each item gets its own number and QR code. A batch can contain up to 200 labels; create another batch for any remaining quantity.
3. **Receive:** print and attach the labels, count and inspect the items, tick the confirmation, then choose **Confirm stock received**. Only received items become available stock. Use individual scanning for partial or damaged deliveries.

For several product options, return to Labels and repeat for each line.

## Everyday use

The warehouse page has separate **Scan & update**, **Find an item**, and permitted **In-person sale** tasks. Administrators can open **Stock & labels** directly from there.

- **Find an item:** scan its QR code or enter its printed number to see purchase and movement history.
- **Reprint:** open Stock & labels → Reprint labels (or Add stock → Labels → Reprint / receive an existing label batch). Reprinting keeps the original numbers and does not add stock.
- **Interrupted receiving:** retry the same batch. Already-received items are skipped; items already sold or moved beyond receiving require individual inspection.
- Purchase document uploads do not book expenses or mark supplier invoices paid. Those remain in Finance.

## Confirmed test-record cleanup

The owner confirmed the purchase **ABC GmbH / ABC-12345** and labels **KPLWB-1 through KPLWB-7** are test records on 9 November 2026.

`maintenance/confirmed-demo-stock-reset.sql` is a one-time script for the Supabase SQL Editor, using the database-owner role. It has **not been applied** by this change. It creates a private backup, removes only the confirmed records and their unprocessed creation history, and preserves products, variants, orders, financial documents and label numbering. It stops if records have changed or gained operational/accounting links. Run the entire script as one transaction; do not run individual deletion lines. If it reports an error, stop and investigate instead of weakening its checks.

Discard the old printed test labels after the cleanup. Never reuse their item numbers.
