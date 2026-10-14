BEGIN;
CREATE SEQUENCE public.web_invoice_numbers;
CREATE TABLE public.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('advance','final','credit')), number text NOT NULL UNIQUE DEFAULT ('KPT-WEB-'||lpad(nextval('web_invoice_numbers')::text,8,'0')),
 created_at timestamptz NOT NULL DEFAULT now(), issued_at timestamptz, issue_date date,
 source jsonb NOT NULL, model jsonb, xml text, pdf_base64 text, xml_sha256 text, pdf_sha256 text, validation jsonb,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','error','issued')),
 lease uuid, lease_until timestamptz, error text,
 UNIQUE(order_id,kind), CHECK(state<>'issued' OR (model IS NOT NULL AND xml IS NOT NULL AND pdf_base64 IS NOT NULL AND validation->>'accepted'='true'))
);
CREATE TABLE public.invoice_delivery (
 invoice_id uuid PRIMARY KEY REFERENCES invoices(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','error','uncertain')),
 lease uuid, lease_until timestamptz, first_attempt_at timestamptz, sent_at timestamptz, provider_id text, error text,
 portal_submitted_at timestamptz, portal_reference text
);
CREATE TABLE public.invoice_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
 at timestamptz NOT NULL DEFAULT now(), actor uuid, event text NOT NULL, details jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoices,invoice_delivery,invoice_audit FROM anon,authenticated;
GRANT SELECT ON invoices,invoice_delivery,invoice_audit TO authenticated;
CREATE POLICY invoice_admin ON invoices FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY invoice_delivery_admin ON invoice_delivery FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY invoice_audit_admin ON invoice_audit FOR SELECT TO authenticated USING(public.is_admin());
GRANT ALL ON invoices,invoice_delivery,invoice_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE web_invoice_numbers,invoice_audit_id_seq TO service_role;
CREATE FUNCTION public.guard_invoice_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state='issued' THEN RAISE EXCEPTION 'Issued invoice records are immutable; use a linked correction'; END IF;
 IF NEW.source IS DISTINCT FROM OLD.source OR NEW.number IS DISTINCT FROM OLD.number OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.order_id IS DISTINCT FROM OLD.order_id THEN RAISE EXCEPTION 'Invoice source snapshots cannot change'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_invoice_archive BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice_archive();
CREATE FUNCTION public.guard_invoice_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Invoice audit is append-only'; END; $$;
CREATE TRIGGER guard_invoice_audit BEFORE UPDATE OR DELETE ON invoice_audit FOR EACH ROW EXECUTE FUNCTION guard_invoice_audit();
CREATE FUNCTION public.enqueue_paid_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actual orders%ROWTYPE; invoice_id uuid; items jsonb;
BEGIN
 SELECT * INTO actual FROM orders WHERE id=NEW.id;
 IF actual.payment_status<>'paid' OR actual.tax_data->>'version' IS DISTINCT FROM '1' OR actual.billing_data IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) INTO items FROM order_items i WHERE i.order_id=NEW.id;
 IF items IS NULL THEN RAISE EXCEPTION 'Paid order has no invoice lines'; END IF;
 INSERT INTO invoices(order_id,kind,source) VALUES(actual.id,'advance',jsonb_build_object('order',to_jsonb(actual),'items',items,'paidDate',(now() AT TIME ZONE 'Europe/Berlin')::date)) ON CONFLICT(order_id,kind) DO NOTHING RETURNING id INTO invoice_id;
 IF invoice_id IS NOT NULL THEN INSERT INTO invoice_audit(invoice_id,event) VALUES(invoice_id,'queued_after_verified_payment'); END IF;
 RETURN NULL;
