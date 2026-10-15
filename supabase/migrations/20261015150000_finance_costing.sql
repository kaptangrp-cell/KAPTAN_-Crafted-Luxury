BEGIN;
INSERT INTO public.finance_accounts(code,name_de,name_en,kind) VALUES('WRITE_OFF','Bestandsabschreibungen','Inventory write-offs','expense');
CREATE TABLE public.finance_shipments(id uuid PRIMARY KEY,reference text NOT NULL,supplier text NOT NULL,booking_date date NOT NULL,payload jsonb NOT NULL,journal_id uuid NOT NULL UNIQUE REFERENCES public.finance_journals(id),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.finance_unit_costs(unit_id uuid PRIMARY KEY REFERENCES public.inventory_units(id),shipment_id uuid NOT NULL REFERENCES public.finance_shipments(id),cost bigint NOT NULL CHECK(cost>=0 AND cost<=9000000000000));
CREATE TABLE public.finance_cost_documents(document_id uuid PRIMARY KEY REFERENCES public.finance_documents(id),shipment_id uuid NOT NULL REFERENCES public.finance_shipments(id));
CREATE TABLE public.finance_stock_events(id bigint PRIMARY KEY REFERENCES public.inventory_events(id),unit_id uuid NOT NULL REFERENCES public.inventory_units(id),created_at timestamptz NOT NULL,old_state text,new_state text NOT NULL,journal_id uuid UNIQUE REFERENCES public.finance_journals(id),processed_at timestamptz,attempts integer NOT NULL DEFAULT 0,last_error text,delta bigint);
CREATE FUNCTION public.finance_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted cost records are immutable; use an accountant-reviewed correction'; END $$;
CREATE TRIGGER finance_shipment_guard BEFORE UPDATE OR DELETE ON public.finance_shipments FOR EACH ROW EXECUTE FUNCTION public.finance_cost_guard();
CREATE TRIGGER finance_unit_cost_guard BEFORE UPDATE OR DELETE ON public.finance_unit_costs FOR EACH ROW EXECUTE FUNCTION public.finance_cost_guard();
CREATE TRIGGER finance_cost_doc_guard BEFORE UPDATE OR DELETE ON public.finance_cost_documents FOR EACH ROW EXECUTE FUNCTION public.finance_cost_guard();
CREATE FUNCTION public.finance_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stock event history cannot be deleted'; END IF;
 IF OLD.processed_at IS NOT NULL OR (to_jsonb(OLD)-'journal_id'-'processed_at'-'attempts'-'last_error'-'delta') IS DISTINCT FROM (to_jsonb(NEW)-'journal_id'-'processed_at'-'attempts'-'last_error'-'delta') THEN RAISE EXCEPTION 'Stock event source is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_stock_guard BEFORE UPDATE OR DELETE ON public.finance_stock_events FOR EACH ROW EXECUTE FUNCTION public.finance_stock_guard();
CREATE FUNCTION public.finance_capture_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.old_state IS DISTINCT FROM NEW.new_state THEN
 INSERT INTO public.finance_stock_events(id,unit_id,created_at,old_state,new_state) VALUES(NEW.id,NEW.unit_id,NEW.created_at,NEW.old_state,NEW.new_state) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER finance_stock_capture AFTER INSERT ON public.inventory_events FOR EACH ROW EXECUTE FUNCTION public.finance_capture_stock();
-- Costing creates no warehouse receipt or stock change. The scan subsystem remains authoritative.
CREATE FUNCTION public.finance_shipment_post(p_actor uuid,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid:=(p_data->>'id')::uuid; existing public.finance_shipments; item jsonb; jid uuid; total numeric; uid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin') AND NOT EXISTS(SELECT 1 FROM public.finance_members WHERE user_id=p_actor AND role='accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 -- finance_submit verifies this identity too; this function is service-only and actor is obtained from the authenticated server.
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-cost-documents',0));
 SELECT * INTO existing FROM public.finance_shipments WHERE id=sid;
 IF FOUND THEN IF existing.payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN existing.journal_id; END IF;
 IF jsonb_array_length(p_data->'allocations') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid allocations'; END IF;
 total=(p_data->>'total')::numeric;
 IF total<=0 OR total>9000000000000 OR total<>(SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(p_data->'allocations') a) OR total<>(SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(p_data->'components') a) THEN RAISE EXCEPTION 'Cost allocation does not reconcile'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_data->'components') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=(item->>'document')::uuid AND state='ready') THEN RAISE EXCEPTION 'Ready original required'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_expenses WHERE document_id=(item->>'document')::uuid AND journal_id IS NOT NULL) THEN RAISE EXCEPTION 'Document already posted as expense'; END IF;
 END LOOP;
 FOR uid IN SELECT (a->>'id')::uuid FROM jsonb_array_elements(p_data->'allocations') a ORDER BY a->>'id' LOOP
  PERFORM 1 FROM public.inventory_units WHERE id=uid AND state IN ('available','reserved','packed') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only received, not yet dispatched QR units can receive opening cost'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_events WHERE unit_id=uid AND new_state IN ('dispatched','sold','damaged')) THEN RAISE EXCEPTION 'Unit has prior outbound history; historical cost requires separate reconstruction'; END IF;
 END LOOP;
 jid=public.finance_submit('shipment:'||sid,(p_data->>'date')::date,'Import: '||(p_data->>'reference'),jsonb_build_object('reference',sid::text,'kind','inventory_purchase'),jsonb_build_array(jsonb_build_object('account','STOCK','debit',total::text,'credit','0'),jsonb_build_object('account','AP','debit','0','credit',total::text)));
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_shipments VALUES(sid,p_data->>'reference',p_data->>'supplier',(p_data->>'date')::date,p_data,jid,p_actor,now());
 INSERT INTO public.finance_unit_costs SELECT (a->>'id')::uuid,sid,(a->>'amount')::bigint FROM jsonb_array_elements(p_data->'allocations') a;
 INSERT INTO public.finance_cost_documents SELECT DISTINCT (a->>'document')::uuid,sid FROM jsonb_array_elements(p_data->'components') a;
 -- Earlier non-outbound events are already represented by the reviewed opening cost.
 UPDATE public.finance_stock_events SET processed_at=now(),delta=0,last_error=NULL,attempts=attempts+1 WHERE unit_id IN (SELECT unit_id FROM public.finance_unit_costs WHERE shipment_id=sid) AND processed_at IS NULL;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(p_actor,'shipment_costed',sid::text);
 RETURN jid;
