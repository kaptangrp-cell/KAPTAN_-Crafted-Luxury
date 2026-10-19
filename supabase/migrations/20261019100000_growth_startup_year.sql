-- Preserve existing plans and add a rolling first-year planning slot.
BEGIN;
ALTER TABLE public.growth_plans DROP CONSTRAINT growth_plans_period_check;
ALTER TABLE public.growth_plans ADD CONSTRAINT growth_plans_period_check CHECK (period IN ('60days','firstyear','2027'));
COMMIT;
