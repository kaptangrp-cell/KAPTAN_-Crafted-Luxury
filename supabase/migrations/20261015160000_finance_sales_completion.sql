BEGIN;
INSERT INTO public.finance_accounts(code,name_de,name_en,kind) VALUES('REFUNDS_DUE','Erstattungsverbindlichkeiten','Customer refunds payable','liability');
CREATE FUNCTION public.finance_sales_complete(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_sales_events;i public.invoices;original public.invoices;prior public.finance_sales_events;total bigint;shipping bigint;goods bigint;jid uuid;failure text;lines jsonb;day date;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO e FROM public.finance_sales_events WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF e.journal_id IS NOT NULL THEN RETURN jsonb_build_object('journalId',e.journal_id,'error',NULL); END IF;
 IF e.kind='advance' THEN RETURN public.finance_sales_import(p_id); END IF;
 -- Serialize all completions/corrections for this order.
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-order:'||e.order_id,0));
 BEGIN
 SELECT * INTO i FROM public.invoices WHERE id=e.invoice_id;
 IF i.state<>'issued' OR i.kind NOT IN ('final','credit') THEN RAISE EXCEPTION 'Issued final or credit required'; END IF;
 IF i.model->>'taxMode' IS DISTINCT FROM 'kleinunternehmer' OR i.source->'order'->'tax_data'->>'currency' IS DISTINCT FROM 'EUR' OR coalesce(i.model->>'vat','')<>'0' THEN RAISE EXCEPTION 'Only reviewed domestic EUR §19 invoices are supported'; END IF;
 SELECT * INTO original FROM public.invoices WHERE order_id=e.order_id AND number=i.model->'reference'->>'number' AND state='issued' AND kind IN ('advance','final');
 IF NOT FOUND THEN RAISE EXCEPTION 'Issued referenced original missing'; END IF;
 SELECT * INTO prior FROM public.finance_sales_events WHERE invoice_id=original.id;
 IF prior.journal_id IS NULL OR EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=prior.journal_id) THEN RAISE EXCEPTION 'Post the referenced original first; reversed sources need review'; END IF;
 IF coalesce(i.model->>'gross','')!~'^[0-9]{1,13}$' OR coalesce(i.model->>'rounding','')<>'0' THEN RAISE EXCEPTION 'Invalid or rounded §19 invoice'; END IF;
 total=(i.model->>'gross')::bigint;
 IF total<=0 OR total>9000000000000 OR total<>(original.model->>'gross')::bigint+(original.model->>'rounding')::bigint THEN RAISE EXCEPTION 'Only complete matching invoice corrections supported'; END IF;
 IF i.kind='final' AND original.kind<>'advance' THEN RAISE EXCEPTION 'Final must reference advance'; END IF;
 IF i.kind='final' AND EXISTS(SELECT 1 FROM public.finance_sales_events WHERE order_id=e.order_id AND kind='credit' AND journal_id IS NOT NULL) THEN RAISE EXCEPTION 'Order already credited'; END IF;
 IF i.kind='credit' AND original.kind='advance' AND EXISTS(SELECT 1 FROM public.finance_sales_events WHERE order_id=e.order_id AND kind='final' AND journal_id IS NOT NULL) THEN RAISE EXCEPTION 'Credit the final invoice instead'; END IF;
 IF jsonb_typeof(i.model->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(i.model->'lines')<1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(i.model->'lines') l WHERE coalesce(l->>'gross','')!~'^[0-9]{1,13}$') THEN RAISE EXCEPTION 'Invalid invoice line amounts'; END IF;
 IF (SELECT sum((l->>'gross')::numeric) FROM jsonb_array_elements(i.model->'lines') l)<>total THEN RAISE EXCEPTION 'Invoice lines do not reconcile'; END IF;
 -- Shipping is explicitly labelled in the immutable invoice model, never inferred from current product prices.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(i.model->'lines') l WHERE l->>'productId' IS NULL AND l->>'description' IS DISTINCT FROM 'Versand') THEN RAISE EXCEPTION 'Unclassified non-product invoice line'; END IF;
 SELECT coalesce(sum((l->>'gross')::bigint),0) INTO shipping FROM jsonb_array_elements(i.model->'lines') l WHERE l->>'productId' IS NULL;
 goods=total-shipping;
 IF i.kind='credit' AND i.model->'lines' IS DISTINCT FROM original.model->'lines' THEN RAISE EXCEPTION 'Credit allocation differs from original'; END IF;
 IF i.kind='final' THEN
  IF i.model->'lines' IS DISTINCT FROM original.model->'lines' THEN RAISE EXCEPTION 'Final allocation differs from advance'; END IF;
  day=(i.model->>'supplyDate')::date;
  IF day IS NULL THEN RAISE EXCEPTION 'Supply date required'; END IF;
  lines=jsonb_build_array(jsonb_build_object('account','ADVANCES','debit',total::text,'credit','0'));
  IF goods>0 THEN lines=lines||jsonb_build_array(jsonb_build_object('account','SALES','debit','0','credit',goods::text)); END IF;
  IF shipping>0 THEN lines=lines||jsonb_build_array(jsonb_build_object('account','SHIPPING','debit','0','credit',shipping::text)); END IF;
 ELSE
  day=(i.model->>'issueDate')::date;
  IF day IS NULL THEN RAISE EXCEPTION 'Credit issue date required'; END IF;
  lines=jsonb_build_array(jsonb_build_object('account','REFUNDS_DUE','debit','0','credit',total::text));
  IF original.kind='advance' THEN lines=lines||jsonb_build_array(jsonb_build_object('account','ADVANCES','debit',total::text,'credit','0'));
  ELSE
   IF goods>0 THEN lines=lines||jsonb_build_array(jsonb_build_object('account','SALES','debit',goods::text,'credit','0')); END IF;
   IF shipping>0 THEN lines=lines||jsonb_build_array(jsonb_build_object('account','SHIPPING','debit',shipping::text,'credit','0')); END IF;
  END IF;
 END IF;
 jid=public.finance_submit('store-'||i.kind||':'||e.order_id,day,i.kind||': '||e.invoice_number,jsonb_build_object('reference',i.id::text,'kind','store_'||i.kind),lines);
 PERFORM public.finance_post(jid);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 END;
 IF failure IS NOT NULL THEN UPDATE public.finance_sales_events SET attempts=attempts+1,last_error=left(failure,500) WHERE id=p_id;
 ELSE UPDATE public.finance_sales_events SET attempts=attempts+1,last_error=NULL,journal_id=jid WHERE id=p_id; END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'sales_completion',p_id::text,jsonb_build_object('error',failure));
 RETURN jsonb_build_object('journalId',CASE WHEN failure IS NULL THEN jid ELSE NULL END,'error',failure);