END $$;
-- Stop posting the same original through expenses after capitalizing its cost.
CREATE FUNCTION public.finance_prevent_cost_expense() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.journal_id IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-cost-documents',0));
 IF EXISTS(SELECT 1 FROM public.finance_cost_documents WHERE document_id=NEW.document_id) THEN RAISE EXCEPTION 'Original already capitalized in inventory'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER finance_expense_cost_check BEFORE INSERT OR UPDATE ON public.finance_expenses FOR EACH ROW EXECUTE FUNCTION public.finance_prevent_cost_expense();
CREATE FUNCTION public.finance_stock_process(p_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_stock_events;c public.finance_unit_costs;current_cost bigint;change bigint:=0;jid uuid;failure text;day date;expense text:='COGS';
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO e FROM public.finance_stock_events WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event missing'; END IF;
 PERFORM 1 FROM public.inventory_units WHERE id=e.unit_id FOR UPDATE;
 SELECT * INTO e FROM public.finance_stock_events WHERE id=p_id FOR UPDATE;
 IF e.processed_at IS NOT NULL THEN RETURN jsonb_build_object('error',NULL); END IF;
 BEGIN
 SELECT * INTO c FROM public.finance_unit_costs WHERE unit_id=e.unit_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing historical unit cost'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_stock_events WHERE unit_id=e.unit_id AND id<e.id AND processed_at IS NULL) THEN RAISE EXCEPTION 'Process earlier unit events first'; END IF;
 SELECT c.cost+coalesce(sum(delta),0) INTO current_cost FROM public.finance_stock_events WHERE unit_id=e.unit_id AND processed_at IS NOT NULL;
 IF e.new_state IN ('dispatched','sold','damaged') THEN change=-current_cost;
 ELSIF e.new_state='available' AND e.old_state='quarantine' THEN change=c.cost-current_cost;
 END IF;
 IF e.new_state='damaged' THEN expense='WRITE_OFF'; END IF;
 day=(e.created_at AT TIME ZONE 'Europe/Berlin')::date;
 IF day<(SELECT booking_date FROM public.finance_shipments WHERE id=c.shipment_id) THEN RAISE EXCEPTION 'Movement predates cost recognition; review shipment date'; END IF;
 IF change<>0 THEN
 jid=public.finance_submit('stock-event:'||e.id,day,'QR inventory: '||e.new_state,jsonb_build_object('reference',e.id::text,'kind','unit_cost_movement'),
 CASE WHEN change<0 THEN jsonb_build_array(jsonb_build_object('account',expense,'debit',(-change)::text,'credit','0'),jsonb_build_object('account','STOCK','debit','0','credit',(-change)::text)) ELSE jsonb_build_array(jsonb_build_object('account','STOCK','debit',change::text,'credit','0'),jsonb_build_object('account','COGS','debit','0','credit',change::text)) END);
 PERFORM public.finance_post(jid);
 END IF;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 END;
 IF failure IS NOT NULL THEN UPDATE public.finance_stock_events SET attempts=attempts+1,last_error=left(failure,500) WHERE id=p_id;
 ELSE UPDATE public.finance_stock_events SET attempts=attempts+1,last_error=NULL,processed_at=now(),delta=change,journal_id=jid WHERE id=p_id; END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'stock_cost_process',p_id::text,jsonb_build_object('error',failure));
 RETURN jsonb_build_object('error',failure);
