-- KAPTAN finance: initial installation only. Target project rmglhfoteozmstsprlnq.
-- One atomic transaction; aborts if finance already exists. No existing order/stock values are edited.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('kaptan-finance-install',0));
DO $preflight$ BEGIN
 IF to_regclass('public.finance_journals') IS NOT NULL THEN RAISE EXCEPTION 'Finance already exists: use incremental migrations, not initial bundle'; END IF;
 IF to_regclass('public.invoices') IS NULL OR to_regclass('public.inventory_units') IS NULL THEN RAISE EXCEPTION 'Existing invoice and warehouse migrations required'; END IF;
END $preflight$;
-- 20261015100000_finance_foundation.sql
CREATE TABLE public.finance_members (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), role text NOT NULL CHECK(role IN ('accountant','staff','auditor'))
);
CREATE TABLE public.finance_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), accounting_method text NOT NULL DEFAULT 'euer' CHECK(accounting_method='euer'),
 first_year integer NOT NULL DEFAULT 2026, chart_mapping text NOT NULL DEFAULT 'internal-unmapped'
);
INSERT INTO public.finance_settings(id) VALUES(true);
CREATE TABLE public.finance_accounts (
 code text PRIMARY KEY, name_de text NOT NULL, name_en text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('asset','liability','equity','income','expense')), active boolean NOT NULL DEFAULT true
);
INSERT INTO public.finance_accounts(code,name_de,name_en,kind) VALUES
 ('BANK','Bank','Bank','asset'),('CASH','Kasse','Cash','asset'),('CLEARING','Zahlungsdienstleister','Provider clearing','asset'),
 ('AR','Forderungen','Receivables','asset'),('STOCK','Warenbestand','Inventory','asset'),('AP','Verbindlichkeiten','Payables','liability'),
 ('ADVANCES','Erhaltene Anzahlungen','Customer advances','liability'),('CAPITAL','Einlagen','Owner capital','equity'),
 ('DRAWINGS','Entnahmen','Owner drawings','equity'),('SALES','Warenumsatz','Goods revenue','income'),
 ('SHIPPING','Versanderlöse','Shipping revenue','income'),('COGS','Wareneinsatz','Cost of goods sold','expense'),
 ('FEES','Zahlungsgebühren','Payment fees','expense'),('EXPENSE','Sonstige Betriebsausgaben','Operating expenses','expense');
CREATE TABLE public.finance_periods (
 id date PRIMARY KEY CHECK(extract(day FROM id)=1), closed boolean NOT NULL DEFAULT false
);
INSERT INTO public.finance_periods(id) SELECT d::date FROM generate_series('2026-01-01'::date,'2026-12-01'::date,interval '1 month') d;
CREATE TABLE public.finance_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), external_key text NOT NULL UNIQUE CHECK(length(external_key) BETWEEN 1 AND 200),
 booking_date date NOT NULL, period date NOT NULL REFERENCES public.finance_periods(id),
 memo text NOT NULL CHECK(length(trim(memo)) BETWEEN 3 AND 1000), source jsonb NOT NULL CHECK(jsonb_typeof(source)='object' AND jsonb_typeof(source->'reference') IS NOT DISTINCT FROM 'string' AND length(trim(source->>'reference')) BETWEEN 1 AND 500 AND (NOT source ? 'kind' OR jsonb_typeof(source->'kind') IS NOT DISTINCT FROM 'string')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')), created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 posted_by uuid REFERENCES auth.users(id), posted_at timestamptz, reversal_of uuid UNIQUE REFERENCES public.finance_journals(id),
 CHECK(period=date_trunc('month',booking_date)::date), CHECK((status='posted')=(posted_at IS NOT NULL)), CHECK((status='posted')=(posted_by IS NOT NULL))
);
CREATE TABLE public.finance_lines (
 journal_id uuid NOT NULL REFERENCES public.finance_journals(id), line_no integer NOT NULL CHECK(line_no>0),
 account text NOT NULL REFERENCES public.finance_accounts(code), debit bigint NOT NULL DEFAULT 0, credit bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(journal_id,line_no), CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)),
 CHECK(debit<=9000000000000 AND credit<=9000000000000)
);
CREATE TABLE public.finance_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor uuid NOT NULL,
 event text NOT NULL, reference text NOT NULL, details jsonb NOT NULL DEFAULT '{}'
);
CREATE FUNCTION public.finance_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN public.is_admin() THEN 'owner' ELSE (SELECT role FROM public.finance_members WHERE user_id=auth.uid()) END
$$;
CREATE FUNCTION public.finance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='finance_audit' THEN RAISE EXCEPTION 'Audit records are append-only'; END IF;
 IF TG_TABLE_NAME='finance_journals' THEN
  IF TG_OP='DELETE' OR OLD.status='posted' THEN RAISE EXCEPTION 'Journal is immutable; reverse it'; END IF;
  IF (to_jsonb(NEW)-'status'-'posted_by'-'posted_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'posted_by'-'posted_at') THEN RAISE EXCEPTION 'Draft source and lines are immutable; submit a replacement'; END IF;
 ELSE
  IF TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM public.finance_journals WHERE id=NEW.journal_id AND status='posted') THEN RAISE EXCEPTION 'Journal lines are immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_journal_guard BEFORE UPDATE OR DELETE ON public.finance_journals FOR EACH ROW EXECUTE FUNCTION public.finance_guard();
