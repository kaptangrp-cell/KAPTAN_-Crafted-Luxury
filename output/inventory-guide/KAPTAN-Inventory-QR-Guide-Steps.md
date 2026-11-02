# KAPTAN — Inventory lifecycle with QR codes
Companion to the video guide (6 min). Button names match the admin; screens in the video are illustrations.

## 01 · The life of one product unit  (0:06)
1. Every physical item gets its own QR label — one label, one unit.
2. Each scan moves the unit to its next state and writes a permanent history event.
3. Shop stock, orders and finance read from those same events — no manual stock typing.

> This guide follows the order you work in: set up → receive → sell → ship → return → report.

## 02 · Give employees scanner permissions  (0:26)
1. Open Admin → Staff & Permissions.
2. Enter the employee’s account email (they must have registered and verified it).
3. Tick only the actions they need: Receive, Dispatch, Return, Inspect, Counter sale.
4. Click “Save warehouse permissions”. They now see Account menu → Warehouse.

> To revoke: untick everything and save. Warehouse permissions never give admin access.

## 03 · Start QR tracking for a product  (0:48)
1. Open Admin → QR Inventory and select the product.
2. Clear the “Before QR activation” list: finish open orders, reconcile payment reservations, then “Check again”.
3. Count the physical stock on the shelf and tick the opening-count confirmation.
4. Click “Start QR tracking”. Online stock shows 0 until each counted unit is labelled and scanned in.

> Do this one product at a time. Colour and size must be set up as combined variants first.

## 04 · Record the delivery and create labels  (1:10)
1. Open Admin → Festival sales → Purchases.
2. Upload the original supplier order or advance invoice (kept as evidence).
3. Select each colour/size and the ordered quantity, then save.
4. When the goods arrive, create labels for each purchase line — never more than were ordered.

> Shortcut without a purchase: QR Inventory → Colour/size variant → Number of labels (1–200) → Warehouse/shelf → Create unique unit labels.

## 05 · Generate and print QR labels  (1:32)
1. Check the label batch: product, colour/size and shelf are correct.
2. Click “Print N labels” → print on an A4 sticker sheet or a label printer.
3. Lost or damaged label? QR Inventory → Recent label batches → “Load / reprint same labels”.
4. Test-scan one printed label with the phone before labelling the whole batch.

> Printing does NOT add stock — units are only “Expected”. Reprints keep the same unit identity.

## 06 · Attach one label to each unit  (1:54)
1. Match the label to the exact item: check colour and size on the label.
2. Attach one label per physical unit — never one label for several items.
3. Put labelled units on the shelf printed on the label.

> Leftover labels: keep them with the batch. Unused labels never become stock.

## 07 · Scan units into stock  (2:13)
1. Account menu → Warehouse → Receive.
2. Scan with “Use camera”, a USB/Bluetooth scanner, or type the unit number and press Enter.
3. Wait for the green “Scan confirmed” — only then is the unit in stock.
4. The unit moves Expected → Available and the shop shows +1 stock immediately.

> Scanning the same label twice never adds a second unit. Offline? Nothing changes — reconnect and scan again.

## 08 · Customer orders and pays  (2:35)
1. The customer buys on kaptangrp.com and pays.
2. Checkout reserves one unit of that exact colour/size — online stock goes down by 1.
3. After the payment is verified, the order is created as Paid / Ordered.
4. It appears on Admin → Dashboard (“Paid orders to prepare”) and in Orders.

> If a payment fails, the reservation is released through payment reconciliation — never by guessing.

## 09 · Pack the order  (2:57)
1. Warehouse → Dispatch → enter the paid order number → “Load packing list”.
2. Choose Action: “Pack for this order”.
3. Scan each unit. Any unit of the right variant works; a wrong colour or size is rejected.
4. When the last unit is packed, the order changes to Packaging automatically.

> Stock was already reserved at checkout — packing never deducts it twice.

## 10 · Hand over to the carrier  (3:19)
1. At the carrier: Warehouse → Dispatch → same order → Action: “Confirm carrier handoff”.
2. Scan every unit again as it leaves. The order changes to Out for delivery.
3. When delivery is confirmed (tracking or customer), set the order to Delivered in Admin → Orders.

> Carrier handoff is not proof of delivery. Warehouse stock goes down; online stock was already reduced.

## 11 · Festival stand and counter sales  (3:39)
1. Festival sales → Sell: enter the event/stand once, then scan each unit the customer picks.
2. Check product, variant, prices and total. Save the basket or press “Next customer”.
3. The basket does not take payment, reserve stock or issue a receipt.
4. To record the sale: Warehouse → Counter sale → enter receipt/payment reference → scan. Unit → Sold, stock −1.

> Take payment and give receipts with your till. A certified TSE till is needed before live festival checkout.

## 12 · Receive a returned item  (4:01)
1. Check the return is within the policy (30 days of delivery, unused, original packaging).
2. Warehouse → Return → scan the unit’s QR label.
3. The unit is now “Awaiting inspection” — not sellable, not yet back in stock.
4. Refund the customer separately through the payment provider and record it in Finance with evidence.

> A return scan never refunds money, and a refund never puts stock back. Both steps are needed.

## 13 · Pass or reject each unit  (4:23)
1. Warehouse → Inspect. Look at the item first: condition, packaging, completeness.
2. Perfect? Action “Pass inspection → available”, scan → back on sale (shop +1).
3. Faulty? “Reject / damaged”, type the reason, scan → Damaged, never sold.
4. Cancelled order after packing? Scan “Cancelled order → inspection” first, then pass or reject.

> Damaged incoming or shelf units can also be rejected with a reason.

## 14 · Find any unit and its full history  (4:45)
1. Festival sales → Unit history: scan the QR or type the readable unit number.
2. See every event: who scanned it, when, where and what changed.
3. With Receive permission you can move a unit to another shelf or an event location.

> History is append-only: mistakes are corrected with a new event, never deleted.

## 15 · How each scan reaches the rest of admin  (5:05)
1. A scan is saved once, as a permanent event — nothing is typed twice.
2. Shop availability and admin totals are calculated from those events, so they update straight away.
3. Orders move Ordered → Packaging → Out for delivery from Dispatch scans.
4. Finance uses the same unit records for costs; invoices feed the Store accounting inbox.

> Live updates need the realtime database setting; screens also refresh automatically as a fallback.

## 16 · Unit costs and reports  (5:27)
1. Upload supplier, customs and freight documents in Finance → Documents.
2. Inventory & costs: select received units, enter purchase price, currency, rate and extra costs → review → post.
3. Each sale or dispatch then uses that unit’s own cost exactly once.
4. Check Financial overview for totals and export for your accountant.

> Automatic cost postings run only if the owner switches them on in Finance → Automation. Figures are illustrative.

## 17 · Golden rules for the team  (5:49)
- One label = one physical unit.
- Printing labels never adds stock — only a Receive scan does.
- Wait for “Scan confirmed” before moving on.
- Never type stock numbers for QR-tracked products.
- Carrier handoff ≠ delivered. Return scan ≠ refund.
- Returned items stay out of stock until inspection passes.
- Festival basket ≠ till: payment and receipts are separate.
- Offline or error? Nothing changed — reconnect and scan again.

## Before going live
- Your setup notes say the QR warehouse and unit-operations database migrations must be applied and the matching app deployed before these screens appear. Test one product end-to-end in staging.
- Test a real printed label with your phone/scanner first; physical camera testing was not done yet.
- Festival live checkout (TSE till) is not enabled — the Sell basket is preparation only.