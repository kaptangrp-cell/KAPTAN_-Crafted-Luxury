# Managing the product catalogue

1. Open Admin → Products and add or edit a product.
2. Enter its name, category, description, price, optional previous price, and total stock. The URL slug follows the name for new products until you customise it.
3. Choose colours and sizes. The store creates a purchasable variant for each combination.
4. Upload multiple photos together, or add an individual image/video. Assign each image to a colour; leave shared detail or lifestyle images as “All colours”. Enter a view label (Front, Back, Interior, etc.) and an accessible description.
5. Move the desired cover image to the first position. Within a colour, its earliest image is its thumbnail. Colour-specific images appear before shared images in the product gallery.
6. Preview the product card and save. Use Manage options to set individual variant stock or price adjustments. Empty variant stock means shared product inventory. Hide variants when unavailable.

Ratings come from the existing customer review system; they are not manually invented in the product editor. Existing products need real colour-specific photos assigned before those thumbnails can appear. Products with only shared images keep their existing galleries.

Gallery labels are stored in the existing products.specifications JSON under the reserved `_media` key, associated by media URL. Existing product_images records and storage uploads remain in use. No database migration is required. Normal admin authentication and permissions still apply.

These changes are local source changes. They do not publish a deployment or alter existing catalogue records. The existing checkout and payment providers remain in use.