CREATE TRIGGER finance_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_lines FOR EACH ROW EXECUTE FUNCTION public.finance_guard();
CREATE TRIGGER finance_audit_guard BEFORE UPDATE OR DELETE ON public.finance_audit FOR EACH ROW EXECUTE FUNCTION public.finance_guard();
CREATE FUNCTION public.finance_balance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='posted' AND (SELECT count(*)<2 OR coalesce(sum(debit-credit),0)<>0 FROM public.finance_lines WHERE journal_id=NEW.id) THEN RAISE EXCEPTION 'Journal must balance with at least two lines'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_balance AFTER INSERT OR UPDATE ON public.finance_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_balance_guard();
CREATE FUNCTION public.finance_submit(p_key text,p_date date,p_memo text,p_source jsonb,p_lines jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE jid uuid; existing public.finance_journals; normalized jsonb; r text:=public.finance_role();
BEGIN
 IF r IS NULL OR r NOT IN ('owner','accountant','staff') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Provide 2–200 lines'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l WHERE coalesce(l->>'debit','')!~'^[0-9]{1,13}$' OR coalesce(l->>'credit','')!~'^[0-9]{1,13}$') THEN RAISE EXCEPTION 'Use integer cents'; END IF;
 SELECT jsonb_agg(jsonb_build_object('account',l->>'account','debit',(l->>'debit')::bigint,'credit',(l->>'credit')::bigint) ORDER BY n) INTO normalized FROM jsonb_array_elements(p_lines) WITH ORDINALITY x(l,n);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key,0));
 SELECT * INTO existing FROM public.finance_journals WHERE external_key=p_key;
 IF FOUND THEN
  IF existing.booking_date IS DISTINCT FROM p_date OR existing.memo IS DISTINCT FROM p_memo OR existing.source IS DISTINCT FROM p_source OR normalized IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('account',account,'debit',debit,'credit',credit) ORDER BY line_no) FROM public.finance_lines WHERE journal_id=existing.id) THEN RAISE EXCEPTION 'Idempotency key reused with different content'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) l LEFT JOIN public.finance_accounts a ON a.code=l->>'account' WHERE a.code IS NULL OR NOT a.active) THEN RAISE EXCEPTION 'Unknown or inactive account'; END IF;
 IF (SELECT sum((l->>'debit')::numeric-(l->>'credit')::numeric) FROM jsonb_array_elements(normalized) l)<>0 THEN RAISE EXCEPTION 'Journal must balance'; END IF;
 PERFORM 1 FROM public.finance_periods WHERE id=date_trunc('month',p_date)::date AND NOT closed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Period missing or closed'; END IF;
 INSERT INTO public.finance_journals(external_key,booking_date,period,memo,source,created_by) VALUES(p_key,p_date,date_trunc('month',p_date)::date,p_memo,p_source,auth.uid()) RETURNING id INTO jid;
 INSERT INTO public.finance_lines SELECT jid,n::int,l->>'account',(l->>'debit')::bigint,(l->>'credit')::bigint FROM jsonb_array_elements(normalized) WITH ORDINALITY x(l,n);
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'draft_created',jid::text);
 RETURN jid;
END $$;
CREATE FUNCTION public.finance_post(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.finance_journals; r text:=public.finance_role();
BEGIN
 IF r IS NULL OR r NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO j FROM public.finance_journals WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
 IF j.status='posted' THEN RETURN; END IF;
 PERFORM 1 FROM public.finance_periods WHERE id=j.period AND NOT closed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Period closed'; END IF;
 IF (SELECT count(*)<2 OR coalesce(sum(debit-credit),0)<>0 FROM public.finance_lines WHERE journal_id=p_id) THEN RAISE EXCEPTION 'Journal must balance'; END IF;
 UPDATE public.finance_journals SET status='posted',posted_by=auth.uid(),posted_at=now() WHERE id=p_id;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'posted',p_id::text);
END $$;
CREATE FUNCTION public.finance_reverse(p_id uuid,p_date date,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original public.finance_journals; jid uuid; r text:=public.finance_role();
BEGIN
 IF r IS NULL OR r NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Correction reason required'; END IF;
 SELECT * INTO original FROM public.finance_journals WHERE id=p_id AND status='posted' FOR UPDATE;
 IF NOT FOUND OR original.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Select an original posted journal'; END IF;
 SELECT id INTO jid FROM public.finance_journals WHERE reversal_of=p_id;
 IF FOUND THEN RETURN jid; END IF;
 -- Insert with the immutable reversal link from the beginning.
 PERFORM 1 FROM public.finance_periods WHERE id=date_trunc('month',p_date)::date AND NOT closed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Period missing or closed'; END IF;
 INSERT INTO public.finance_journals(external_key,booking_date,period,memo,source,created_by,reversal_of)
 VALUES('reversal:'||p_id,p_date,date_trunc('month',p_date)::date,p_reason,jsonb_build_object('reference',p_id,'kind','reversal'),auth.uid(),p_id) RETURNING id INTO jid;
 INSERT INTO public.finance_lines SELECT jid,line_no,account,credit,debit FROM public.finance_lines WHERE journal_id=p_id;
 PERFORM public.finance_post(jid);
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'reversed',p_id::text,jsonb_build_object('reversal',jid,'reason',p_reason));
 RETURN jid;
END $$;
CREATE FUNCTION public.finance_set_period(p_period date,p_closed boolean,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r text:=public.finance_role();
BEGIN
 IF r IS NULL OR r NOT IN ('owner','accountant') OR (NOT p_closed AND r<>'owner') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_closed IS NULL OR length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Reason required'; END IF;
 UPDATE public.finance_periods SET closed=p_closed WHERE id=p_period;
 IF NOT FOUND THEN RAISE EXCEPTION 'Period not found'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),CASE WHEN p_closed THEN 'period_closed' ELSE 'period_reopened' END,p_period::text,jsonb_build_object('reason',p_reason));
END $$;
CREATE FUNCTION public.finance_set_member(p_user uuid,p_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_role IS NULL THEN DELETE FROM public.finance_members WHERE user_id=p_user;
 ELSE INSERT INTO public.finance_members VALUES(p_user,p_role) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role; END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'membership_changed',p_user::text,jsonb_build_object('role',p_role));
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_members','finance_settings','finance_accounts','finance_periods','finance_journals','finance_lines','finance_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY finance_read ON public.%I FOR SELECT TO authenticated USING (public.finance_role() IS NOT NULL)',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_role(),public.finance_submit(text,date,text,jsonb,jsonb),public.finance_post(uuid),public.finance_reverse(uuid,date,text),public.finance_set_period(date,boolean,text),public.finance_set_member(uuid,text),public.finance_guard(),public.finance_balance_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_role(),public.finance_submit(text,date,text,jsonb,jsonb),public.finance_post(uuid),public.finance_reverse(uuid,date,text),public.finance_set_period(date,boolean,text),public.finance_set_member(uuid,text) TO authenticated;
CREATE FUNCTION public.finance_snapshot(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT jsonb_build_object('role',public.finance_role(),
  'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY code) FROM public.finance_accounts a),
  'periods',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.finance_periods p),
  'journals',coalesce((SELECT jsonb_agg(to_jsonb(j) ORDER BY created_at DESC) FROM (SELECT id,booking_date,memo,status,source,created_at,reversal_of,(SELECT jsonb_agg(jsonb_build_object('account',account,'debit',debit::text,'credit',credit::text) ORDER BY line_no) FROM public.finance_lines WHERE journal_id=finance_journals.id) lines FROM public.finance_journals WHERE booking_date BETWEEN p_from AND p_to ORDER BY created_at DESC,id LIMIT 100) j),'[]'::jsonb),
  'trial',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY account) FROM (
   SELECT l.account,sum(l.debit)::text debit,sum(l.credit)::text credit FROM public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id WHERE j.status='posted' AND j.booking_date BETWEEN p_from AND p_to GROUP BY l.account
  ) t),'[]'::jsonb),
  'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id::bigint DESC) FROM (SELECT id::text,at,event,reference,details FROM public.finance_audit ORDER BY id DESC LIMIT 50) a),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_snapshot(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_snapshot(date,date) TO authenticated;

