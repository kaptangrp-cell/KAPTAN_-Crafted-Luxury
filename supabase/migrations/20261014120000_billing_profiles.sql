-- Deploy with the billing-aware checkout application, after the QR warehouse migration.
-- Captures buyer identity; does not change prices, tax amounts, payments or issue invoices.
BEGIN;
ALTER TABLE public.orders ADD COLUMN billing_data jsonb;
ALTER FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb) RENAME TO create_checkout_draft_before_billing;
REVOKE ALL ON FUNCTION public.create_checkout_draft_before_billing(uuid,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.create_checkout_draft(p_request_key uuid,p_owner_hash text,p_request_hash text,p_user_id uuid,p_order jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; billing jsonb:=p_order->'billing_data'; kind text;
BEGIN
 kind=billing->>'customerType';
 IF billing IS NULL OR kind IS NULL OR kind NOT IN ('private','business','public_authority') OR billing->>'version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Billing details are required. Reload checkout.'; END IF;
 IF billing->>'emailConsent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Electronic invoice delivery consent is required'; END IF;
 IF upper(p_order->'shipping_address'->>'country') IS DISTINCT FROM 'DE' OR billing->'address'->>'country' IS DISTINCT FROM 'DE' THEN RAISE EXCEPTION 'Delivery and billing are currently supported in Germany only'; END IF;
 IF length(trim(coalesce(billing->>'legalName','')))=0 OR length(trim(coalesce(billing->>'email','')))=0 OR length(trim(coalesce(billing->'address'->>'line1','')))=0 OR length(trim(coalesce(billing->'address'->>'city','')))=0 OR length(trim(coalesce(billing->'address'->>'postalCode','')))=0 THEN RAISE EXCEPTION 'Complete billing name, address and email'; END IF;
 IF kind='public_authority' AND length(trim(coalesce(billing->>'buyerReference','')))=0 THEN RAISE EXCEPTION 'Public authority buyer reference is required'; END IF;
 IF billing->>'deliveryChannel' IS NULL OR billing->>'deliveryChannel' NOT IN ('email','portal') THEN RAISE EXCEPTION 'Invalid invoice delivery channel'; END IF;
 IF kind='public_authority' AND billing->>'deliveryChannel'='portal' AND length(trim(coalesce(billing->>'portalInstructions','')))=0 THEN RAISE EXCEPTION 'Invoice submission instructions required'; END IF;
 result=public.create_checkout_draft_before_billing(p_request_key,p_owner_hash,p_request_hash,p_user_id,p_order);
 -- The old function and this snapshot commit together, before any provider can settle.
 UPDATE checkout_drafts SET order_data=order_data || jsonb_build_object('billing_data',billing || jsonb_build_object('consentRecordedAt',now()))
 WHERE id=(result->>'orderId')::uuid AND NOT (order_data ? 'billing_data');
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb) TO service_role;
CREATE FUNCTION public.protect_order_billing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.billing_data IS DISTINCT FROM OLD.billing_data THEN RAISE EXCEPTION 'Order billing snapshots cannot be overwritten'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_order_billing BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.protect_order_billing();
REVOKE ALL ON FUNCTION public.protect_order_billing() FROM PUBLIC,anon,authenticated;
COMMIT;
