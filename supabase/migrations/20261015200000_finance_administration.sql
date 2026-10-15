BEGIN;
CREATE TABLE public.finance_suppliers(id uuid PRIMARY KEY,name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 200),country text NOT NULL CHECK(country~'^[A-Z]{2}$'),tax_id text NOT NULL DEFAULT '',email text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.finance_document_retention(document_id uuid PRIMARY KEY REFERENCES public.finance_documents(id),record_class text NOT NULL DEFAULT 'unclassified' CHECK(record_class IN ('unclassified','accounting_book','accounting_voucher','correspondence')),retain_until date,legal_hold boolean NOT NULL DEFAULT true,reason text NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
-- No deletion endpoint is created: retention expiry never automatically deletes evidence.
CREATE TABLE public.finance_extractions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES public.finance_documents(id),engine text NOT NULL,source_hash text NOT NULL,result jsonb NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(document_id,engine,source_hash));
CREATE TRIGGER finance_extraction_guard BEFORE UPDATE OR DELETE ON public.finance_extractions FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['finance_suppliers','finance_document_retention','finance_extractions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);EXECUTE format('CREATE POLICY finance_read ON public.%I FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL)',t);
END LOOP;END $$;
CREATE FUNCTION public.finance_supplier_save(p_id uuid,p_revision integer,p_name text,p_country text,p_tax_id text,p_email text,p_address text,p_active boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.finance_suppliers;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant','staff') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(p_tax_id)>80 OR length(p_email)>254 OR length(p_address)>1000 OR p_active IS NULL THEN RAISE EXCEPTION 'Supplier fields too long or incomplete'; END IF;
 SELECT * INTO old FROM public.finance_suppliers WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF old.revision<>p_revision THEN RAISE EXCEPTION 'Supplier changed; reload before saving'; END IF;
  IF NOT p_active AND public.finance_role()='staff' THEN RAISE EXCEPTION 'Owner or accountant must archive supplier'; END IF;
  UPDATE public.finance_suppliers SET name=trim(p_name),country=p_country,tax_id=trim(p_tax_id),email=trim(p_email),address=trim(p_address),active=p_active,revision=revision+1,updated_at=now() WHERE id=p_id;
 ELSE
  IF p_revision<>0 OR NOT p_active THEN RAISE EXCEPTION 'New supplier must be active with revision zero'; END IF;
  INSERT INTO public.finance_suppliers(id,name,country,tax_id,email,address) VALUES(p_id,trim(p_name),p_country,trim(p_tax_id),trim(p_email),trim(p_address));
 END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'supplier_saved',p_id::text,jsonb_build_object('previous',CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old)::text END,'revision',coalesce(old.revision,0)+1));
 RETURN p_id;
END $$;
CREATE FUNCTION public.finance_retention_save(p_document uuid,p_revision integer,p_class text,p_until date,p_hold boolean,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.finance_document_retention;created date;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 OR p_hold IS NULL THEN RAISE EXCEPTION 'Review reason and hold decision required'; END IF;
 SELECT created_at::date INTO created FROM public.finance_documents WHERE id=p_document FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF p_until IS NULL OR p_until<created THEN RAISE EXCEPTION 'Choose a reviewed retention end date'; END IF;
 SELECT * INTO old FROM public.finance_document_retention WHERE document_id=p_document;
 IF (old.document_id IS NULL AND p_revision<>0) OR (old.document_id IS NOT NULL AND p_revision<>old.revision) THEN RAISE EXCEPTION 'Retention changed; reload'; END IF;
 INSERT INTO public.finance_document_retention(document_id,record_class,retain_until,legal_hold,reason) VALUES(p_document,p_class,p_until,p_hold,trim(p_reason)) ON CONFLICT(document_id) DO UPDATE SET record_class=EXCLUDED.record_class,retain_until=EXCLUDED.retain_until,legal_hold=EXCLUDED.legal_hold,reason=EXCLUDED.reason,revision=finance_document_retention.revision+1,updated_at=now();
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'retention_reviewed',p_document::text,jsonb_build_object('class',p_class,'until',p_until,'hold',p_hold,'reason',p_reason,'previous',CASE WHEN old.document_id IS NULL THEN NULL ELSE to_jsonb(old)::text END));
END $$;
CREATE FUNCTION public.finance_create_year(p_year integer,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF public.finance_role() IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_year NOT BETWEEN 2026 AND 2100 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Valid calendar year and reason required'; END IF;
 INSERT INTO public.finance_periods(id) SELECT make_date(p_year,m,1) FROM generate_series(1,12)m ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'fiscal_year_created',p_year::text,jsonb_build_object('monthsAdded',n,'reason',p_reason));
END $$;
CREATE FUNCTION public.finance_extraction_save(p_actor uuid,p_document uuid,p_engine text,p_hash text,p_result jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin') AND NOT EXISTS(SELECT 1 FROM public.finance_members WHERE user_id=p_actor AND role IN ('accountant','staff')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready' AND sha256=p_hash) THEN RAISE EXCEPTION 'Original fingerprint mismatch'; END IF;
 IF length(p_engine)>100 OR length(p_result::text)>4200000 THEN RAISE EXCEPTION 'Invalid extraction'; END IF;
 INSERT INTO public.finance_extractions(document_id,engine,source_hash,result,created_by) VALUES(p_document,p_engine,p_hash,p_result,p_actor) ON CONFLICT(document_id,engine,source_hash) DO NOTHING RETURNING id INTO eid;
 IF eid IS NULL THEN SELECT id INTO eid FROM public.finance_extractions WHERE document_id=p_document AND engine=p_engine AND source_hash=p_hash; END IF;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(p_actor,'structured_invoice_extracted',p_document::text);
 RETURN eid;
END $$;
CREATE FUNCTION public.finance_administration(p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(p_search)>200 THEN RAISE EXCEPTION 'Search too long'; END IF;
 RETURN jsonb_build_object('suppliers',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM public.finance_suppliers WHERE name ILIKE '%'||p_search||'%' OR tax_id ILIKE '%'||p_search||'%' ORDER BY name,id LIMIT 100)s),'[]'::jsonb),'years',coalesce((SELECT jsonb_agg(to_jsonb(y)) FROM (SELECT extract(year FROM id)::integer AS "year",count(*)::integer months,count(*) FILTER(WHERE closed)::integer closed FROM public.finance_periods GROUP BY 1 ORDER BY 1)y),'[]'::jsonb));
END $$;
CREATE FUNCTION public.finance_document_details(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('retention',(SELECT to_jsonb(r) FROM public.finance_document_retention r WHERE document_id=p_id),'extractions',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,engine,result,created_at FROM public.finance_extractions WHERE document_id=p_id ORDER BY created_at DESC LIMIT 10)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_supplier_save(uuid,integer,text,text,text,text,text,boolean),public.finance_retention_save(uuid,integer,text,date,boolean,text),public.finance_create_year(integer,text),public.finance_extraction_save(uuid,uuid,text,text,jsonb),public.finance_administration(text),public.finance_document_details(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_supplier_save(uuid,integer,text,text,text,text,text,boolean),public.finance_retention_save(uuid,integer,text,date,boolean,text),public.finance_create_year(integer,text),public.finance_administration(text),public.finance_document_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_extraction_save(uuid,uuid,text,text,jsonb) TO service_role;
COMMIT;
