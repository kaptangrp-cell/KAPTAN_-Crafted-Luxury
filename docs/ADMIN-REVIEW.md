# Admin workspace review — 9 October 2026

## Scope and evidence

Improve store management while retaining KAPTAN's black, charcoal and gold theme, euro-only prices and English/German interface. Reviewed dashboard calculations, admin endpoints, products, categories, journal, orders and customers in source. Visually inspected the authenticated dashboard and product management screens at desktop and 390px mobile width. Opened and closed the new product editor without saving anything.

This is a partial live audit, not confirmation that every production workflow works. Local admin queries fail because SUPABASE_SERVICE_ROLE_KEY is not configured. The preview subsequently returned to sign-in. Real order details, populated charts, exports and remote writes could not be verified. No database policies or production records were changed.

## Findings and changes

| Priority | Finding | Implemented change |
| --- | --- | --- |
| High | Sales included orders regardless of payment completion | Reports now include paid, non-cancelled orders only; scope is visible |
| High | Query errors could resemble an empty store | Explicit error and retry states; unavailable totals use dashes |
| High | Recent order links opened customer-only order pages | Admin links now search for the selected order and offer an admin details dialog |
| High | Database row limits could truncate reporting and exports | Paginated reads for dashboard orders/products, analytics and order export |
| Medium | Calendar month arithmetic could skip February at month end | UTC month windows with first-of-month boundaries and regression tests |
| Medium | Revenue and order counts shared chart units | Single euro revenue chart with an accessible data table |
| Medium | Cost margin and visits could imply more accuracy than the data supports | Explicit definitions, missing-cost warning and tracking caveat |
| Medium | Page hierarchy competed with storefront navigation | Dedicated admin header/sidebar, task shortcuts, consistent panels and tables |
| Medium | Inventory and customer lists lacked quick narrowing | Product/category search, stock/visibility filters and name/phone customer search |
| Medium | Editor overlays lacked consistent keyboard behavior | Shared dialog with focus containment, labelled title and Escape close; outside clicks do not discard editing |
| Medium | Narrow layout overflow | Constrained grid tracks, scrolling navigation/tables and wrapping actions |
| Low | Currency formatting and icon actions were inconsistent | Localized euro display and accessible edit/delete labels |

## Flow check status

1. **Enter admin:** authenticated access was observed; role checks remain in place. Session now requires sign-in again.
2. **Review performance:** layout and error recovery observed. Calculation tests pass; populated chart and totals require live verification.
3. **Manage products:** search/filter controls and mobile layout observed. New-product dialog opened/closed. Saving, uploads and imports unverified.
4. **Manage categories and journal:** source reviewed and shared editor applied. Populated screens and mutations unverified.
5. **Manage orders:** exact order lookup, status filtering and detail dialog implemented. Fulfilment changes/email delivery and export downloads unverified.
6. **Review customers:** localized roles, search and empty/error handling implemented. Actual records unverified.

## Validation

- Type checking passed.
- 20 automated tests passed, including five new analytics tests for payment filtering, product scope, guest customers, missing costs, empty reports and UTC month boundaries.
- Production build passed.
- Lint passed for changed TypeScript/TSX and test files.
- Whole-project lint remains blocked by 20 existing formatting errors in brand-film/render-endcard.mjs; six existing React refresh warnings also remain.
- English/German translation key parity and static translation references passed automated checks. No full linguistic or WCAG compliance claim is made.

## Next live checks

Configure SUPABASE_SERVICE_ROLE_KEY privately in the local server environment; never use a VITE_ prefix for this secret or paste it into chat. Restart the local server and sign in as admin.

Then compare known paid/unpaid/refunded/cancelled orders against report totals, test each date window, verify stock thresholds, search an exact order number, open its details, and compare full exports against the database. Test edits/imports/status changes only with agreed test records, since these actions can change inventory, issue emails or affect real orders. Verify English/German and light/dark mode on populated desktop and mobile screens.

## Live verification follow-up — 9 October 2026

The server key has now been configured. Corrected a malformed quote in the local `.env` entry that caused the service key to include the following configuration line, then restarted the preview with the environment loaded explicitly. The secret remains in the ignored local environment file.

Verified through the authenticated browser:

- Dashboard queries succeed: two products, six customer-role accounts and recent orders display. Last-30-days reporting shows zero paid orders.
- A recent-order link retrieves the exact order; its details dialog displays shipping information, purchased items and euro total. The inspected recent order is payment-pending, so it is correctly excluded from paid sales.
- Product inventory loads both products; searching for “Premium” narrows the list to the matching product.
- Categories load, journal displays two records, and the customer/account list displays eight records (including administrator accounts; the dashboard customer count excludes those).

These checks were read-only. Production deployment settings, payment processing, writes, imports, order-status changes/email delivery and downloaded exports remain outside this verification.