END $$;
CREATE TABLE public.finance_refund_payments(id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES public.finance_sales_events(id),document_id uuid NOT NULL REFERENCES public.finance_documents(id),payment_reference text NOT NULL UNIQUE CHECK(length(trim(payment_reference)) BETWEEN 5 AND 200),paid_on date NOT NULL,amount bigint NOT NULL CHECK(amount>0),account text NOT NULL REFERENCES public.finance_accounts(code),journal_id uuid NOT NULL UNIQUE REFERENCES public.finance_journals(id),created_by uuid NOT NULL REFERENCES auth.users(id));
ALTER TABLE public.finance_refund_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_refund_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_refund_payments TO authenticated;
CREATE POLICY finance_read ON public.finance_refund_payments FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL);
CREATE TRIGGER finance_refund_guard BEFORE UPDATE OR DELETE ON public.finance_refund_payments FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard();
CREATE FUNCTION public.finance_refund_pay(p_id uuid,p_event uuid,p_document uuid,p_reference text,p_date date,p_amount text,p_account text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_sales_events;old public.finance_refund_payments;due bigint;paid numeric;jid uuid;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO e FROM public.finance_sales_events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR e.kind<>'credit' OR e.journal_id IS NULL THEN RAISE EXCEPTION 'Posted credit required'; END IF;
 SELECT * INTO old FROM public.finance_refund_payments WHERE id=p_id;
 IF FOUND THEN IF (old.event_id,old.document_id,old.payment_reference,old.paid_on,old.amount,old.account) IS DISTINCT FROM (p_event,p_document,trim(p_reference),p_date,p_amount::bigint,p_account) THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN old.journal_id; END IF;
 IF p_amount IS NULL OR p_amount!~'^[0-9]{1,13}$' OR p_amount::bigint<=0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE code=p_account AND active AND (cash_kind IS NOT NULL OR code='CLEARING')) THEN RAISE EXCEPTION 'Select cash, bank or verified provider clearing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready') THEN RAISE EXCEPTION 'Payment evidence required'; END IF;
 SELECT sum(credit-debit) INTO due FROM public.finance_lines WHERE journal_id=e.journal_id AND account='REFUNDS_DUE';
 SELECT coalesce(sum(amount),0) INTO paid FROM public.finance_refund_payments p WHERE event_id=p_event AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p.journal_id);
 IF due IS NULL OR p_amount::bigint+paid>due THEN RAISE EXCEPTION 'Refund exceeds obligation'; END IF;
 jid=public.finance_submit('refund-payment:'||p_id,p_date,'Refund: '||trim(p_reference),jsonb_build_object('reference',p_document::text,'kind','refund_payment','credit',e.invoice_id),jsonb_build_array(jsonb_build_object('account','REFUNDS_DUE','debit',p_amount,'credit','0'),jsonb_build_object('account',p_account,'debit','0','credit',p_amount)));
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_refund_payments VALUES(p_id,p_event,p_document,trim(p_reference),p_date,p_amount::bigint,p_account,jid,auth.uid());
 RETURN jid;
END $$;
-- Prevent a source reversal from orphaning final invoices, credit notes or payment allocations.
CREATE FUNCTION public.finance_sales_reversal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_sales_events WHERE journal_id=NEW.reversal_of) THEN RAISE EXCEPTION 'Use a linked invoice correction; standalone reversal would orphan the sales lifecycle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_sales_reversal_guard BEFORE INSERT ON public.finance_journals FOR EACH ROW EXECUTE FUNCTION public.finance_sales_reversal_guard();
CREATE OR REPLACE FUNCTION public.finance_sales_list(p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (
 SELECT e.*,i.model->>'paidDate' paid_date,i.model->>'gross' gross,i.model->>'rounding' rounding,i.source->'order'->'tax_data'->>'currency' currency,i.model->>'taxMode' tax_mode,
 (SELECT coalesce(sum(amount),0)::text FROM public.finance_refund_payments p WHERE event_id=e.id AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p.journal_id)) refunded
 FROM public.finance_sales_events e JOIN public.invoices i ON i.id=e.invoice_id ORDER BY e.created_at DESC,e.id LIMIT 30 OFFSET p_page*30
 ) e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.finance_sales_complete(uuid),public.finance_refund_pay(uuid,uuid,uuid,text,date,text,text),public.finance_sales_reversal_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_sales_complete(uuid),public.finance_refund_pay(uuid,uuid,uuid,text,date,text,text) TO authenticated;
COMMIT;
