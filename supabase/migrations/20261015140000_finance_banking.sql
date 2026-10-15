BEGIN;
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
COMMIT;