END; $$;
-- Deferred: settlement inserts order_items after the order, in the same transaction.
CREATE CONSTRAINT TRIGGER enqueue_paid_invoice AFTER INSERT OR UPDATE OF payment_status ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enqueue_paid_invoice();
CREATE FUNCTION public.claim_invoice() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row invoices%ROWTYPE;
BEGIN
 SELECT * INTO row FROM invoices WHERE state='queued' OR (state='processing' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE invoices SET state='processing',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',issue_date=coalesce(issue_date,(now() AT TIME ZONE 'Europe/Berlin')::date),error=NULL WHERE id=row.id RETURNING * INTO row;
 RETURN to_jsonb(row);
END; $$;
CREATE FUNCTION public.finish_invoice(p_id uuid,p_lease uuid,p_model jsonb,p_xml text,p_pdf text,p_xml_hash text,p_pdf_hash text,p_validation jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_validation->>'accepted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Invoice validation is required'; END IF;
 UPDATE invoices SET model=p_model,xml=p_xml,pdf_base64=p_pdf,xml_sha256=p_xml_hash,pdf_sha256=p_pdf_hash,validation=p_validation,state='issued',issued_at=now(),lease=NULL,lease_until=NULL WHERE id=p_id AND state='processing' AND lease=p_lease;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice lease lost'; END IF;
 INSERT INTO invoice_delivery(invoice_id) VALUES(p_id);
 INSERT INTO invoice_audit(invoice_id,event,details) VALUES(p_id,'issued',jsonb_build_object('xml_sha256',p_xml_hash,'pdf_sha256',p_pdf_hash));
END; $$;
CREATE FUNCTION public.invoice_admin_action(p_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original invoices%ROWTYPE; created_id uuid; supply date;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO original FROM invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
 IF p_action='retry' THEN
  UPDATE invoices SET state='queued',error=NULL WHERE id=p_id AND state='error';
  UPDATE invoice_delivery SET state='pending',error=NULL WHERE invoice_id=p_id AND state='error';
 ELSIF p_action='portal_submitted' THEN
  IF original.state<>'issued' OR original.model->'buyer'->>'deliveryChannel'<>'portal' OR length(trim(coalesce(p_data->>'reference','')))=0 THEN RAISE EXCEPTION 'Issued portal invoice and receipt reference required'; END IF;
  UPDATE invoice_delivery SET portal_submitted_at=now(),portal_reference=p_data->>'reference' WHERE invoice_id=p_id;
 ELSIF p_action IN ('final','credit') THEN
  IF original.state<>'issued' OR original.kind='credit' THEN RAISE EXCEPTION 'An issued original invoice is required'; END IF;
  IF p_action='final' THEN
   IF original.kind<>'advance' THEN RAISE EXCEPTION 'Select the advance invoice'; END IF;
   supply=(p_data->>'supplyDate')::date;
   IF supply IS NULL OR supply>(now() AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Actual supply date is required'; END IF;
   IF EXISTS(SELECT 1 FROM invoices WHERE order_id=original.order_id AND kind='credit') THEN RAISE EXCEPTION 'Order has a correction'; END IF;
  ELSE
   IF length(trim(coalesce(p_data->>'reason','')))<5 THEN RAISE EXCEPTION 'Correction reason required'; END IF;
   IF original.kind='advance' AND EXISTS(SELECT 1 FROM invoices WHERE order_id=original.order_id AND kind='final') THEN RAISE EXCEPTION 'Correct the final invoice instead'; END IF;
  END IF;
  INSERT INTO invoices(order_id,kind,source) VALUES(original.order_id,p_action,original.source || jsonb_build_object('supplyDate',supply,'reason',p_data->>'reason','reference',jsonb_build_object('number',original.number,'date',original.issue_date,'net',original.model->'net','vat',original.model->'vat','gross',(original.model->>'gross')::int+(original.model->>'rounding')::int))) RETURNING id INTO created_id;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
 INSERT INTO invoice_audit(invoice_id,actor,event,details) VALUES(coalesce(created_id,p_id),auth.uid(),p_action,p_data);
END; $$;
REVOKE ALL ON FUNCTION claim_invoice(),finish_invoice(uuid,uuid,jsonb,text,text,text,text,jsonb),enqueue_paid_invoice(),guard_invoice_archive(),guard_invoice_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_invoice(),finish_invoice(uuid,uuid,jsonb,text,text,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION invoice_admin_action(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION invoice_admin_action(uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.invoice_products() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM (SELECT item->>'product_id' id,max(item->>'product_name') name FROM invoices i CROSS JOIN LATERAL jsonb_array_elements(i.source->'items') item WHERE item->>'product_id' IS NOT NULL GROUP BY item->>'product_id') p),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION invoice_products() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION invoice_products() TO authenticated;
COMMIT;
