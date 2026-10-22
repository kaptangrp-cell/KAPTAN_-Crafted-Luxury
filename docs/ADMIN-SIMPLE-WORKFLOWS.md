# Simple admin workflows

## Paid orders to prepare

Click the dashboard card to open the full paid preparation queue, oldest first. Orders stay here while Ordered or Packaging (including older Pending/Processing values). Dispatch/Out for delivery, Delivered and Cancelled leave the queue. Unpaid and refunded orders are excluded. The queue is not limited to the latest 100 orders.

Order events refresh the dashboard and order list. A 15-second fallback refresh runs while the page is visible, and returning to the tab refreshes it. Apply `20261022100000_admin_order_realtime.sql` to enable the Supabase order event publication. Existing row-level access policies are preserved.

## Growth Planner — simple view

1. Choose First 60 days or First year.
2. Choose the start date (for a new plan), product to promote, revenue goal and marketing budget.
3. Click **Save my goal**. Example: €1,000 revenue with €100 marketing budget for the first 60 days. These are your targets, not predicted earnings.
4. Read the three suggested actions. Click **Add to my plan**, follow the steps and click **Mark done**.
5. View actual recorded shop revenue under **Check your progress**. Additional suggestions appear as you complete actions.
6. Open **All my actions / undo completion** to change a task back to To do or In progress.

Existing detailed goals, scenarios and reports remain available through **Advanced planner**. Switching views preserves your goal edits. No paid AI service is used.

## Festival sales — preparation screen

You operate the screen for the customer. The customer does not need to visit the storefront or log in to prepare a basket.

1. Enter the event/stand once; it is remembered for this browser session.
2. Scan each physical unit with a USB scanner or Camera, or type its printed unit number and press Enter.
3. Check the automatically loaded product, variant, unit price and total.
4. Save the basket if you need to return to it. Use **Next customer** to clear it for the next basket; unsaved baskets require confirmation.

**This is still preparation only.** It does not take payment, reserve stock, issue a receipt or record revenue. Actual staff checkout, optional customer-account linking, cash/PayPal/Revolut payment verification and fiscal receipt/accounting integration remain outstanding. See `FESTIVAL-CHECKOUT-ACTIVATION.md` for the implementation requirements. No provider is currently configured; completing this requires both the remaining code and provider setup, not just a new button.
