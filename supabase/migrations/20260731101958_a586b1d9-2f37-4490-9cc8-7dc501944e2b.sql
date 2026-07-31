-- ============================================
-- JOURNAL / EDITORIAL CONTENT (brand storytelling section)
-- ============================================
CREATE TABLE public.journal_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  excerpt        text,
  body           text NOT NULL DEFAULT '',
  cover_image_url text,
  category       text,
  author_name    text NOT NULL DEFAULT 'KAPTAN Atelier',
  is_published   boolean NOT NULL DEFAULT false,
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX journal_posts_published_idx ON public.journal_posts (is_published, published_at DESC);

COMMENT ON TABLE public.journal_posts IS
  'Editorial/journal content (craftsmanship stories, origin notes, care guides) for the storefront /journal section.';
COMMENT ON COLUMN public.journal_posts.body IS
  'Plain text with blank-line paragraph breaks — rendered as paragraphs client-side, no HTML/markdown parsing.';

ALTER TABLE public.journal_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published posts" ON public.journal_posts FOR SELECT TO anon, authenticated USING (is_published = true);
CREATE POLICY "Admin can read all posts" ON public.journal_posts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can manage posts" ON public.journal_posts FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

GRANT SELECT ON public.journal_posts TO anon;
GRANT ALL ON public.journal_posts TO authenticated;
GRANT ALL ON public.journal_posts TO service_role;

CREATE OR REPLACE FUNCTION public.set_journal_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_posts_set_updated_at
  BEFORE UPDATE ON public.journal_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_journal_updated_at();
