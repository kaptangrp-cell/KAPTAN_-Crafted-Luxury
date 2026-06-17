-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','customer')),
  full_name     text,
  phone         text,
  avatar_url    text,
  date_of_birth date,
  email_marketing boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- CATEGORIES
-- ============================================
CREATE TABLE public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  description text,
  image_url   text,
  parent_id   uuid REFERENCES public.categories(id),
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage categories" ON public.categories FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE public.products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text NOT NULL UNIQUE,
  category_id           uuid REFERENCES public.categories(id),
  short_description     text,
  full_description      text,
  price                 numeric(10,2) NOT NULL,
  compare_at_price      numeric(10,2),
  sku                   text UNIQUE,
  stock_quantity        int NOT NULL DEFAULT 0,
  low_stock_threshold   int DEFAULT 5,
  is_available          boolean DEFAULT true,
  is_featured           boolean DEFAULT false,
  tags                  text[],
  specifications        jsonb,
  sold_count            int DEFAULT 0,
  average_rating        numeric(3,2) DEFAULT 0,
  review_count          int DEFAULT 0,
  meta_title            text,
  meta_description      text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read products" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage products" ON public.products FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- PRODUCT IMAGES
-- ============================================
CREATE TABLE public.product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt_text    text,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

GRANT SELECT ON public.product_images TO anon;
GRANT SELECT ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read product images" ON public.product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage product images" ON public.product_images FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- PRODUCT VARIANTS
-- ============================================
CREATE TABLE public.product_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_type    text NOT NULL,
  variant_value   text NOT NULL,
  price_modifier  numeric(10,2) DEFAULT 0,
  stock_quantity  int,
  sku_override    text,
  is_available    boolean DEFAULT true,
  sort_order      int DEFAULT 0
);

GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read variants" ON public.product_variants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin can manage variants" ON public.product_variants FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- WISHLIST
-- ============================================
CREATE TABLE public.wishlist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CART ITEMS
-- ============================================
CREATE TABLE public.cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES public.product_variants(id),
  quantity    int NOT NULL DEFAULT 1,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cart" ON public.cart_items FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- ADDRESSES
-- ============================================
CREATE TABLE public.addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        text DEFAULT 'Home',
  full_name    text NOT NULL,
  phone        text,
  line1        text NOT NULL,
  line2        text,
  city         text NOT NULL,
  state        text,
  postal_code  text NOT NULL,
  country      text NOT NULL DEFAULT 'PK',
  is_default   boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text UNIQUE NOT NULL,
  user_id           uuid REFERENCES auth.users(id),
  customer_name     text NOT NULL,
  customer_email    text NOT NULL,
  customer_phone    text,
  shipping_address  jsonb NOT NULL,
  payment_method    text DEFAULT 'cod',
  payment_status    text DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  status            text DEFAULT 'pending' CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  subtotal          numeric(10,2) NOT NULL,
  shipping_cost     numeric(10,2) DEFAULT 0,
  discount          numeric(10,2) DEFAULT 0,
  total             numeric(10,2) NOT NULL,
  tracking_number   text,
  admin_notes       text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin can read all orders" ON public.orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authenticated can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can update orders" ON public.orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- ORDER ITEMS
-- ============================================
CREATE TABLE public.order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id),
  variant_id  uuid REFERENCES public.product_variants(id),
  product_name text NOT NULL,
  variant_info text,
  quantity    int NOT NULL,
  unit_price  numeric(10,2) NOT NULL,
  line_total  numeric(10,2) NOT NULL
);

GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND user_id = auth.uid())
);
CREATE POLICY "Admin can read all order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- PRODUCT REVIEWS
-- ============================================
CREATE TABLE public.product_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id    uuid REFERENCES public.orders(id),
  rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       text,
  body        text,
  is_verified boolean DEFAULT false,
  is_approved boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT ON public.product_reviews TO authenticated;
GRANT INSERT ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read approved reviews" ON public.product_reviews FOR SELECT USING (is_approved = true);
CREATE POLICY "Users can create own reviews" ON public.product_reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can manage reviews" ON public.product_reviews FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- FEEDBACK MESSAGES
-- ============================================
CREATE TABLE public.feedback_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  email        text NOT NULL,
  phone        text,
  subject      text,
  order_ref    text,
  message      text NOT NULL,
  status       text DEFAULT 'unread' CHECK (status IN ('unread','read','replied','archived')),
  created_at   timestamptz DEFAULT now()
);