-- 20261015110000_finance_documents_expenses.sql
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

-- 20261015120000_finance_reports.sql
CREATE FUNCTION public.finance_report(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE accounts jsonb; flows jsonb;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY code) INTO accounts FROM (
 SELECT a.code,a.name_de,a.name_en,a.kind,
 coalesce(sum(l.debit-l.credit) FILTER(WHERE j.booking_date<p_from),0)::text opening,
 coalesce(sum(l.debit) FILTER(WHERE j.booking_date BETWEEN p_from AND p_to),0)::text debit,
 coalesce(sum(l.credit) FILTER(WHERE j.booking_date BETWEEN p_from AND p_to),0)::text credit,
 coalesce(sum(l.debit-l.credit),0)::text closing
 FROM public.finance_accounts a LEFT JOIN (public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id AND j.status='posted' AND j.booking_date<=p_to) ON l.account=a.code
 GROUP BY a.code,a.name_de,a.name_en,a.kind
 ) a;
 SELECT jsonb_build_object('inflow',coalesce(sum(greatest(net,0)),0)::text,'outflow',(-coalesce(sum(least(net,0)),0))::text) INTO flows FROM (
 SELECT j.id,sum(l.debit-l.credit) net FROM public.finance_journals j JOIN public.finance_lines l ON l.journal_id=j.id
 WHERE j.status='posted' AND j.booking_date BETWEEN p_from AND p_to AND l.account IN ('BANK','CASH') GROUP BY j.id
 ) x;
 RETURN jsonb_build_object('accounts',accounts,'cash',flows,'from',p_from,'to',p_to,
 'postedCount',(SELECT count(*)::text FROM public.finance_journals WHERE status='posted' AND booking_date BETWEEN p_from AND p_to),
 'draftCount',(SELECT count(*)::text FROM public.finance_journals WHERE status='draft' AND booking_date BETWEEN p_from AND p_to));
END $$;
REVOKE ALL ON FUNCTION public.finance_report(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_report(date,date) TO authenticated;
-- Preserve numeric audit ordering beyond event 99.
CREATE OR REPLACE FUNCTION public.finance_snapshot(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT jsonb_build_object('role',public.finance_role(),
  'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY code) FROM public.finance_accounts a),
  'periods',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.finance_periods p),
  'journals',coalesce((SELECT jsonb_agg(to_jsonb(j) ORDER BY created_at DESC) FROM (SELECT id,booking_date,memo,status,source,created_at,reversal_of,(SELECT jsonb_agg(jsonb_build_object('account',account,'debit',debit::text,'credit',credit::text) ORDER BY line_no) FROM public.finance_lines WHERE journal_id=finance_journals.id) lines FROM public.finance_journals WHERE booking_date BETWEEN p_from AND p_to ORDER BY created_at DESC,id LIMIT 100) j),'[]'::jsonb),
  'trial',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY account) FROM (
   SELECT l.account,sum(l.debit)::text debit,sum(l.credit)::text credit FROM public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id WHERE j.status='posted' AND j.booking_date BETWEEN p_from AND p_to GROUP BY l.account
  ) t),'[]'::jsonb),
  'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id::bigint DESC) FROM (SELECT id::text,at,event,reference,details FROM public.finance_audit ORDER BY finance_audit.id DESC LIMIT 50) a),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;

-- 20261015130000_finance_sales_inbox.sql
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

-- 20261015140000_finance_banking.sql
ALTER TABLE public.finance_accounts ADD COLUMN cash_kind text CHECK(cash_kind IN ('bank','cash'));
UPDATE public.finance_accounts SET cash_kind=CASE code WHEN 'BANK' THEN 'bank' ELSE 'cash' END WHERE code IN ('BANK','CASH');
CREATE TABLE public.finance_bank_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 100),
 ledger_account text NOT NULL UNIQUE REFERENCES public.finance_accounts(code), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.finance_bank_accounts(name,ledger_account) VALUES('Business bank / Geschäftskonto','BANK');
