-- ============================================
-- PRODUCT COST PRICE (for profit reporting)
-- ============================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric(10,2);

COMMENT ON COLUMN public.products.cost_price IS
  'Per-unit cost (COGS) used to compute profit in the admin dashboard. Null until an admin fills it in.';

-- ============================================
-- SITE VISITS (lightweight traffic tracking for conversion rate)
-- ============================================
CREATE TABLE public.site_visits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  path       text,
  referrer   text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX site_visits_created_at_idx ON public.site_visits (created_at);
CREATE INDEX site_visits_session_id_idx ON public.site_visits (session_id);

GRANT INSERT ON public.site_visits TO anon;
GRANT INSERT ON public.site_visits TO authenticated;
GRANT ALL ON public.site_visits TO service_role;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous shoppers) can log a visit, but only admins
-- can read the raw visit log back out — it's only ever aggregated
-- server-side for the admin dashboard via the service role.
CREATE POLICY "Anyone can log a visit" ON public.site_visits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin can read visits" ON public.site_visits FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
