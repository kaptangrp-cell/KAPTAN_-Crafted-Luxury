BEGIN;
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
COMMIT;