CREATE TABLE public.finance_bank_statements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.finance_bank_accounts(id), document_id uuid NOT NULL REFERENCES public.finance_documents(id),
 start_date date NOT NULL,end_date date NOT NULL CHECK(end_date>=start_date),opening bigint NOT NULL,closing bigint NOT NULL,
 import_data jsonb NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(account_id,document_id)
);
CREATE TABLE public.finance_bank_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),statement_id uuid NOT NULL REFERENCES public.finance_bank_statements(id),account_id uuid NOT NULL REFERENCES public.finance_bank_accounts(id),
 line_no integer NOT NULL,booking_date date NOT NULL,amount bigint NOT NULL CHECK(amount<>0 AND abs(amount)<=9000000000000),
 reference text NOT NULL,transaction_id text,UNIQUE(statement_id,line_no),UNIQUE(account_id,transaction_id)
);
CREATE TABLE public.finance_bank_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),line_id uuid NOT NULL REFERENCES public.finance_bank_lines(id),account_id uuid NOT NULL REFERENCES public.finance_bank_accounts(id),journal_id uuid NOT NULL REFERENCES public.finance_journals(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 released_by uuid REFERENCES auth.users(id),released_at timestamptz,release_reason text,
 CHECK((released_at IS NULL)=(released_by IS NULL)),CHECK((released_at IS NULL)=(release_reason IS NULL))
);
CREATE UNIQUE INDEX finance_bank_active_line ON public.finance_bank_matches(line_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX finance_bank_active_journal ON public.finance_bank_matches(journal_id,account_id) WHERE released_at IS NULL;
CREATE FUNCTION public.finance_bank_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='finance_bank_matches' AND TG_OP='UPDATE' THEN
  IF OLD.released_at IS NULL AND NEW.released_at IS NOT NULL AND (to_jsonb(NEW)-'released_by'-'released_at'-'release_reason')=(to_jsonb(OLD)-'released_by'-'released_at'-'release_reason') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Bank evidence is immutable; release a match with a reason';
END $$;
CREATE TRIGGER finance_bank_statement_guard BEFORE UPDATE OR DELETE ON public.finance_bank_statements FOR EACH ROW EXECUTE FUNCTION public.finance_bank_guard();
CREATE TRIGGER finance_bank_line_guard BEFORE UPDATE OR DELETE ON public.finance_bank_lines FOR EACH ROW EXECUTE FUNCTION public.finance_bank_guard();
CREATE TRIGGER finance_bank_match_guard BEFORE UPDATE OR DELETE ON public.finance_bank_matches FOR EACH ROW EXECUTE FUNCTION public.finance_bank_guard();
CREATE FUNCTION public.finance_bank_account(p_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid:=gen_random_uuid(); code text:='BANK_'||replace(aid::text,'-','');
BEGIN
 IF public.finance_role() IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO public.finance_accounts(code,name_de,name_en,kind,cash_kind) VALUES(code,p_name,p_name,'asset','bank');
 INSERT INTO public.finance_bank_accounts(id,name,ledger_account) VALUES(aid,trim(p_name),code);
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'bank_account_added',aid::text);
 RETURN aid;
END $$;
-- Import rows are parsed from the preserved original by the authenticated server, not supplied by browser RPC callers.
CREATE FUNCTION public.finance_bank_import(p_actor uuid,p_account uuid,p_document uuid,p_start date,p_end date,p_opening text,p_closing text,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; existing public.finance_bank_statements; rows jsonb:=p_data->'rows';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin') AND NOT EXISTS(SELECT 1 FROM public.finance_members WHERE user_id=p_actor AND role IN ('accountant','staff')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_opening IS NULL OR p_closing IS NULL OR p_opening!~'^-?[0-9]{1,13}$' OR p_closing!~'^-?[0-9]{1,13}$' THEN RAISE EXCEPTION 'Invalid statement dates or balances'; END IF;
 PERFORM 1 FROM public.finance_bank_accounts WHERE id=p_account FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank account not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready' AND mime='text/csv') THEN RAISE EXCEPTION 'Preserved CSV original required'; END IF;
 SELECT * INTO existing FROM public.finance_bank_statements WHERE account_id=p_account AND document_id=p_document;
 IF FOUND THEN
  IF (existing.start_date,existing.end_date,existing.opening,existing.closing,existing.import_data) IS DISTINCT FROM (p_start,p_end,p_opening::bigint,p_closing::bigint,p_data) THEN RAISE EXCEPTION 'Statement was already imported with different settings'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.finance_bank_statements WHERE account_id=p_account AND start_date<=p_end AND end_date>=p_start) THEN RAISE EXCEPTION 'Statement dates overlap an imported statement; no rows were imported'; END IF;
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Provide 1–1000 statement rows'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE coalesce(r->>'amount','')!~'^-?[0-9]{1,13}$' OR coalesce(r->>'date','')!~'^\d{4}-\d{2}-\d{2}$' OR (r->>'date')::date NOT BETWEEN p_start AND p_end) THEN RAISE EXCEPTION 'Invalid row amounts or dates'; END IF;
 IF p_opening::numeric+(SELECT sum((r->>'amount')::numeric) FROM jsonb_array_elements(rows) r)<>p_closing::numeric THEN RAISE EXCEPTION 'Opening balance plus transactions does not equal closing balance'; END IF;
 INSERT INTO public.finance_bank_statements(account_id,document_id,start_date,end_date,opening,closing,import_data,created_by) VALUES(p_account,p_document,p_start,p_end,p_opening::bigint,p_closing::bigint,p_data,p_actor) RETURNING id INTO sid;
 INSERT INTO public.finance_bank_lines(statement_id,account_id,line_no,booking_date,amount,reference,transaction_id)
 SELECT sid,p_account,n::int,(r->>'date')::date,(r->>'amount')::bigint,coalesce(r->>'reference',''),nullif(r->>'transactionId','') FROM jsonb_array_elements(rows) WITH ORDINALITY x(r,n);
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(p_actor,'bank_statement_imported',sid::text);
 RETURN sid;
END $$;
CREATE FUNCTION public.finance_bank_match(p_line uuid,p_journal uuid,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.finance_bank_lines; a public.finance_bank_accounts; j public.finance_journals; mid uuid; value numeric;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Match reason required'; END IF;
 SELECT * INTO l FROM public.finance_bank_lines WHERE id=p_line FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank line not found'; END IF;
 SELECT * INTO a FROM public.finance_bank_accounts WHERE id=l.account_id;
 SELECT * INTO j FROM public.finance_journals WHERE id=p_journal FOR UPDATE;
 IF NOT FOUND OR j.status<>'posted' THEN RAISE EXCEPTION 'Select a posted journal'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=p_journal) OR j.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Reversed journals require manual reconciliation'; END IF;
 SELECT sum(debit-credit) INTO value FROM public.finance_lines WHERE journal_id=p_journal AND account=a.ledger_account;
 IF value IS NULL OR value<>l.amount THEN RAISE EXCEPTION 'Bank account or amount differs'; END IF;
 SELECT id INTO mid FROM public.finance_bank_matches WHERE line_id=p_line AND journal_id=p_journal AND released_at IS NULL;
 IF FOUND THEN RETURN mid; END IF;
 INSERT INTO public.finance_bank_matches(line_id,account_id,journal_id,reason,created_by) VALUES(p_line,l.account_id,p_journal,p_reason,auth.uid()) RETURNING id INTO mid;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'bank_matched',p_line::text,jsonb_build_object('journal',p_journal,'reason',p_reason));
 RETURN mid;
END $$;
CREATE FUNCTION public.finance_bank_release(p_match uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Release reason required'; END IF;
 UPDATE public.finance_bank_matches SET released_by=auth.uid(),released_at=now(),release_reason=p_reason WHERE id=p_match AND released_at IS NULL;
 IF FOUND THEN INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'bank_match_released',p_match::text,jsonb_build_object('reason',p_reason)); END IF;
END $$;
-- A matched entry must be explicitly released before reversing it.
CREATE FUNCTION public.finance_bank_reversal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.reversal_of IS NOT NULL THEN
  PERFORM 1 FROM public.finance_journals WHERE id=NEW.reversal_of FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.finance_bank_matches WHERE journal_id=NEW.reversal_of AND released_at IS NULL) THEN RAISE EXCEPTION 'Release the bank match before reversing this journal'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_bank_reversal_guard BEFORE INSERT ON public.finance_journals FOR EACH ROW EXECUTE FUNCTION public.finance_bank_reversal_guard();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_bank_accounts','finance_bank_statements','finance_bank_lines','finance_bank_matches'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY finance_read ON public.%I FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL)',t);
 END LOOP;