END $$;
CREATE FUNCTION public.finance_cost_reversal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_shipments WHERE journal_id=NEW.reversal_of) OR EXISTS(SELECT 1 FROM public.finance_stock_events WHERE journal_id=NEW.reversal_of) THEN RAISE EXCEPTION 'Cost-linked journals require a coordinated cost correction; standalone reversal would corrupt valuation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_cost_reversal_guard BEFORE INSERT ON public.finance_journals FOR EACH ROW EXECUTE FUNCTION public.finance_cost_reversal_guard();

CREATE TABLE public.finance_import_payments(id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES public.finance_cost_documents(document_id),evidence_id uuid NOT NULL REFERENCES public.finance_documents(id),amount bigint NOT NULL CHECK(amount>0),paid_on date NOT NULL,account text NOT NULL REFERENCES public.finance_accounts(code),journal_id uuid NOT NULL UNIQUE REFERENCES public.finance_journals(id),created_by uuid NOT NULL REFERENCES auth.users(id));
ALTER TABLE public.finance_import_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_import_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_import_payments TO authenticated;
CREATE POLICY finance_read ON public.finance_import_payments FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL);
CREATE TRIGGER finance_import_payment_guard BEFORE UPDATE OR DELETE ON public.finance_import_payments FOR EACH ROW EXECUTE FUNCTION public.finance_cost_guard();
CREATE FUNCTION public.finance_import_pay(p_id uuid,p_document uuid,p_evidence uuid,p_date date,p_amount text,p_account text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.finance_import_payments;sid uuid;due bigint;paid numeric;jid uuid;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_amount IS NULL OR p_amount!~'^[0-9]{1,13}$' OR p_amount::bigint<=0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE code=p_account AND active AND cash_kind IS NOT NULL) THEN RAISE EXCEPTION 'Select an active cash or bank account'; END IF;
 SELECT shipment_id INTO sid FROM public.finance_cost_documents WHERE document_id=p_document FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cost document not found'; END IF;
 SELECT * INTO old FROM public.finance_import_payments WHERE id=p_id;
 IF FOUND THEN IF (old.document_id,old.evidence_id,old.paid_on,old.amount,old.account) IS DISTINCT FROM (p_document,p_evidence,p_date,p_amount::bigint,p_account) THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN old.journal_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_evidence AND state='ready') THEN RAISE EXCEPTION 'Ready payment evidence required'; END IF;
 SELECT sum((c->>'amount')::bigint) INTO due FROM public.finance_shipments s CROSS JOIN LATERAL jsonb_array_elements(s.payload->'components') c WHERE s.id=sid AND c->>'document'=p_document::text;
 SELECT coalesce(sum(amount),0) INTO paid FROM public.finance_import_payments p WHERE document_id=p_document AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p.journal_id);
 IF paid+p_amount::bigint>due THEN RAISE EXCEPTION 'Payment exceeds amount due'; END IF;
 jid=public.finance_submit('import-payment:'||p_id,p_date,'Import cost payment',jsonb_build_object('reference',p_evidence::text,'kind','import_payment','costDocument',p_document::text),jsonb_build_array(jsonb_build_object('account','AP','debit',p_amount,'credit','0'),jsonb_build_object('account',p_account,'debit','0','credit',p_amount)));
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_import_payments VALUES(p_id,p_document,p_evidence,p_amount::bigint,p_date,p_account,jid,auth.uid());
 RETURN jid;
