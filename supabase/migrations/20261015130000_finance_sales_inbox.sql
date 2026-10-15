BEGIN;
CREATE TABLE public.finance_sales_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id),
 invoice_number text NOT NULL, kind text NOT NULL, order_id uuid NOT NULL REFERENCES public.orders(id),
 created_at timestamptz NOT NULL DEFAULT now(), journal_id uuid UNIQUE REFERENCES public.finance_journals(id),
 attempts integer NOT NULL DEFAULT 0, last_error text
);
ALTER TABLE public.finance_sales_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_sales_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_sales_events TO authenticated;
CREATE POLICY finance_sales_read ON public.finance_sales_events FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL);
CREATE FUNCTION public.finance_sales_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Sales event history cannot be deleted'; END IF;
 IF OLD.journal_id IS NOT NULL OR (to_jsonb(OLD)-'journal_id'-'attempts'-'last_error') IS DISTINCT FROM (to_jsonb(NEW)-'journal_id'-'attempts'-'last_error') THEN RAISE EXCEPTION 'Sales source is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_sales_guard BEFORE UPDATE OR DELETE ON public.finance_sales_events FOR EACH ROW EXECUTE FUNCTION public.finance_sales_guard();
CREATE FUNCTION public.finance_capture_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.state='issued' THEN
  INSERT INTO public.finance_sales_events(invoice_id,invoice_number,kind,order_id) VALUES(NEW.id,NEW.number,NEW.kind,NEW.order_id) ON CONFLICT(invoice_id) DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER finance_invoice_outbox AFTER INSERT OR UPDATE OF state ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.finance_capture_invoice();
-- Explicit rescan collects existing issued invoices for review; it NEVER posts them.
CREATE FUNCTION public.finance_sales_rescan() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF public.finance_role() IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO public.finance_sales_events(invoice_id,invoice_number,kind,order_id) SELECT id,number,kind,order_id FROM public.invoices WHERE state='issued' ON CONFLICT(invoice_id) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'sales_rescan','invoices',jsonb_build_object('count',n));
 RETURN n;
END $$;
CREATE FUNCTION public.finance_sales_import(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_sales_events; i public.invoices; v_total bigint; jid uuid; failure text;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO e FROM public.finance_sales_events WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF e.journal_id IS NOT NULL THEN RETURN jsonb_build_object('journalId',e.journal_id,'error',NULL); END IF;
 BEGIN
  SELECT * INTO i FROM public.invoices WHERE id=e.invoice_id;
  IF i.state IS DISTINCT FROM 'issued' OR i.kind<>'advance' THEN RAISE EXCEPTION 'Only issued advance invoices are supported by this importer; final invoices and credits need separate review'; END IF;
  IF i.model->>'taxMode' IS DISTINCT FROM 'kleinunternehmer' OR i.source->'order'->'tax_data'->>'currency' IS DISTINCT FROM 'EUR' THEN RAISE EXCEPTION 'Tax mode or currency needs accountant review'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.order_checkouts WHERE order_id=e.order_id AND state='paid' AND provider_id IS NOT NULL AND provider_kind IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=e.order_id AND payment_status='paid') THEN RAISE EXCEPTION 'Verified checkout settlement missing or order no longer fully paid'; END IF;
  IF coalesce(i.model->>'gross','')!~'^[0-9]{1,13}$' OR coalesce(i.model->>'rounding','')!~'^-?[0-9]{1,13}$' THEN RAISE EXCEPTION 'Invalid invoice cents'; END IF;
  v_total=(i.model->>'gross')::bigint+(i.model->>'rounding')::bigint;
  IF v_total<=0 OR v_total>9000000000000 THEN RAISE EXCEPTION 'Invalid invoice total'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=e.order_id AND o.total=v_total::numeric/100) THEN RAISE EXCEPTION 'Invoice and order totals differ'; END IF;
  jid=public.finance_submit('store-advance:'||e.order_id,(i.model->>'paidDate')::date,'Customer advance: '||e.invoice_number,jsonb_build_object('reference',i.id::text,'kind','verified_store_advance'),jsonb_build_array(
   jsonb_build_object('account','CLEARING','debit',v_total::text,'credit','0'),jsonb_build_object('account','ADVANCES','debit','0','credit',v_total::text)));
  PERFORM public.finance_post(jid);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 END;
 IF failure IS NOT NULL THEN
  UPDATE public.finance_sales_events SET attempts=attempts+1,last_error=left(failure,500) WHERE id=p_id;
  INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'sales_import_failed',p_id::text,jsonb_build_object('reason',left(failure,500)));
  RETURN jsonb_build_object('journalId',NULL,'error',left(failure,500));
 END IF;
 UPDATE public.finance_sales_events SET attempts=attempts+1,last_error=NULL,journal_id=jid WHERE id=p_id;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'sales_advance_imported',p_id::text);
 RETURN jsonb_build_object('journalId',jid,'error',NULL);
END $$;
CREATE FUNCTION public.finance_sales_list(p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (
 SELECT e.*,i.model->>'paidDate' paid_date,i.model->>'gross' gross,i.model->>'rounding' rounding,i.source->'order'->'tax_data'->>'currency' currency,i.model->>'taxMode' tax_mode
 FROM public.finance_sales_events e JOIN public.invoices i ON i.id=e.invoice_id ORDER BY e.created_at DESC,e.id LIMIT 30 OFFSET p_page*30
 ) e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.finance_sales_guard(),public.finance_capture_invoice(),public.finance_sales_rescan(),public.finance_sales_import(uuid),public.finance_sales_list(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_sales_rescan(),public.finance_sales_import(uuid),public.finance_sales_list(integer) TO authenticated;
CREATE FUNCTION public.finance_sales_original(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invoices;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT x.* INTO i FROM public.invoices x JOIN public.finance_sales_events e ON e.invoice_id=x.id WHERE e.id=p_id AND x.state='issued';
 IF NOT FOUND THEN RAISE EXCEPTION 'Issued original not found'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'sales_invoice_access',i.id::text);
 RETURN jsonb_build_object('number',i.number,'pdf',i.pdf_base64);
END $$;
REVOKE ALL ON FUNCTION public.finance_sales_original(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_sales_original(uuid) TO authenticated;
COMMIT;
