BEGIN;
-- One reviewed action, one transaction. An invalid posting leaves no orphan draft.
CREATE OR REPLACE FUNCTION public.finance_expense_record(p_id uuid,p_document uuid,p_supplier text,p_number text,p_date date,p_description text,p_gross text,p_replaces uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM public.finance_expense_draft(p_id,p_document,p_supplier,p_number,p_date,p_description,p_gross,p_replaces);
 PERFORM public.finance_expense_post(p_id);
 RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION public.finance_invoice_intake(p_ids uuid[] DEFAULT ARRAY[]::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF coalesce(cardinality(p_ids),0)>30 THEN RAISE EXCEPTION 'Too many documents'; END IF;
 RETURN jsonb_build_object(
  'unassigned',(SELECT count(*) FROM public.finance_documents d WHERE state='ready' AND mime<>'text/csv'
    AND NOT EXISTS(SELECT 1 FROM public.finance_expenses e WHERE e.document_id=d.id)
    AND NOT EXISTS(SELECT 1 FROM public.finance_expense_payments p WHERE p.document_id=d.id)),
  'drafts',(SELECT count(*) FROM public.finance_expenses e WHERE journal_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.finance_expenses n WHERE n.replaces=e.id)),
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',d.id,'expense',
    CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',e.id,'document_id',e.document_id,'supplier',e.supplier,'invoice_number',e.invoice_number,
      'invoice_date',e.invoice_date,'description',e.description,'gross',e.gross::text,'journal_id',e.journal_id,'replaces',e.replaces,
      'reversed',EXISTS(SELECT 1 FROM public.finance_journals j WHERE j.reversal_of=e.journal_id),'superseded',false,
      'paid',(SELECT coalesce(sum(p.amount),0)::text FROM public.finance_expense_payments p WHERE p.expense_id=e.id AND NOT EXISTS(SELECT 1 FROM public.finance_journals j WHERE j.reversal_of=p.journal_id))) END))
    FROM public.finance_documents d LEFT JOIN LATERAL
    (SELECT x.* FROM public.finance_expenses x WHERE x.document_id=d.id AND NOT EXISTS(SELECT 1 FROM public.finance_expenses n WHERE n.replaces=x.id)
      ORDER BY (x.journal_id IS NOT NULL) DESC,x.created_at DESC,x.id DESC LIMIT 1) e ON true
    WHERE d.id=ANY(p_ids)),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_expense_record(uuid,uuid,text,text,date,text,text,uuid),public.finance_invoice_intake(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_expense_record(uuid,uuid,text,text,date,text,text,uuid),public.finance_invoice_intake(uuid[]) TO authenticated;
COMMIT;