END $$;
ALTER TABLE public.finance_documents DROP CONSTRAINT finance_documents_mime_check;
ALTER TABLE public.finance_documents ADD CONSTRAINT finance_documents_mime_check CHECK(mime IN ('application/pdf','image/png','image/jpeg','application/xml','text/csv'));
UPDATE storage.buckets SET allowed_mime_types=ARRAY['application/pdf','image/png','image/jpeg','application/xml','text/csv'] WHERE id='finance-originals';
REVOKE ALL ON FUNCTION public.finance_bank_guard(),public.finance_bank_account(text),public.finance_bank_import(uuid,uuid,uuid,date,date,text,text,jsonb),public.finance_bank_match(uuid,uuid,text),public.finance_bank_release(uuid,text),public.finance_bank_reversal_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_bank_account(text),public.finance_bank_match(uuid,uuid,text),public.finance_bank_release(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_bank_import(uuid,uuid,uuid,date,date,text,text,jsonb) TO service_role;
CREATE FUNCTION public.finance_bank_classify(p_line uuid,p_action text,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.finance_bank_lines; a public.finance_bank_accounts; doc uuid; jid uuid; debit text; credit text;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Classification reason required'; END IF;
 SELECT * INTO l FROM public.finance_bank_lines WHERE id=p_line FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank line not found'; END IF;

 SELECT * INTO a FROM public.finance_bank_accounts WHERE id=l.account_id;
 SELECT document_id INTO doc FROM public.finance_bank_statements WHERE id=l.statement_id;
 IF p_action='contribution' AND l.amount>0 THEN debit=a.ledger_account;credit='CAPITAL';
 ELSIF p_action='withdrawal' AND l.amount<0 THEN debit='DRAWINGS';credit=a.ledger_account;
 ELSIF p_action='payout' AND l.amount>0 THEN debit=a.ledger_account;credit='CLEARING';
 ELSIF p_action='bank_fee' AND l.amount<0 THEN debit='FEES';credit=a.ledger_account;
 ELSE RAISE EXCEPTION 'Unsupported classification or payment direction'; END IF;
 jid=public.finance_submit('bank-line:'||p_line,l.booking_date,p_reason,jsonb_build_object('reference',doc::text,'kind','bank_'||p_action),jsonb_build_array(
 jsonb_build_object('account',debit,'debit',abs(l.amount)::text,'credit','0'),jsonb_build_object('account',credit,'debit','0','credit',abs(l.amount)::text)));
 IF EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=jid) THEN RAISE EXCEPTION 'Previous classification was reversed; create and match a reviewed replacement journal'; END IF;
 PERFORM public.finance_post(jid);
 PERFORM public.finance_bank_match(p_line,jid,p_reason);
 RETURN jid;
END $$;
CREATE FUNCTION public.finance_bank_list(p_account uuid DEFAULT NULL,p_statement uuid DEFAULT NULL,p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 RETURN jsonb_build_object(
 'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at) FROM public.finance_bank_accounts a),'[]'::jsonb),
 'statements',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY end_date DESC) FROM (
 SELECT s.id,s.document_id,s.start_date,s.end_date,s.opening::text,s.closing::text,
 (SELECT count(*)::int FROM public.finance_bank_lines WHERE statement_id=s.id) line_count,
 (SELECT count(*)::int FROM public.finance_bank_lines l JOIN public.finance_bank_matches m ON m.line_id=l.id AND m.released_at IS NULL WHERE l.statement_id=s.id) matched_count,
 (SELECT coalesce(sum(l.debit-l.credit),0)::text FROM public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id WHERE l.account=a.ledger_account AND j.status='posted' AND j.booking_date<s.start_date) book_opening,
 (SELECT coalesce(sum(l.debit-l.credit),0)::text FROM public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id WHERE l.account=a.ledger_account AND j.status='posted' AND j.booking_date<=s.end_date) book_closing,
 (SELECT (prior.end_date+1=s.start_date AND prior.closing=s.opening) FROM public.finance_bank_statements prior WHERE prior.account_id=s.account_id AND prior.end_date<s.start_date ORDER BY prior.end_date DESC LIMIT 1) continuity
 FROM public.finance_bank_statements s JOIN public.finance_bank_accounts a ON a.id=s.account_id WHERE s.account_id=p_account ORDER BY s.end_date DESC LIMIT 60
 ) s),'[]'::jsonb),
 'lines',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY line_no) FROM (
 SELECT l.id,l.line_no,l.booking_date,l.amount::text,l.reference,l.transaction_id,s.import_data->'rows'->(l.line_no-1)->>'fee' fee,s.import_data->'rows'->(l.line_no-1)->>'gross' gross,m.id match_id,m.journal_id,
 coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM (
 SELECT j.id,j.booking_date,j.memo FROM public.finance_journals j JOIN public.finance_lines jl ON jl.journal_id=j.id
 WHERE j.status='posted' AND jl.account=a.ledger_account AND j.booking_date BETWEEN l.booking_date-3 AND l.booking_date+3 AND j.reversal_of IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.finance_journals WHERE reversal_of=j.id) AND NOT EXISTS(SELECT 1 FROM public.finance_bank_matches WHERE journal_id=j.id AND account_id=l.account_id AND released_at IS NULL)
 GROUP BY j.id HAVING sum(jl.debit-jl.credit)=l.amount ORDER BY abs(j.booking_date-l.booking_date),j.id LIMIT 5
 ) c),'[]'::jsonb) candidates
 FROM public.finance_bank_lines l JOIN public.finance_bank_statements s ON s.id=l.statement_id JOIN public.finance_bank_accounts a ON a.id=l.account_id LEFT JOIN public.finance_bank_matches m ON m.line_id=l.id AND m.released_at IS NULL
 WHERE l.statement_id=p_statement AND l.account_id=p_account ORDER BY l.line_no LIMIT 30 OFFSET p_page*30
 ) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_bank_classify(uuid,text,text),public.finance_bank_list(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_bank_classify(uuid,text,text),public.finance_bank_list(uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_report(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE accounts jsonb; flows jsonb;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY code) INTO accounts FROM (
 SELECT a.code,a.name_de,a.name_en,a.kind,a.cash_kind,
 coalesce(sum(l.debit-l.credit) FILTER(WHERE j.booking_date<p_from),0)::text opening,
 coalesce(sum(l.debit) FILTER(WHERE j.booking_date BETWEEN p_from AND p_to),0)::text debit,
 coalesce(sum(l.credit) FILTER(WHERE j.booking_date BETWEEN p_from AND p_to),0)::text credit,
 coalesce(sum(l.debit-l.credit),0)::text closing
 FROM public.finance_accounts a LEFT JOIN (public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id AND j.status='posted' AND j.booking_date<=p_to) ON l.account=a.code
 GROUP BY a.code,a.name_de,a.name_en,a.kind
 ) a;
 SELECT jsonb_build_object('inflow',coalesce(sum(greatest(net,0)),0)::text,'outflow',(-coalesce(sum(least(net,0)),0))::text) INTO flows FROM (
 SELECT j.id,sum(l.debit-l.credit) net FROM public.finance_journals j JOIN public.finance_lines l ON l.journal_id=j.id
 WHERE j.status='posted' AND j.booking_date BETWEEN p_from AND p_to AND l.account IN (SELECT code FROM public.finance_accounts WHERE cash_kind IS NOT NULL) GROUP BY j.id
 ) x;
 RETURN jsonb_build_object('accounts',accounts,'cash',flows,'from',p_from,'to',p_to,
 'postedCount',(SELECT count(*)::text FROM public.finance_journals WHERE status='posted' AND booking_date BETWEEN p_from AND p_to),
 'draftCount',(SELECT count(*)::text FROM public.finance_journals WHERE status='draft' AND booking_date BETWEEN p_from AND p_to));
END $$;

ALTER TABLE public.finance_expense_payments DROP CONSTRAINT finance_expense_payments_account_check;
ALTER TABLE public.finance_expense_payments ADD FOREIGN KEY(account) REFERENCES public.finance_accounts(code);
CREATE OR REPLACE FUNCTION public.finance_expense_pay(p_id uuid,p_expense uuid,p_document uuid,p_date date,p_amount text,p_account text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_expenses; existing public.finance_expense_payments; paid numeric; jid uuid;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_amount IS NULL OR p_amount!~'^[0-9]{1,13}$' OR p_amount::bigint<=0 OR p_account IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE code=p_account AND active AND cash_kind IS NOT NULL) THEN RAISE EXCEPTION 'Invalid payment'; END IF;
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

-- 20261015150000_finance_costing.sql
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

-- 20261015160000_finance_sales_completion.sql
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

-- 20261015170000_finance_tax_review.sql
CREATE TABLE public.finance_tax_reviews(
 id uuid PRIMARY KEY,journal_id uuid NOT NULL REFERENCES public.finance_journals(id),tax_date date NOT NULL,
 document_id uuid NOT NULL REFERENCES public.finance_documents(id),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),
 allocations jsonb NOT NULL CHECK(jsonb_typeof(allocations)='array'),replaces uuid UNIQUE REFERENCES public.finance_tax_reviews(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_tax_first_review ON public.finance_tax_reviews(journal_id) WHERE replaces IS NULL;
ALTER TABLE public.finance_tax_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_tax_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_tax_reviews TO authenticated;
CREATE POLICY finance_read ON public.finance_tax_reviews FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL);
CREATE TRIGGER finance_tax_review_guard BEFORE UPDATE OR DELETE ON public.finance_tax_reviews FOR EACH ROW EXECUTE FUNCTION public.finance_document_guard();
CREATE FUNCTION public.finance_tax_review(p_id uuid,p_journal uuid,p_date date,p_document uuid,p_reason text,p_allocations jsonb,p_replaces uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.finance_journals;old public.finance_tax_reviews;net numeric;item jsonb;
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO j FROM public.finance_journals WHERE id=p_journal FOR UPDATE;
 IF NOT FOUND OR j.status<>'posted' THEN RAISE EXCEPTION 'Posted journal required'; END IF;
 SELECT * INTO old FROM public.finance_tax_reviews WHERE id=p_id;
 IF FOUND THEN IF (old.journal_id,old.tax_date,old.document_id,old.reason,old.allocations,old.replaces) IS DISTINCT FROM(p_journal,p_date,p_document,trim(p_reason),p_allocations,p_replaces) THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN p_id; END IF;
 IF p_date IS NULL OR abs(p_date-j.booking_date)>10 THEN RAISE EXCEPTION 'Tax date must be within ten days of ledger date; special cases require separate review'; END IF;
 -- Lock both affected accounting periods. No editing classification in a closed period.
 PERFORM 1 FROM public.finance_periods WHERE id IN (j.period,date_trunc('month',p_date)::date,(SELECT date_trunc('month',tax_date)::date FROM public.finance_tax_reviews WHERE id=p_replaces)) ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.finance_periods WHERE id=date_trunc('month',p_date)::date AND NOT closed) OR EXISTS(SELECT 1 FROM public.finance_periods WHERE id=j.period AND closed) THEN RAISE EXCEPTION 'Period missing or closed'; END IF;
 IF p_replaces IS NOT NULL THEN
 SELECT * INTO old FROM public.finance_tax_reviews WHERE id=p_replaces;
 IF NOT FOUND OR old.journal_id<>p_journal OR EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE replaces=p_replaces) THEN RAISE EXCEPTION 'Replace the current review for this journal'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_periods WHERE id=date_trunc('month',old.tax_date)::date AND closed) THEN RAISE EXCEPTION 'Previous tax period is closed'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_documents WHERE id=p_document AND state='ready') THEN RAISE EXCEPTION 'Reviewed original evidence required'; END IF;
 SELECT sum(l.debit-l.credit) INTO net FROM public.finance_lines l JOIN public.finance_accounts a ON a.code=l.account WHERE l.journal_id=p_journal AND (a.cash_kind IS NOT NULL OR a.code='CLEARING');
 IF net IS NULL THEN RAISE EXCEPTION 'Journal has no cash or payment-clearing movement'; END IF;
 IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Provide 1–50 tax allocations'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
 IF coalesce(item->>'category','') NOT IN ('receipts','goods','operating','fees','asset','excluded') OR coalesce(item->>'amount','')!~'^-?[0-9]{1,13}$' OR coalesce(item->>'turnover','')!~'^-?[0-9]{1,13}$' THEN RAISE EXCEPTION 'Invalid tax allocation'; END IF;
 IF (item->>'turnover')::bigint<>0 AND (item->>'category'<>'receipts' OR sign((item->>'turnover')::numeric)<>sign((item->>'amount')::numeric) OR abs((item->>'turnover')::numeric)>abs((item->>'amount')::numeric)) THEN RAISE EXCEPTION 'Turnover must be a signed part of a receipt or refund'; END IF;
 END LOOP;
 IF (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(p_allocations) x)<>net THEN RAISE EXCEPTION 'Tax allocations must equal cash/clearing movement'; END IF;
 INSERT INTO public.finance_tax_reviews VALUES(p_id,p_journal,p_date,p_document,trim(p_reason),p_allocations,p_replaces,auth.uid(),now());
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'tax_review_saved',p_id::text);
 RETURN p_id;
