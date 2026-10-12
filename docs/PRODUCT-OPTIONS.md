# Product colors and sizes

## Admin workflow

1. Open Admin → Products. Save a new product before adding its options.
2. Click the palette button (Colors & sizes) next to a product.
3. Choose Color, Size, or Color and size. Enter a name, for example Black / Medium.
4. Set optional stock and an extra price in euros. Blank stock uses the shared product stock; zero makes the option sold out. The product's overall stock still caps sales.
5. Keep Active selected to show the option. Save option.
6. Repeat for each sellable combination. Click an existing option to edit it or deactivate it, then save.

Inactive choices are hidden from the product selector and managed color facts. Active sold-out choices remain visible but disabled. Products with options require a valid option before purchase; if all options are inactive, the product cannot be purchased. Plain products without options keep their existing checkout behavior.

Use one option type consistently per product for separate color and size controls. Existing mixed or custom options remain supported as labelled choices. Color/size values cannot contain slashes because a combination is stored as `Color / Size: Black / Medium` in the existing variant fields.

Options retain their IDs instead of being deleted, preserving historical order references. Deactivating a choice blocks new checkout attempts, including old cart items; it does not cancel an already reserved payment. Do not rename an existing choice into a different physical item; deactivate it and add a new one instead.

## Deployment and verification

Deploy the application changes. No database migration or new environment variable is required; this uses the existing product_variants table and payment validation.

Type checking, production build, changed-file lint, option validation tests, and isolated database tests passed. Tests cover hidden/inactive options, sold-out options, variant stock reservation, price adjustment, and the exact variant recorded after payment. Admin browser verification requires an authenticated admin session. No live product data was modified during implementation.

## Multiple selections in the product editor

The product edit form includes preset color and size buttons plus custom values. Select several of each and save to create all combinations. New combinations use shared product stock and no price surcharge. Existing combinations preserve their settings; deselected combinations become inactive. Use Colors & sizes to reactivate a previously disabled combination or adjust individual stock and price. Legacy descriptive specifications do not automatically become sellable variants.
