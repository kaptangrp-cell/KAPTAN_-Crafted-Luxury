BEGIN;
CREATE TABLE public.admin_record_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
 action text NOT NULL, target_id uuid NOT NULL, before_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_record_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_record_changes FROM PUBLIC,anon,authenticated;
-- Keep historical identities stable; unused, empty options can be corrected or removed.
CREATE OR REPLACE FUNCTION public.inventory_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE managed boolean; used boolean;
BEGIN
 IF TG_TABLE_NAME='products' THEN
  IF TG_OP='UPDATE' AND OLD.qr_inventory AND NOT NEW.qr_inventory THEN RAISE EXCEPTION 'QR inventory cannot be disabled'; END IF;
  IF NEW.qr_inventory AND NEW.stock_quantity IS DISTINCT FROM (SELECT count(*)::int FROM inventory_units WHERE product_id=NEW.id AND state='available') THEN RAISE EXCEPTION 'QR stock changes require a scan'; END IF;
 ELSE
  SELECT qr_inventory INTO managed FROM products WHERE id=coalesce(NEW.product_id,OLD.product_id);
  IF TG_OP IN ('DELETE','UPDATE') THEN
   used=EXISTS(SELECT 1 FROM inventory_units WHERE variant_id=OLD.id)
     OR EXISTS(SELECT 1 FROM order_items WHERE variant_id=OLD.id)
     OR EXISTS(SELECT 1 FROM inventory_purchase_lines WHERE variant_id=OLD.id)
     OR EXISTS(SELECT 1 FROM checkout_drafts d JOIN order_checkouts c ON c.order_id=d.id CROSS JOIN LATERAL jsonb_array_elements(d.item_data) i WHERE c.state='reserved' AND i->>'variant_id'=OLD.id::text);
   IF TG_OP='DELETE' AND (used OR coalesce(OLD.stock_quantity,0)<>0) THEN RAISE EXCEPTION 'This option has stock or history. Make it inactive instead.'; END IF;
   IF TG_OP='UPDATE' AND (NEW.product_id<>OLD.product_id OR NEW.variant_type<>OLD.variant_type OR NEW.variant_value<>OLD.variant_value) AND used THEN RAISE EXCEPTION 'This option has history. Deactivate it and add a new option.'; END IF;
  END IF;
  IF managed AND TG_OP<>'DELETE' AND coalesce(NEW.stock_quantity,0) IS DISTINCT FROM (SELECT count(*)::int FROM inventory_units WHERE variant_id=NEW.id AND state='available') THEN RAISE EXCEPTION 'QR stock changes require a scan'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Only the admin-only cleanup RPC may discard unprocessed creation events.