END $$;
REVOKE ALL ON FUNCTION public.finance_import_pay(uuid,uuid,uuid,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_import_pay(uuid,uuid,uuid,date,text,text) TO authenticated;

CREATE FUNCTION public.finance_cost_list(p_search text DEFAULT '',p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR length(p_search)>200 THEN RAISE EXCEPTION 'Invalid search'; END IF;
 RETURN jsonb_build_object(
 'units',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT u.id,u.batch_id,u.state,u.variant_id,p.name,v.variant_value,coalesce(c.cost+(SELECT coalesce(sum(delta),0) FROM public.finance_stock_events WHERE unit_id=u.id AND processed_at IS NOT NULL),NULL)::text book_cost,c.cost::text original_cost FROM public.inventory_units u JOIN public.products p ON p.id=u.product_id JOIN public.product_variants v ON v.id=u.variant_id LEFT JOIN public.finance_unit_costs c ON c.unit_id=u.id WHERE p.name ILIKE '%'||p_search||'%' OR u.id::text=p_search ORDER BY u.created_at DESC,u.id LIMIT 100 OFFSET p_page*100)x),'[]'::jsonb),
 'shipments',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,reference,supplier,booking_date,payload->>'total' total,journal_id,(SELECT jsonb_agg(to_jsonb(d) || jsonb_build_object('paid',(SELECT coalesce(sum(p.amount),0)::text FROM public.finance_import_payments p WHERE p.document_id=d.document::uuid AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p.journal_id)))) FROM (SELECT c->>'document' document,string_agg(DISTINCT c->>'reference',', ') reference,string_agg(c->>'kind',', ') kind,sum((c->>'amount')::bigint)::text amount FROM jsonb_array_elements(payload->'components') c GROUP BY c->>'document') d) components FROM public.finance_shipments ORDER BY created_at DESC LIMIT 50)x),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id::text,unit_id,old_state,new_state,created_at,last_error FROM public.finance_stock_events WHERE processed_at IS NULL ORDER BY id LIMIT 100)x),'[]'::jsonb),
 'totals',jsonb_build_object('units',(SELECT count(*)::text FROM public.inventory_units),'uncosted',(SELECT count(*)::text FROM public.inventory_units u WHERE state<>'expected' AND NOT EXISTS(SELECT 1 FROM public.finance_unit_costs WHERE unit_id=u.id)), 'costedValue',(SELECT coalesce(sum(c.cost),0)+(SELECT coalesce(sum(delta),0) FROM public.finance_stock_events WHERE processed_at IS NOT NULL) FROM public.finance_unit_costs c)::text,'ledgerValue',(SELECT coalesce(sum(l.debit-l.credit),0)::text FROM public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id WHERE l.account='STOCK' AND j.status='posted'),'pending',(SELECT count(*)::text FROM public.finance_stock_events WHERE processed_at IS NULL)));
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_shipments','finance_unit_costs','finance_cost_documents','finance_stock_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); EXECUTE format('CREATE POLICY finance_read ON public.%I FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL)',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_cost_guard(),public.finance_stock_guard(),public.finance_capture_stock(),public.finance_shipment_post(uuid,jsonb),public.finance_prevent_cost_expense(),public.finance_stock_process(bigint),public.finance_cost_reversal_guard(),public.finance_cost_list(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_shipment_post(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_stock_process(bigint),public.finance_cost_list(text,integer) TO authenticated;
COMMIT;