END $$;
CREATE FUNCTION public.finance_tax_list(p_year integer,p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE start_day date;end_day date;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_year NOT BETWEEN 2026 AND 2100 OR p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid year/page'; END IF;
 start_day=make_date(p_year,1,1);end_day=make_date(p_year,12,31);
 RETURN jsonb_build_object(
 'journals',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
 SELECT j.id,j.booking_date,j.memo,j.source,j.reversal_of,sum(l.debit-l.credit)::text net,
 (SELECT to_jsonb(r) FROM public.finance_tax_reviews r WHERE r.journal_id=j.id AND NOT EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE replaces=r.id)) review
 FROM public.finance_journals j JOIN public.finance_lines l ON l.journal_id=j.id JOIN public.finance_accounts a ON a.code=l.account
 WHERE j.status='posted' AND (a.cash_kind IS NOT NULL OR a.code='CLEARING') AND j.booking_date BETWEEN start_day AND end_day GROUP BY j.id ORDER BY j.booking_date,j.id LIMIT 30 OFFSET p_page*30)x),'[]'::jsonb),
 'totals',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT a->>'category' category,sum((a->>'amount')::numeric)::text amount FROM public.finance_tax_reviews r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a WHERE r.tax_date BETWEEN start_day AND end_day AND NOT EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE replaces=r.id) GROUP BY a->>'category')x),'[]'::jsonb),
 'turnover',coalesce((SELECT sum((a->>'turnover')::numeric)::text FROM public.finance_tax_reviews r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a WHERE r.tax_date BETWEEN start_day AND end_day AND NOT EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE replaces=r.id)),'0'),
 'positiveTurnover',coalesce((SELECT sum(greatest((a->>'turnover')::numeric,0))::text FROM public.finance_tax_reviews r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a WHERE r.tax_date BETWEEN start_day AND end_day AND NOT EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE replaces=r.id)),'0'),
 'previousTurnover',coalesce((SELECT sum((a->>'turnover')::numeric)::text FROM public.finance_tax_reviews r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a WHERE r.tax_date>=start_day-interval '1 year' AND r.tax_date<start_day AND NOT EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE replaces=r.id)),'0'),
 'unreviewed',(SELECT count(*)::text FROM public.finance_journals j WHERE j.status='posted' AND j.booking_date BETWEEN start_day AND end_day AND EXISTS(SELECT 1 FROM public.finance_lines l JOIN public.finance_accounts a ON a.code=l.account WHERE l.journal_id=j.id AND (a.cash_kind IS NOT NULL OR a.code='CLEARING')) AND NOT EXISTS(SELECT 1 FROM public.finance_tax_reviews WHERE journal_id=j.id)),
 'drafts',(SELECT count(*)::text FROM public.finance_journals WHERE status='draft' AND booking_date BETWEEN start_day AND end_day),
 'closedPeriods',(SELECT count(*)::text FROM public.finance_periods WHERE closed AND id BETWEEN start_day AND end_day),
 'rules',jsonb_build_object('firstYear',2026,'currentLimit',CASE WHEN p_year=2026 THEN '2500000' ELSE '10000000' END,'previousLimit','2500000','verifiedOn','2026-10-15'));
