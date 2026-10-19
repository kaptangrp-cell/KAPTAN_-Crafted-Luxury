# Kaptan Growth Planner

## Release

Apply `supabase/migrations/20261019090000_growth_planner.sql` to the Kaptan Supabase project before deploying the application. It adds only `growth_plans`, `growth_actions`, their revision trigger and admin-only RLS policies. It does not change shop orders, inventory, invoices, finance journals or customer data. No new environment variables, subscription or API keys are required.

Application entry: **Admin → Growth Planner** (`/admin/growth`). Both German and English interfaces are available. The new module requires the existing `is_admin()` function and auth schema.

## Startup planning (October 2026 update)

Apply `20261019100000_growth_startup_year.sql` before releasing this update. It extends the existing period constraint without changing saved plans, actions or store records. Legacy plans default to blank launch assumptions.

The planner now opens on **Marketing & Sales Plan**, with a visible strategy and editable roadmap even before saving, with no historical sales, and with no catalogue/stock. New drafts start on the first day of next month (editable before saving). **First year from launch** covers twelve months from that date; **2027** remains separate. First 60 days has nine periods, with a four-day final period.

- The roadmap provides two actions per period (18 weekly or 24 monthly), including practical steps, editable suggested workloads, deadline, KPI, budget and explicitly hypothetical benefit.
- A missing/out-of-stock catalogue produces preparation tasks instead of an empty screen. Promotions remain conditional on receiving and checking stock.
- Action previews use current draft goals immediately. Adding an action validates and saves the goals if needed, then saves the action. It does not send messages or start spending. Existing actions are never regenerated or overwritten automatically.
- Optional paid acquisition appears only in period 5 with available inventory and a positive period budget. Other spend is unallocated, not silently committed. Zero budget has an organic alternative. No sample, event or postage cost is assumed to be free.
- Enter **assumed order value** and **assumed purchase conversion** under Goals & Forecast to calculate required orders/visits. These are user inputs, not benchmarks. If an explicit order target exists it takes precedence; implied revenue is shown alongside the revenue goal to expose inconsistencies. Forecasts and actual sales stay separate.
- First-year phases progress from positioning and shop readiness to acquisition, partnerships, retention, review, gifting, evidence-gated scaling and year-two planning. Task counts are suggested workload, not performance promises.

Reference resources reviewed: [Google Merchant Center free listings](https://business.google.com/us/merchant-center/?content_language=English), [Meta Reels creative guidance](https://www.facebook.com/business/ads/facebook-instagram-reels-ads). These inform discovery/content options; the roadmap and workloads are Kaptan planning suggestions, not provider-endorsed sales forecasts.

## Use

1. Choose **Next 60 days** or **2027**. A 60-day plan starts on the selected date and stays anchored after saving; 2027 contains twelve calendar months.
2. Set overall goals. Click **Distribute total targets across periods**, then adjust any individual targets. Period totals must equal overall targets. Save.
3. Review forecasts. If history is insufficient, enter orders/day and average order value for each scenario and explain your assumptions. Save. No scenario gains an invented uplift merely from its name.
4. Open **Marketing & Sales Plan** and generate proposals. These are previews, not campaigns. Review and add individually; edit deadlines, budget, KPI and instructions. You can also create a custom action. Check off completed work.
5. Open **Performance** each week/month. Record verified marketing spend, website visits and new followers, plus the source in review notes. Blank means unknown; zero means you checked and found zero. Save goals & reviews.
6. Open **Recommendations** for up to three evidence-based next steps. Actual store data refreshes every minute and via **Refresh actuals**. Saved plan edits from another session require **Reload saved plan**; revision checks prevent silent overwrites.

## Definitions and limits

- All dates use Europe/Berlin; periods have inclusive starts and exclusive ends. Nine weekly buckets cover exactly 60 days (the final bucket has four days); 2027 has twelve calendar months.
- Revenue is the current value of paid, non-cancelled orders grouped by order creation date, including shipping and taxes as stored. This is not accounting revenue recognition. Unpaid/cancelled/fully refunded orders are excluded. Partially refunded orders make affected revenue/profit unavailable because an exact remaining value cannot be inferred safely from the order status alone. Product rankings exclude those orders as well.
- Gross profit is an estimate: order-item sales less current product cost × quantity and order discounts. It excludes shipping costs, payment fees, advertising and tax adjustments. Missing costs make aggregate profit unavailable. It is not historical COGS from the finance ledger.
- New buyers are the first paid/non-cancelled purchaser in the complete order history, matched by normalised email with account ID fallback. Prior refunded purchases still establish prior customer history. Changed email addresses may split a buyer; no PII is returned to the planner browser.
- Forecast baseline uses the last 28 complete days, requires history reaching 28 days back and at least five paid orders in that window. This is a disclosed heuristic, not a statistical guarantee. Forecast = actual plan-to-date value + daily order rate × AOV × manual uplift factor × remaining full days. The incomplete current day contributes only orders already observed and is not extrapolated twice. Future annual scenarios extend the current baseline; no seasonal growth is invented.
- Overall growth compares elapsed plan days with the immediately preceding equal number of days. Period tables compare against the full preceding week/month; a running period is explicitly labelled incomplete. Do not infer deterioration from a partial-period comparison alone.
- Required average revenue per remaining planning period divides remaining revenue by remaining buckets, not by an invented fixed month length. Required daily orders uses the plan-to-date AOV, otherwise unavailable.
- Marketing spend/traffic/social actuals are explicitly manual; no advertising integrations, email dispatch, tracking scripts or payment actions are introduced. The marketing budget is a ceiling/plan, not an expense entry. Planned action-budget overrun is flagged, not automatically spent.
- Suggestions use stocked product/category data, saved order/customer targets, period budgets and (for Q4 2027) gifting timing. Benefits are hypotheses. No-stock catalogues generate gated preparation proposals. Email requires independently evidenced consent; no email campaign is sent by this module.
- Product performance ranks active products by recorded item sales and highlights zero sales without inferring demand or exposure. Stock cover uses current stock / last-28-day unit sales rate; supplier lead time and variant availability require human review.
- No automatic campaign attribution, causal claims, tax reporting, statistical confidence interval, social-platform integration or autonomous spending is included.

## Verification

`node --test tests/growth-planner.test.mjs tests/localization.test.mjs` exercises allocation, schemas, forecast assumptions, null handling, exclusions, stock-sensitive proposals, recommendations, Berlin date boundaries and a PostgreSQL-compatible database migration/RLS/revision test. Also run typecheck, changed-file lint and the production build. Production release of the original planner was verified on 19 October 2026; the startup update needs its own release verification; automated test fixtures never enter production.

Local browser check completed in an isolated, write-disabled preview: goal entry and day-weighted distribution updated period tables and the revenue chart; empty-data recommendations correctly avoided an unsupported diagnosis. The preview used no orders or product records and is removed from deployable assets.
