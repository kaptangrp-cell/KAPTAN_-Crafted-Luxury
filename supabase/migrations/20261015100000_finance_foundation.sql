BEGIN;
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
COMMIT;