CREATE OR REPLACE FUNCTION public.finance_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_setting('warehouse.discard_unused',true)='yes' AND public.is_admin()
    AND OLD.processed_at IS NULL AND OLD.journal_id IS NULL AND OLD.delta IS NULL
    AND OLD.old_state IS NULL AND OLD.new_state='expected' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Stock event history cannot be deleted';
 END IF;
 IF OLD.processed_at IS NOT NULL OR (to_jsonb(OLD)-'journal_id'-'processed_at'-'attempts'-'last_error'-'delta') IS DISTINCT FROM (to_jsonb(NEW)-'journal_id'-'processed_at'-'attempts'-'last_error'-'delta') THEN RAISE EXCEPTION 'Stock event source is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.admin_manage_record(p_action text,p_id uuid,p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before jsonb; ids uuid[]; changed integer; line jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_action='variant_delete' THEN
  PERFORM 1 FROM products WHERE id=(SELECT product_id FROM product_variants WHERE id=p_id) FOR UPDATE;
  SELECT to_jsonb(v) INTO before FROM product_variants v WHERE id=p_id FOR UPDATE;
  IF before IS NULL THEN RETURN '{"deleted":0}'; END IF;
  DELETE FROM product_variants WHERE id=p_id;
 ELSIF p_action IN ('label_delete','batch_delete','label_edit') THEN
  SELECT array_agg(id ORDER BY id) INTO ids FROM inventory_units WHERE (p_action='batch_delete' AND batch_id=p_id) OR (p_action<>'batch_delete' AND id=p_id);
  IF ids IS NULL THEN RETURN '{"deleted":0}'; END IF;
  PERFORM 1 FROM products WHERE id IN (SELECT product_id FROM inventory_units WHERE id=ANY(ids)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM product_variants WHERE id IN (SELECT variant_id FROM inventory_units WHERE id=ANY(ids)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM inventory_units WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(to_jsonb(u)) INTO before FROM inventory_units u WHERE id=ANY(ids);
  IF p_action='label_edit' THEN
   IF length(trim(coalesce(p_data->>'location',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Enter a shelf location'; END IF;
   IF EXISTS(SELECT 1 FROM inventory_units WHERE id=ANY(ids) AND (order_id IS NOT NULL OR state NOT IN ('expected','available','quarantine','damaged'))) THEN RAISE EXCEPTION 'Assigned or sold items cannot be moved'; END IF;
   PERFORM set_config('warehouse.reason','Admin location correction',true);
   UPDATE inventory_units SET location=trim(p_data->>'location'),updated_at=now() WHERE id=ANY(ids);
  ELSE
   IF EXISTS(SELECT 1 FROM inventory_units WHERE id=ANY(ids) AND (state<>'expected' OR order_id IS NOT NULL))
    OR EXISTS(SELECT 1 FROM inventory_events WHERE unit_id=ANY(ids) AND ((old_state IS NOT NULL AND old_state<>'expected') OR new_state<>'expected' OR order_id IS NOT NULL))
    OR EXISTS(SELECT 1 FROM finance_unit_costs WHERE unit_id=ANY(ids))
    OR EXISTS(SELECT 1 FROM finance_stock_events WHERE unit_id=ANY(ids) AND (processed_at IS NOT NULL OR journal_id IS NOT NULL OR delta IS NOT NULL OR old_state IS NOT NULL OR new_state<>'expected'))
    OR EXISTS(SELECT 1 FROM festival_baskets WHERE units && ids)
   THEN RAISE EXCEPTION 'Only unused labels can be deleted. This item has stock, sales or accounting history.'; END IF;
   before=jsonb_build_object('units',before,'events',(SELECT jsonb_agg(to_jsonb(e)) FROM inventory_events e WHERE unit_id=ANY(ids)), 'finance_events',(SELECT jsonb_agg(to_jsonb(e)) FROM finance_stock_events e WHERE unit_id=ANY(ids)));
   PERFORM set_config('warehouse.discard_unused','yes',true);
   DELETE FROM finance_stock_events WHERE unit_id=ANY(ids);
   PERFORM set_config('warehouse.discard_unused','no',true);
   DELETE FROM inventory_events WHERE unit_id=ANY(ids);
   DELETE FROM inventory_units WHERE id=ANY(ids);
   -- Retain operation IDs so an old retry cannot create replacement labels accidentally.
  END IF;
 ELSIF p_action IN ('purchase_edit','purchase_delete') THEN
  SELECT to_jsonb(p) INTO before FROM inventory_purchases p WHERE id=p_id FOR UPDATE;
  IF before IS NULL THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p_action='purchase_delete' THEN
   IF EXISTS(SELECT 1 FROM inventory_units u JOIN inventory_purchase_lines l ON l.id=u.purchase_line_id WHERE l.purchase_id=p_id)
    OR EXISTS(SELECT 1 FROM inventory_purchase_links WHERE purchase_id=p_id)
   THEN RAISE EXCEPTION 'Delete unused labels first. Purchases with linked evidence or received stock must be retained.'; END IF;
   before=before||jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(l)) FROM inventory_purchase_lines l WHERE purchase_id=p_id));
   DELETE FROM inventory_purchase_lines WHERE purchase_id=p_id;
   DELETE FROM inventory_purchases WHERE id=p_id;
  ELSE
   IF length(trim(coalesce(p_data->>'supplier',''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_data->>'reference',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter supplier and reference'; END IF;
   UPDATE inventory_purchases SET supplier=trim(p_data->>'supplier'),reference=trim(p_data->>'reference'),ordered_on=(p_data->>'date')::date WHERE id=p_id;
   FOR line IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'lines','[]')) LOOP
    IF (line->>'quantity')::integer NOT BETWEEN 1 AND 10000 OR (line->>'quantity')::integer < (SELECT count(*) FROM inventory_units WHERE purchase_line_id=(line->>'id')::uuid) THEN RAISE EXCEPTION 'Quantity cannot be below the number of labels already created'; END IF;
    UPDATE inventory_purchase_lines SET quantity=(line->>'quantity')::integer WHERE id=(line->>'id')::uuid AND purchase_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase line not found'; END IF;
   END LOOP;
  END IF;
 ELSIF p_action='basket_delete' THEN
  SELECT to_jsonb(b) INTO before FROM festival_baskets b WHERE id=p_id FOR UPDATE;
  IF before IS NULL THEN RETURN '{"deleted":0}'; END IF;
  DELETE FROM festival_baskets WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
 INSERT INTO admin_record_changes(actor_id,action,target_id,before_data) VALUES(auth.uid(),p_action,p_id,before);
 RETURN jsonb_build_object('saved',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_manage_record(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_record(text,uuid,jsonb) TO authenticated;
COMMIT;
