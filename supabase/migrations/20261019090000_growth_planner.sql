BEGIN;
CREATE TABLE public.growth_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period text NOT NULL UNIQUE CHECK(period IN ('60days','2027')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<200000),
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.growth_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES public.growth_plans(id) ON DELETE CASCADE,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<20000),
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id)
);
CREATE INDEX growth_actions_plan_idx ON public.growth_actions(plan_id);
CREATE FUNCTION public.growth_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.revision=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.revision+1 END;
 NEW.updated_at=now(); NEW.updated_by=auth.uid();
 RETURN NEW;
END $$;
CREATE TRIGGER growth_plans_revision BEFORE INSERT OR UPDATE ON public.growth_plans FOR EACH ROW EXECUTE FUNCTION public.growth_revision();
CREATE TRIGGER growth_actions_revision BEFORE INSERT OR UPDATE ON public.growth_actions FOR EACH ROW EXECUTE FUNCTION public.growth_revision();
ALTER TABLE public.growth_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_plans,public.growth_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.growth_plans,public.growth_actions TO authenticated;
GRANT ALL ON public.growth_plans,public.growth_actions TO service_role;
CREATE POLICY growth_admin ON public.growth_plans FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY growth_admin ON public.growth_actions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK(public.is_admin());
COMMIT;