GRANT INSERT ON public.feedback_messages TO anon;
GRANT INSERT ON public.feedback_messages TO authenticated;
GRANT SELECT, UPDATE ON public.feedback_messages TO authenticated;
GRANT ALL ON public.feedback_messages TO service_role;
ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback" ON public.feedback_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin can read all feedback" ON public.feedback_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can update feedback" ON public.feedback_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- TEAM MEMBERS
-- ============================================
CREATE TABLE public.team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  role       text NOT NULL,
  bio        text,
  avatar_url text,
  sort_order int DEFAULT 0,
  is_visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.team_members TO anon;
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read team members" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Admin can manage team members" ON public.team_members FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================
CREATE TABLE public.newsletter_subscribers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

GRANT INSERT ON public.newsletter_subscribers TO anon;
GRANT INSERT ON public.newsletter_subscribers TO authenticated;
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe" ON public.newsletter_subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin can read subscribers" ON public.newsletter_subscribers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================
-- HELPER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- ============================================
-- SEED DATA
-- ============================================

-- Categories
INSERT INTO public.categories (name, slug, description, sort_order) VALUES
  ('Leather Wallets', 'leather-wallets', 'Handcrafted premium leather wallets', 1),
  ('Leather Bags', 'leather-bags', 'Elegant leather bags for every occasion', 2),
  ('Leather Belts', 'leather-belts', 'Durable full-grain leather belts', 3),
  ('Leather Accessories', 'leather-accessories', 'Premium leather accessories and small goods', 4),
  ('Salt Lamp — Natural', 'salt-lamp-natural', 'Authentic natural Himalayan salt lamps', 5),
  ('Salt Lamp — USB', 'salt-lamp-usb', 'USB-powered Himalayan salt lamps', 6),
  ('Salt Lamp — Decorative', 'salt-lamp-decorative', 'Decorative shaped Himalayan salt lamps', 7),
  ('Salt Lamp — Large', 'salt-lamp-large', 'Large statement Himalayan salt lamps', 8),
  ('Gift Sets', 'gift-sets', 'Curated gift sets for special occasions', 9);

