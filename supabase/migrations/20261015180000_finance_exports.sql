BEGIN;
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
COMMIT;
