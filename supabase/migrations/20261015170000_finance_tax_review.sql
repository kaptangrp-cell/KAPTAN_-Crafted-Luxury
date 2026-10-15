BEGIN;
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
COMMIT;
