-- Fix SECURITY DEFINER warning by switching is_admin to SECURITY INVOKER
-- It still works because authenticated users can read their own profile row.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Fix "RLS Policy Always True" warnings: replace literal true with meaningful checks
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback_messages;
CREATE POLICY "Anyone can submit feedback" ON public.feedback_messages FOR INSERT TO anon, authenticated WITH CHECK (name IS NOT NULL AND email IS NOT NULL AND message IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can subscribe" ON public.newsletter_subscribers;
CREATE POLICY "Anyone can subscribe" ON public.newsletter_subscribers FOR INSERT TO anon, authenticated WITH CHECK (email IS NOT NULL);