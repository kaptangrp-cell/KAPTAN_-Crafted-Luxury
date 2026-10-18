-- Privacy defaults: no implicit marketing subscription or public visitor tracking.
BEGIN;
ALTER TABLE public.profiles ALTER COLUMN email_marketing SET DEFAULT false;
-- Legacy true values were defaulted, not evidence of an affirmative choice.
-- Preserve customer/accounting records; require a fresh marketing choice.
UPDATE public.profiles SET email_marketing = false WHERE email_marketing IS DISTINCT FROM false;
REVOKE INSERT ON public.site_visits FROM anon, authenticated;
REVOKE INSERT ON public.newsletter_subscribers FROM anon, authenticated;
-- The unused newsletter endpoint must not accept unverified subscriptions.
COMMIT;