END $$;
REVOKE ALL ON FUNCTION public.finance_tax_review(uuid,uuid,date,uuid,text,jsonb,uuid),public.finance_tax_list(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_tax_review(uuid,uuid,date,uuid,text,jsonb,uuid),public.finance_tax_list(integer,integer) TO authenticated;

-- 20261015180000_finance_exports.sql
CREATE FUNCTION public.finance_export(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;n bigint;
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to THEN RAISE EXCEPTION 'Invalid period'; END IF;
 SELECT count(*) INTO n FROM public.finance_lines l JOIN public.finance_journals j ON j.id=l.journal_id WHERE j.booking_date BETWEEN p_from AND p_to;
 IF n>20000 THEN RAISE EXCEPTION 'More than 20,000 lines; choose a narrower export period'; END IF;
 SELECT jsonb_build_object('generatedAt',now(),'from',p_from,'to',p_to,'mapping','internal-unmapped','report',public.finance_report(p_from,p_to),
 'lines',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY booking_date,journal_id,line_no) FROM (
 SELECT j.id journal_id,j.external_key,j.booking_date,j.memo,j.status,j.source::text source,j.reversal_of,l.line_no,l.account,l.debit::text,l.credit::text FROM public.finance_journals j JOIN public.finance_lines l ON l.journal_id=j.id WHERE j.booking_date BETWEEN p_from AND p_to
 )x),'[]'::jsonb)) INTO result;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'accountant_export',p_from||'/'||p_to,jsonb_build_object('lineCount',n::text));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_export(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_export(date,date) TO authenticated;

-- 20261015190000_finance_automation.sql
CREATE TABLE public.finance_automation(id boolean PRIMARY KEY DEFAULT true CHECK(id),sales boolean NOT NULL DEFAULT false,stock boolean NOT NULL DEFAULT false,authorized_by uuid REFERENCES auth.users(id),enabled_from timestamptz NOT NULL DEFAULT now());
INSERT INTO public.finance_automation(id) VALUES(true);
ALTER TABLE public.finance_automation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_automation FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.finance_automation_settings(p_sales boolean DEFAULT NULL,p_stock boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_sales IS NOT NULL OR p_stock IS NOT NULL THEN
 IF public.finance_role() IS DISTINCT FROM 'owner' OR p_sales IS NULL OR p_stock IS NULL THEN RAISE EXCEPTION 'Owner must confirm both automation settings'; END IF;
 UPDATE public.finance_automation SET sales=p_sales,stock=p_stock,authorized_by=auth.uid(),enabled_from=now() WHERE id;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'automation_policy','future_events',jsonb_build_object('sales',p_sales,'stock',p_stock));
 END IF;
 RETURN (SELECT to_jsonb(a) FROM public.finance_automation a WHERE id);
END $$;
CREATE FUNCTION public.finance_auto_run() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.finance_automation;old_sub text:=current_setting('request.jwt.claim.sub',true);initiator uuid:=auth.uid();failure text;result jsonb;
BEGIN
 SELECT * INTO cfg FROM public.finance_automation WHERE id;
 IF cfg.authorized_by IS NULL OR NEW.created_at<cfg.enabled_from OR (TG_TABLE_NAME='finance_sales_events' AND NOT cfg.sales) OR (TG_TABLE_NAME='finance_stock_events' AND NOT cfg.stock) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=cfg.authorized_by AND role='admin') THEN RETURN NULL; END IF;
 -- Execute only the policy-approved handlers as the approving owner, then restore the caller identity.
 -- No caller-supplied actor is accepted; authorization is stored by the owner-only settings RPC.
 BEGIN
 PERFORM set_config('request.jwt.claim.sub',cfg.authorized_by::text,true);
 IF TG_TABLE_NAME='finance_sales_events' THEN result=public.finance_sales_complete(NEW.id); ELSE result=public.finance_stock_process(NEW.id); END IF;
 failure=result->>'error';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 IF failure IS NOT NULL THEN
 IF TG_TABLE_NAME='finance_sales_events' THEN UPDATE public.finance_sales_events SET last_error=left(failure,500) WHERE id=NEW.id AND journal_id IS NULL;
 ELSE UPDATE public.finance_stock_events SET last_error=left(failure,500) WHERE id=NEW.id AND processed_at IS NULL; END IF;
 END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(cfg.authorized_by,'automatic_finance_event',NEW.id::text,jsonb_build_object('source',TG_TABLE_NAME,'initiator',initiator::text,'error',left(failure,500)));
 RETURN NULL;
