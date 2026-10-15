BEGIN;
INSERT INTO public.finance_accounts(code,name_de,name_en,kind) VALUES
('FIXED_ASSETS','Sachanlagen','Fixed assets','asset'),('ACCUM_DEP','Kumulierte Abschreibungen','Accumulated depreciation','asset'),('DEPRECIATION','Abschreibungen','Depreciation','expense');
CREATE TABLE public.finance_assets(
 id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES public.finance_documents(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES public.finance_journals(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 200),cost bigint NOT NULL CHECK(cost BETWEEN 1 AND 9000000000000),
 start_date date NOT NULL,months integer NOT NULL CHECK(months BETWEEN 1 AND 1200),
 basis text NOT NULL CHECK(length(trim(basis)) BETWEEN 10 AND 1000),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_asset_depreciation(
 asset_id uuid NOT NULL REFERENCES public.finance_assets(id),through_date date NOT NULL,
 amount bigint NOT NULL CHECK(amount>0),journal_id uuid NOT NULL UNIQUE REFERENCES public.finance_journals(id),
 PRIMARY KEY(asset_id,through_date)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['finance_assets','finance_asset_depreciation'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY finance_read ON public.%I FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL)',t);
 EXECUTE format('CREATE TRIGGER finance_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard()',t);
END LOOP;END $$;
-- Registration attaches to a reviewed capitalization already posted in the ledger, never a second purchase.
CREATE FUNCTION public.finance_asset_register(p_id uuid,p_document uuid,p_journal uuid,p_name text,p_start date,p_months integer,p_basis text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.finance_journals;a public.finance_assets;c bigint;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('asset:'||p_journal,0));
 SELECT * INTO a FROM public.finance_assets WHERE id=p_id;
 IF FOUND THEN
  IF (a.document_id,a.journal_id,a.name,a.start_date,a.months,a.basis) IS DISTINCT FROM (p_document,p_journal,trim(p_name),p_start,p_months,trim(p_basis)) THEN RAISE EXCEPTION 'Retry content differs';END IF;
  RETURN p_id;
 END IF;
 SELECT * INTO j FROM public.finance_journals WHERE id=p_journal FOR UPDATE;
 IF NOT FOUND OR j.status<>'posted' OR j.reversal_of IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p_journal) THEN RAISE EXCEPTION 'Unreversed posted capitalization required';END IF;
 IF j.source->>'reference' IS DISTINCT FROM p_document::text OR NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready') THEN RAISE EXCEPTION 'Capitalization must reference the preserved original UUID';END IF;
 IF p_start<j.booking_date OR p_start>(now() AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Invalid in-service date';END IF;
 SELECT sum(debit-credit) INTO c FROM public.finance_lines WHERE journal_id=p_journal AND account='FIXED_ASSETS';
 IF c IS NULL OR c<=0 OR EXISTS(SELECT 1 FROM public.finance_lines WHERE journal_id=p_journal AND account='FIXED_ASSETS' AND credit>0) THEN RAISE EXCEPTION 'Positive FIXED_ASSETS capitalization required';END IF;
 INSERT INTO public.finance_assets VALUES(p_id,p_document,p_journal,trim(p_name),c,p_start,p_months,trim(p_basis),auth.uid(),now());
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'asset_registered',p_id::text);
 RETURN p_id;
END $$;
CREATE FUNCTION public.finance_asset_amount(p_cost bigint,p_start date,p_months integer,p_through date) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
 SELECT floor(p_cost::numeric * least(p_months,greatest(0,(extract(year FROM p_through)::int-extract(year FROM p_start)::int)*12+extract(month FROM p_through)::int-extract(month FROM p_start)::int+1))/p_months)::bigint
$$;
CREATE FUNCTION public.finance_asset_depreciate(p_id uuid,p_through date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.finance_assets;paid bigint;delta bigint;jid uuid;last_date date;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden';END IF;
 SELECT * INTO a FROM public.finance_assets WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found';END IF;
 SELECT journal_id INTO jid FROM public.finance_asset_depreciation WHERE asset_id=p_id AND through_date=p_through;IF FOUND THEN RETURN jid;END IF;
 IF p_through IS NULL OR p_through<>(date_trunc('month',p_through)+interval '1 month - 1 day')::date OR p_through>(now() AT TIME ZONE 'Europe/Berlin')::date OR p_through<a.start_date THEN RAISE EXCEPTION 'Choose a completed month end after in-service date';END IF;
 SELECT coalesce(sum(amount),0),max(through_date) INTO paid,last_date FROM public.finance_asset_depreciation WHERE asset_id=p_id;
 IF last_date IS NOT NULL AND p_through<=last_date THEN RAISE EXCEPTION 'Depreciation must move forwards';END IF;
 -- Do not catch up across a year boundary: first complete each earlier year separately.
 IF extract(year FROM coalesce(last_date,a.start_date))<extract(year FROM p_through) AND coalesce(last_date,a.start_date)<>make_date(extract(year FROM p_through)::int-1,12,31) THEN RAISE EXCEPTION 'Complete the earlier calendar year first';END IF;
 delta=public.finance_asset_amount(a.cost,a.start_date,a.months,p_through)-paid;
 IF delta<=0 THEN RAISE EXCEPTION 'No depreciation remaining';END IF;
 jid=public.finance_submit('asset-depreciation:'||p_id||':'||p_through,p_through,'Linear depreciation: '||a.name,jsonb_build_object('reference',a.document_id::text,'kind','asset_depreciation','asset',p_id::text),jsonb_build_array(jsonb_build_object('account','DEPRECIATION','debit',delta::text,'credit','0'),jsonb_build_object('account','ACCUM_DEP','debit','0','credit',delta::text)));
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_asset_depreciation VALUES(p_id,p_through,delta,jid);
 RETURN jid;
END $$;
CREATE FUNCTION public.finance_asset_reversal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.reversal_of IS NOT NULL AND (EXISTS(SELECT 1 FROM public.finance_assets WHERE journal_id=NEW.reversal_of) OR EXISTS(SELECT 1 FROM public.finance_asset_depreciation WHERE journal_id=NEW.reversal_of)) THEN RAISE EXCEPTION 'Asset-linked journal requires a coordinated correction';END IF;RETURN NEW;
END $$;
CREATE TRIGGER finance_asset_reversal BEFORE INSERT ON public.finance_journals FOR EACH ROW EXECUTE FUNCTION public.finance_asset_reversal_guard();
CREATE FUNCTION public.finance_assets_list(p_through date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden';END IF;
 IF (SELECT count(*) FROM public.finance_assets)>1000 THEN RAISE EXCEPTION 'Asset register exceeds interactive limit; use ledger export';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT a.id,a.name,a.document_id,a.journal_id,a.start_date,a.months,a.basis,a.cost::text cost,coalesce(sum(d.amount),0)::text depreciated,(a.cost-coalesce(sum(d.amount),0))::text book_value,greatest(0,public.finance_asset_amount(a.cost,a.start_date,a.months,p_through)-coalesce(sum(d.amount),0))::text proposed,max(d.through_date) last_date FROM public.finance_assets a LEFT JOIN public.finance_asset_depreciation d ON d.asset_id=a.id GROUP BY a.id ORDER BY a.created_at DESC)r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.finance_asset_register(uuid,uuid,uuid,text,date,integer,text),public.finance_asset_amount(bigint,date,integer,date),public.finance_asset_depreciate(uuid,date),public.finance_asset_reversal_guard(),public.finance_assets_list(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_asset_register(uuid,uuid,uuid,text,date,integer,text),public.finance_asset_depreciate(uuid,date),public.finance_assets_list(date) TO authenticated;
COMMIT;