-- Products
INSERT INTO public.products (name, slug, category_id, short_description, full_description, price, sku, stock_quantity, is_featured, is_available, specifications) VALUES
  ('Heritage Bifold Wallet', 'heritage-bifold-wallet', (SELECT id FROM public.categories WHERE slug = 'leather-wallets'), 'Full-grain leather bifold wallet with hand-stitched edges and RFID protection.', 'Crafted from premium full-grain vegetable-tanned leather, the Heritage Bifold Wallet ages beautifully with use. Features 8 card slots, 2 bill compartments, and a hidden pocket. Hand-stitched with waxed nylon thread for durability. RFID-blocking lining protects your cards.', 85.00, 'KAP-LW-001', 24, true, true, '{"Material": "Full-grain vegetable-tanned leather", "Dimensions": "11cm x 9cm x 1.5cm", "Weight": "85g", "Origin": "Pakistan", "Care": "Condition with leather balm every 3 months"}'),
  ('Executive Card Holder', 'executive-card-holder', (SELECT id FROM public.categories WHERE slug = 'leather-wallets'), 'Slim minimalist card holder in rich burgundy leather, perfect for business cards.', 'The Executive Card Holder is designed for the modern professional. Holds up to 12 cards in a slim profile that fits any pocket. Made from Italian-style leather with a satin finish interior.', 45.00, 'KAP-LW-002', 36, false, true, '{"Material": "Italian-style calfskin leather", "Dimensions": "10cm x 7cm x 0.8cm", "Weight": "35g", "Origin": "Pakistan", "Care": "Wipe with damp cloth, avoid direct sunlight"}'),
  ('Weekender Duffel Bag', 'weekender-duffel-bag', (SELECT id FROM public.categories WHERE slug = 'leather-bags'), 'Spacious handcrafted leather duffel bag, ideal for short trips and weekend getaways.', 'The Weekender Duffel is your perfect travel companion. Handcrafted from 3mm full-grain buffalo leather with brass hardware. Features a spacious main compartment, interior zip pocket, and detachable shoulder strap. Water-resistant base lining.', 320.00, 'KAP-LB-001', 12, true, true, '{"Material": "Full-grain buffalo leather", "Dimensions": "52cm x 28cm x 28cm", "Weight": "2.1kg", "Origin": "Pakistan", "Care": "Apply leather wax before travel, store stuffed"}'),
  ('Slim Leather Backpack', 'slim-leather-backpack', (SELECT id FROM public.categories WHERE slug = 'leather-bags'), 'Minimalist leather backpack with laptop compartment and hidden pockets.', 'A sleek everyday backpack crafted from premium cowhide leather. Padded 15-inch laptop sleeve, front quick-access pocket, and anti-theft hidden back pocket. Adjustable shoulder straps with leather pads.', 195.00, 'KAP-LB-002', 18, false, true, '{"Material": "Premium cowhide leather", "Dimensions": "42cm x 30cm x 12cm", "Weight": "1.4kg", "Origin": "Pakistan", "Care": "Condition monthly, protect from rain"}'),
  ('Classic Leather Belt', 'classic-leather-belt', (SELECT id FROM public.categories WHERE slug = 'leather-belts'), 'Timeless full-grain leather belt with a solid brass buckle.', 'A wardrobe staple built to last decades. 3.5cm width full-grain leather strap with hand-burnished edges. Solid brass buckle with antique finish. Available in multiple sizes with 5 adjustment holes.', 65.00, 'KAP-LB-003', 30, false, true, '{"Material": "Full-grain cowhide leather", "Dimensions": "3.5cm width, various lengths", "Weight": "180g", "Origin": "Pakistan", "Care": "Clean with leather cleaner, avoid water exposure"}'),
  ('Leather Key Organizer', 'leather-key-organizer', (SELECT id FROM public.categories WHERE slug = 'leather-accessories'), 'Compact key organizer that holds up to 6 keys in a slim leather case.', 'Say goodbye to jingling keys. The Leather Key Organizer holds up to 6 keys in a compact leather sleeve with a brass screw post. Includes a built-in loop for car fobs. Slim enough for any pocket.', 35.00, 'KAP-LA-001', 48, false, true, '{"Material": "Vegetable-tanned leather", "Dimensions": "8cm x 3.5cm x 1.2cm", "Weight": "40g", "Origin": "Pakistan", "Care": "Occasional leather conditioning"}'),
  ('Natural Salt Lamp — Medium', 'natural-salt-lamp-medium', (SELECT id FROM public.categories WHERE slug = 'salt-lamp-natural'), 'Authentic Himalayan salt lamp on a wooden base, 4–6kg natural salt crystal.', 'Hand-carved from authentic Himalayan pink salt crystals mined in the Khewra Salt Mines of Pakistan. Each lamp is unique in shape and color. Warm amber glow creates a calming atmosphere. Includes a dimmer switch and 15W bulb. Ideal for bedrooms and meditation spaces.', 55.00, 'KAP-SL-001', 20, true, true, '{"Material": "100% Himalayan pink salt", "Dimensions": "15–20cm height", "Weight": "4–6kg", "Origin": "Pakistan", "Care": "Wipe with dry cloth, keep away from moisture"}'),
  ('Natural Salt Lamp — Small', 'natural-salt-lamp-small', (SELECT id FROM public.categories WHERE slug = 'salt-lamp-natural'), 'Compact Himalayan salt lamp, 2–3kg natural crystal with warm glow.', 'A smaller version of our classic natural salt lamp, perfect for desks and small rooms. Hand-selected salt crystal on a polished neem wood base. Includes 15W bulb and on/off switch.', 35.00, 'KAP-SL-002', 28, false, true, '{"Material": "100% Himalayan pink salt", "Dimensions": "10–15cm height", "Weight": "2–3kg", "Origin": "Pakistan", "Care": "Keep dry, wipe with dry cloth"}'),
  ('USB Salt Lamp — Rainbow', 'usb-salt-lamp-rainbow', (SELECT id FROM public.categories WHERE slug = 'salt-lamp-usb'), 'Color-changing USB salt lamp, perfect for your workspace or night light.', 'Plug into any USB port for an instant calming glow. This compact salt lamp cycles through rainbow colors or stays on your favorite hue. Powered by USB with LED lighting. Great for offices and dorm rooms.', 25.00, 'KAP-SU-001', 40, false, true, '{"Material": "Himalayan pink salt crystal", "Dimensions": "8cm x 8cm", "Weight": "600g", "Origin": "Pakistan", "Care": "USB powered, keep dry"}'),
  ('Pyramid Salt Lamp', 'pyramid-salt-lamp', (SELECT id FROM public.categories WHERE slug = 'salt-lamp-decorative'), 'Hand-carved pyramid-shaped Himalayan salt lamp with a striking amber glow.', 'A stunning geometric salt lamp hand-carved into a pyramid shape. The angular facets create beautiful light patterns. Set on a polished wooden base with a dimmer switch. A statement piece for any room.', 75.00, 'KAP-SD-001', 15, true, true, '{"Material": "Himalayan pink salt", "Dimensions": "18cm x 18cm x 18cm", "Weight": "5–7kg", "Origin": "Pakistan", "Care": "Display indoors, avoid humidity"}'),
  ('Large Statement Salt Lamp', 'large-statement-salt-lamp', (SELECT id FROM public.categories WHERE slug = 'salt-lamp-large'), 'Impressive 10–12kg Himalayan salt lamp, a centerpiece for any living space.', 'Our largest natural salt lamp makes a dramatic statement. Weighing 10–12kg, this substantial crystal sits on a hand-crafted solid wood base. The warm glow fills an entire room. Includes heavy-duty dimmer and 25W bulb.', 120.00, 'KAP-LL-001', 8, false, true, '{"Material": "100% Himalayan pink salt", "Dimensions": "25–30cm height", "Weight": "10–12kg", "Origin": "Pakistan", "Care": "Keep in dry environment, wipe with dry cloth"}'),
  ('Salt Lamp Gift Set', 'salt-lamp-gift-set', (SELECT id FROM public.categories WHERE slug = 'gift-sets'), 'Curated gift set with a medium salt lamp, tealight candle holder, and essential oil.', 'The perfect introduction to Himalayan salt wellness. This elegant gift box includes a medium natural salt lamp, a heart-shaped salt tealight holder, and a bottle of lavender essential oil. Beautifully packaged in a black and gold KAPTAN gift box.', 89.00, 'KAP-GS-001', 16, false, true, '{"Contents": "Medium salt lamp, tealight holder, lavender oil", "Dimensions": "Gift box 30cm x 25cm x 20cm", "Weight": "6kg total", "Origin": "Pakistan", "Care": "Keep contents dry"}');

