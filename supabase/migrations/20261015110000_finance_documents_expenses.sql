BEGIN;
-- Originals are server-mediated. No browser may read, overwrite or delete bucket objects.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('finance-originals','finance-originals',false,3145728,ARRAY['application/pdf','image/png','image/jpeg','application/xml']);
CREATE POLICY finance_originals_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
USING(bucket_id<>'finance-originals') WITH CHECK(bucket_id<>'finance-originals');
CREATE TABLE public.finance_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sha256 text NOT NULL UNIQUE CHECK(sha256~'^[a-f0-9]{64}$'),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 200), mime text NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg','application/xml')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3145728), state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready')),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz,
 CHECK((state='ready')=(ready_at IS NOT NULL))
);
CREATE TABLE public.finance_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.finance_documents(id),
 supplier text NOT NULL CHECK(length(trim(supplier)) BETWEEN 2 AND 200), invoice_number text NOT NULL CHECK(length(trim(invoice_number)) BETWEEN 1 AND 200),
 invoice_date date NOT NULL, description text NOT NULL CHECK(length(trim(description)) BETWEEN 3 AND 1000),
 gross bigint NOT NULL CHECK(gross BETWEEN 1 AND 9000000000000), currency text NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'),
 tax_treatment text NOT NULL DEFAULT 'domestic_nondeductible' CHECK(tax_treatment='domestic_nondeductible'),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 replaces uuid REFERENCES public.finance_expenses(id), journal_id uuid UNIQUE REFERENCES public.finance_journals(id)
);
CREATE UNIQUE INDEX finance_expense_duplicate ON public.finance_expenses(lower(trim(supplier)),lower(trim(invoice_number))) WHERE journal_id IS NOT NULL;
CREATE UNIQUE INDEX finance_document_booked_once ON public.finance_expenses(document_id) WHERE journal_id IS NOT NULL;
CREATE TABLE public.finance_expense_payments (
 id uuid PRIMARY KEY, expense_id uuid NOT NULL REFERENCES public.finance_expenses(id), document_id uuid NOT NULL REFERENCES public.finance_documents(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES public.finance_journals(id), amount bigint NOT NULL CHECK(amount>0), paid_on date NOT NULL,
 account text NOT NULL CHECK(account IN ('BANK','CASH')), created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.finance_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial evidence cannot be deleted'; END IF;
 IF TG_TABLE_NAME='finance_documents' THEN
  IF OLD.state='uploading' AND NEW.state='ready' AND (to_jsonb(NEW)-'state'-'ready_at')=(to_jsonb(OLD)-'state'-'ready_at') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='finance_expenses' THEN
  IF OLD.journal_id IS NULL AND NEW.journal_id IS NOT NULL AND (to_jsonb(NEW)-'journal_id')=(to_jsonb(OLD)-'journal_id') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Evidence and review versions are immutable';
END $$;
CREATE TRIGGER finance_document_guard BEFORE UPDATE OR DELETE ON public.finance_documents FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard();
CREATE TRIGGER finance_expense_guard BEFORE UPDATE OR DELETE ON public.finance_expenses FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard();
CREATE TRIGGER finance_payment_guard BEFORE UPDATE OR DELETE ON public.finance_expense_payments FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard();
CREATE FUNCTION public.finance_document_reserve(p_hash text,p_name text,p_mime text,p_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.finance_documents;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant','staff') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO public.finance_documents(sha256,filename,mime,bytes,created_by) VALUES(p_hash,p_name,p_mime,p_bytes,auth.uid()) ON CONFLICT(sha256) DO NOTHING RETURNING * INTO d;
 IF NOT FOUND THEN SELECT * INTO d FROM public.finance_documents WHERE sha256=p_hash;
  IF d.bytes<>p_bytes OR d.mime<>p_mime THEN RAISE EXCEPTION 'Document fingerprint conflict'; END IF;
 ELSE INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'document_reserved',d.id::text); END IF;
 RETURN to_jsonb(d);
END $$;
-- Only the authenticated server can attest to stored bytes, never a browser RPC.
CREATE FUNCTION public.finance_document_finish(p_id uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.finance_documents;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor) THEN RAISE EXCEPTION 'Upload actor required'; END IF;
 SELECT * INTO d FROM public.finance_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF d.state='ready' THEN RETURN; END IF;
 UPDATE public.finance_documents SET state='ready',ready_at=now() WHERE id=p_id;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(p_actor,'document_preserved',d.id::text,jsonb_build_object('sha256',d.sha256));
END $$;
CREATE FUNCTION public.finance_document_access(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.finance_documents;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO d FROM public.finance_documents WHERE id=p_id AND state='ready';
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not ready'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'document_access',p_id::text);
 RETURN to_jsonb(d);
END $$;
CREATE FUNCTION public.finance_expense_draft(p_id uuid,p_document uuid,p_supplier text,p_number text,p_date date,p_description text,p_gross text,p_replaces uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_expenses;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant','staff') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_gross IS NULL OR p_gross!~'^[0-9]{1,13}$' THEN RAISE EXCEPTION 'Use integer cents'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready') THEN RAISE EXCEPTION 'Preserved original required'; END IF;
 IF p_replaces IS NOT NULL THEN
  PERFORM 1 FROM public.finance_expenses WHERE id=p_replaces AND document_id=p_document AND journal_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an unposted review of the same original can be replaced'; END IF;
 END IF;
 INSERT INTO public.finance_expenses(id,document_id,supplier,invoice_number,invoice_date,description,gross,created_by,replaces)
 VALUES(p_id,p_document,trim(p_supplier),trim(p_number),p_date,trim(p_description),p_gross::bigint,auth.uid(),p_replaces) ON CONFLICT(id) DO NOTHING RETURNING * INTO e;
 IF NOT FOUND THEN
  SELECT * INTO e FROM public.finance_expenses WHERE id=p_id;
  IF (e.document_id,e.supplier,e.invoice_number,e.invoice_date,e.description,e.gross,e.replaces) IS DISTINCT FROM (p_document,trim(p_supplier),trim(p_number),p_date,trim(p_description),p_gross::bigint,p_replaces) THEN RAISE EXCEPTION 'Retry content differs'; END IF;
 ELSE INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'expense_review_saved',p_id::text,jsonb_build_object('document',p_document,'replaces',p_replaces)); END IF;
 RETURN p_id;
END $$;
CREATE FUNCTION public.finance_expense_post(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_expenses; jid uuid;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO e FROM public.finance_expenses WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
 IF e.journal_id IS NOT NULL THEN RETURN e.journal_id; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_expenses WHERE replaces=p_id) THEN RAISE EXCEPTION 'Review has been superseded'; END IF;
 jid=public.finance_submit('expense:'||p_id,e.invoice_date,e.description,jsonb_build_object('reference',e.document_id::text,'kind','supplier_expense'),jsonb_build_array(
  jsonb_build_object('account','EXPENSE','debit',e.gross::text,'credit','0'),jsonb_build_object('account','AP','debit','0','credit',e.gross::text)));
 -- Unique indexes serialize duplicates; a conflict rolls back the entire posting.
 UPDATE public.finance_expenses SET journal_id=jid WHERE id=p_id;
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'expense_posted',p_id::text);
 RETURN jid;
END $$;
CREATE FUNCTION public.finance_expense_pay(p_id uuid,p_expense uuid,p_document uuid,p_date date,p_amount text,p_account text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_expenses; existing public.finance_expense_payments; paid numeric; jid uuid;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_amount IS NULL OR p_amount!~'^[0-9]{1,13}$' OR p_amount::bigint<=0 OR p_account IS NULL OR p_account NOT IN ('BANK','CASH') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 SELECT * INTO e FROM public.finance_expenses WHERE id=p_expense FOR UPDATE;
 IF NOT FOUND OR e.journal_id IS NULL THEN RAISE EXCEPTION 'Post the expense first'; END IF;
 SELECT * INTO existing FROM public.finance_expense_payments WHERE id=p_id;
 IF FOUND THEN
  IF (existing.expense_id,existing.document_id,existing.paid_on,existing.amount,existing.account) IS DISTINCT FROM (p_expense,p_document,p_date,p_amount::bigint,p_account) THEN RAISE EXCEPTION 'Retry content differs'; END IF;
  RETURN existing.journal_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=e.journal_id) THEN RAISE EXCEPTION 'Expense has been reversed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready') THEN RAISE EXCEPTION 'Payment evidence required'; END IF;
 SELECT coalesce(sum(p.amount),0) INTO paid FROM public.finance_expense_payments p WHERE expense_id=p_expense AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p.journal_id);
 IF paid+p_amount::bigint>e.gross THEN RAISE EXCEPTION 'Payment exceeds outstanding amount'; END IF;
 jid=public.finance_submit('expense-payment:'||p_id,p_date,'Supplier payment: '||left(e.invoice_number,200),jsonb_build_object('reference',p_document::text,'kind','supplier_payment'),jsonb_build_array(
  jsonb_build_object('account','AP','debit',p_amount,'credit','0'),jsonb_build_object('account',p_account,'debit','0','credit',p_amount)));
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_expense_payments(id,expense_id,document_id,journal_id,amount,paid_on,account,created_by) VALUES(p_id,p_expense,p_document,jid,p_amount::bigint,p_date,p_account,auth.uid());
 RETURN jid;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_documents','finance_expenses','finance_expense_payments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY finance_read ON public.%I FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL)',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_document_guard(),public.finance_document_reserve(text,text,text,integer),public.finance_document_finish(uuid,uuid),public.finance_document_access(uuid),public.finance_expense_draft(uuid,uuid,text,text,date,text,text,uuid),public.finance_expense_post(uuid),public.finance_expense_pay(uuid,uuid,uuid,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_document_reserve(text,text,text,integer),public.finance_document_access(uuid),public.finance_expense_draft(uuid,uuid,text,text,date,text,text,uuid),public.finance_expense_post(uuid),public.finance_expense_pay(uuid,uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_document_finish(uuid,uuid) TO service_role;
CREATE FUNCTION public.finance_documents_list(p_search text DEFAULT '',p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 RETURN jsonb_build_object(
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (SELECT * FROM public.finance_documents WHERE position(lower(coalesce(p_search,'')) in lower(filename))>0 ORDER BY created_at DESC,id LIMIT 30 OFFSET p_page*30) d),'[]'::jsonb),
 'expenses',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (
 SELECT x.id,x.document_id,x.supplier,x.invoice_number,x.invoice_date,x.description,x.gross::text,x.journal_id,x.replaces,
 EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=x.journal_id) reversed,
 EXISTS(SELECT 1 FROM public.finance_expenses WHERE replaces=x.id) superseded,
 (SELECT coalesce(sum(p.amount),0)::text FROM public.finance_expense_payments p WHERE expense_id=x.id AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p.journal_id)) paid
 FROM public.finance_expenses x WHERE position(lower(coalesce(p_search,'')) in lower(supplier||' '||invoice_number||' '||description))>0 ORDER BY created_at DESC,id LIMIT 30 OFFSET p_page*30
 ) e),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_documents_list(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_documents_list(text,integer) TO authenticated;
COMMIT;