END $$;
CREATE TRIGGER finance_auto_sales AFTER INSERT ON public.finance_sales_events FOR EACH ROW EXECUTE FUNCTION public.finance_auto_run();
CREATE TRIGGER finance_auto_stock AFTER INSERT ON public.finance_stock_events FOR EACH ROW EXECUTE FUNCTION public.finance_auto_run();
REVOKE ALL ON FUNCTION public.finance_auto_run(),public.finance_automation_settings(boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_automation_settings(boolean,boolean) TO authenticated;

-- 20261015200000_finance_administration.sql
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

-- 20261015210000_finance_incoming_validation.sql
CREATE TABLE public.finance_validations(extraction_id uuid PRIMARY KEY REFERENCES public.finance_extractions(id),state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','finished','error')),lease uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,result jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
ALTER TABLE public.finance_validations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_validations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_validations TO authenticated;
CREATE POLICY finance_read ON public.finance_validations FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL);
CREATE FUNCTION public.finance_validation_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO public.finance_validations(extraction_id) VALUES(NEW.id);RETURN NULL;END $$;
CREATE TRIGGER finance_validation_enqueue AFTER INSERT ON public.finance_extractions FOR EACH ROW EXECUTE FUNCTION public.finance_validation_enqueue();
CREATE FUNCTION public.finance_validation_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.finance_validations;token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO job FROM public.finance_validations WHERE state='queued' OR (state='processing' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.finance_validations SET state='processing',lease=token,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE extraction_id=job.extraction_id;
 RETURN (SELECT jsonb_build_object('id',job.extraction_id,'lease',token,'xml',result->>'xml','profile',result->>'profile') FROM public.finance_extractions WHERE id=job.extraction_id);
END $$;
CREATE FUNCTION public.finance_validation_finish(p_id uuid,p_lease uuid,p_result jsonb,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_result IS NOT NULL AND (jsonb_typeof(p_result->'accepted') IS DISTINCT FROM 'boolean' OR length(p_result::text)>5000000) THEN RAISE EXCEPTION 'Invalid validator result'; END IF;
 IF (p_result IS NULL)=(p_error IS NULL) THEN RAISE EXCEPTION 'Provide a report or an error'; END IF;
 UPDATE public.finance_validations SET state=CASE WHEN p_error IS NULL THEN 'finished' ELSE 'error' END,result=p_result,error=left(p_error,1000),finished_at=now(),lease=NULL,lease_until=NULL WHERE extraction_id=p_id AND state='processing' AND lease=p_lease AND lease_until>=now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Validation lease expired or superseded'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES((SELECT created_by FROM public.finance_extractions WHERE id=p_id),'incoming_validation_finished',p_id::text,jsonb_build_object('execution','local_validation_worker','accepted',p_result->'accepted','error',left(p_error,1000)));
END $$;
CREATE FUNCTION public.finance_validation_retry(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant','staff') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 -- Infrastructure errors only. Rejected immutable originals retain their official rejection report.
 UPDATE public.finance_validations SET state='queued',error=NULL,finished_at=NULL WHERE extraction_id=p_id AND state='error';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only failed validation infrastructure can retry'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'incoming_validation_retry',p_id::text);
END $$;
CREATE OR REPLACE FUNCTION public.finance_document_details(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('retention',(SELECT to_jsonb(r) FROM public.finance_document_retention r WHERE document_id=p_id),'extractions',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT e.id,e.engine,e.result,e.created_at,(SELECT jsonb_build_object('state',v.state,'accepted',v.result->'accepted','engine',v.result->>'engine','configuration',v.result->>'configuration','report',v.result->>'report','error',v.error,'attempts',v.attempts) FROM public.finance_validations v WHERE extraction_id=e.id) validation FROM public.finance_extractions e WHERE document_id=p_id ORDER BY created_at DESC LIMIT 10)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_validation_enqueue(),public.finance_validation_claim(),public.finance_validation_finish(uuid,uuid,jsonb,text),public.finance_validation_retry(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_validation_claim(),public.finance_validation_finish(uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_validation_retry(uuid) TO authenticated;

-- 20261015220000_finance_assets.sql
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

-- Existing Supabase migration history was verified during deployment preflight.
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
('20261015100000','finance_foundation'),
('20261015110000','finance_documents_expenses'),
('20261015120000','finance_reports'),
('20261015130000','finance_sales_inbox'),
('20261015140000','finance_banking'),
('20261015150000','finance_costing'),
('20261015160000','finance_sales_completion'),
('20261015170000','finance_tax_review'),
('20261015180000','finance_exports'),
('20261015190000','finance_automation'),
('20261015200000','finance_administration'),
('20261015210000','finance_incoming_validation'),
('20261015220000','finance_assets');
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'Finance migrations installed' AS result;