-- Product Images
INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1627123424574-181ce5171c98?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'heritage-bifold-wallet';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'executive-card-holder';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'weekender-duffel-bag';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'slim-leather-backpack';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'classic-leather-belt';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'leather-key-organizer';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'natural-salt-lamp-medium';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'natural-salt-lamp-small';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'usb-salt-lamp-rainbow';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'pyramid-salt-lamp';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'large-statement-salt-lamp';

INSERT INTO public.product_images (product_id, url, alt_text, sort_order)
SELECT p.id, 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=800&q=80', p.name || ' - main image', 0
FROM public.products p WHERE p.slug = 'salt-lamp-gift-set';

-- Team Members
INSERT INTO public.team_members (name, role, bio, sort_order, is_visible) VALUES
  ('Ahmad Kaptan', 'Founder & CEO', 'Visionary entrepreneur with a passion for authentic craftsmanship and Himalayan heritage.', 1, true),
  ('Fatima Noor', 'Head of Craftsmanship', 'Master leather artisan with 15 years of experience in premium tanneries.', 2, true),
  ('Zara Malik', 'Customer Experience Lead', 'Dedicated to ensuring every KAPTAN customer feels valued and heard.', 3, true);

-- Newsletter
INSERT INTO public.newsletter_subscribers (email) VALUES ('demo@kaptan.store');
