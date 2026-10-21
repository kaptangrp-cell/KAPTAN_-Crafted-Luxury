BEGIN;
-- Readable identities are permanent. The global sequence prevents collisions across
-- products with the same initials, sizes, renames, and concurrent label batches.
CREATE SEQUENCE public.inventory_unit_numbers;
ALTER TABLE public.inventory_units ADD COLUMN unit_number text UNIQUE;
CREATE FUNCTION public.inventory_unit_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE initials text; colour text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.unit_number IS NOT NULL AND NEW.unit_number IS DISTINCT FROM OLD.unit_number THEN RAISE EXCEPTION 'Unit number is permanent'; END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.variant_id IS DISTINCT FROM OLD.variant_id THEN RAISE EXCEPTION 'Unit identity is permanent'; END IF;
 END IF;
 IF NEW.unit_number IS NULL THEN
  SELECT string_agg(left(word,1),'') INTO initials FROM products p CROSS JOIN LATERAL regexp_split_to_table(upper(regexp_replace(p.name,'[^[:alnum:] ]','','g')), '\s+') word WHERE p.id=NEW.product_id AND word<>'';
  SELECT left(upper(trim(variant_value)),1) INTO colour FROM product_variants WHERE id=NEW.variant_id;
  NEW.unit_number='K'||left(coalesce(nullif(initials,''),'P'),12)||coalesce(nullif(colour,''),'X')||'-'||nextval('inventory_unit_numbers')::text;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_unit_identity BEFORE INSERT OR UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.inventory_unit_identity();
-- Backfill without manufacturing new stock movement events.
ALTER TABLE public.inventory_units DISABLE TRIGGER inventory_sync;
UPDATE public.inventory_units SET unit_number=NULL;
ALTER TABLE public.inventory_units ENABLE TRIGGER inventory_sync;
ALTER TABLE public.inventory_units ALTER COLUMN unit_number SET NOT NULL;

ALTER TABLE public.inventory_events ADD COLUMN old_location text, ADD COLUMN new_location text;
CREATE OR REPLACE FUNCTION public.inventory_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.state,NEW.order_id,NEW.location) IS NOT DISTINCT FROM (OLD.state,OLD.order_id,OLD.location) THEN RETURN NEW; END IF;
 INSERT INTO inventory_events(unit_id,actor_id,old_state,new_state,order_id,reason,old_location,new_location)
 VALUES(NEW.id,auth.uid(),CASE WHEN TG_OP='UPDATE' THEN OLD.state ELSE NULL END,NEW.state,NEW.order_id,nullif(current_setting('warehouse.reason',true),''),CASE WHEN TG_OP='UPDATE' THEN OLD.location ELSE NULL END,NEW.location);
 UPDATE product_variants SET stock_quantity=(SELECT count(*) FROM inventory_units WHERE variant_id=NEW.variant_id AND state='available') WHERE id=NEW.variant_id;
 UPDATE products SET stock_quantity=(SELECT count(*) FROM inventory_units WHERE product_id=NEW.product_id AND state='available') WHERE id=NEW.product_id;
 RETURN NEW;
END $$;

CREATE TABLE public.inventory_purchases(
 id uuid PRIMARY KEY, supplier text NOT NULL CHECK(length(supplier) BETWEEN 1 AND 200),
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100), ordered_on date NOT NULL,
 document_id uuid NOT NULL REFERENCES public.finance_documents(id),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL, UNIQUE(document_id)
);
CREATE TABLE public.inventory_purchase_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_id uuid NOT NULL REFERENCES public.inventory_purchases(id),
 variant_id uuid NOT NULL REFERENCES public.product_variants(id),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
 UNIQUE(purchase_id,variant_id)
);
ALTER TABLE public.inventory_units ADD COLUMN purchase_line_id uuid REFERENCES public.inventory_purchase_lines(id);
CREATE TABLE public.inventory_purchase_links(
 id uuid PRIMARY KEY, purchase_id uuid NOT NULL REFERENCES public.inventory_purchases(id),
 document_id uuid NOT NULL REFERENCES public.finance_documents(id),kind text NOT NULL CHECK(kind IN ('advance','invoice','payment')),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(purchase_id,document_id,kind)
);
-- Purchasing evidence is preserved separately from accounting recognition.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_purchases','inventory_purchase_lines','inventory_purchase_links'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
CREATE FUNCTION public.operations_purchase(p_id uuid,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.inventory_purchases; line jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,21));
 SELECT * INTO old FROM inventory_purchases WHERE id=p_id;
 IF FOUND THEN IF old.payload<>p_data THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN p_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance_documents WHERE id=(p_data->>'document')::uuid AND state='ready') THEN RAISE EXCEPTION 'Upload the original first'; END IF;
 IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'lines') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select purchase items'; END IF;
 INSERT INTO inventory_purchases VALUES(p_id,trim(p_data->>'supplier'),trim(p_data->>'reference'),(p_data->>'date')::date,(p_data->>'document')::uuid,auth.uid(),now(),p_data);
 FOR line IN SELECT * FROM jsonb_array_elements(p_data->'lines') LOOP
  INSERT INTO inventory_purchase_lines(purchase_id,variant_id,quantity) VALUES(p_id,(line->>'variant')::uuid,(line->>'quantity')::integer);
 END LOOP;
 RETURN p_id;
END $$;
CREATE FUNCTION public.operations_purchase_document(p_id uuid,p_purchase uuid,p_document uuid,p_kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.inventory_purchase_links;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,21));
 SELECT * INTO old FROM inventory_purchase_links WHERE id=p_id;
 IF FOUND THEN IF (old.purchase_id,old.document_id,old.kind) IS DISTINCT FROM (p_purchase,p_document,p_kind) THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN p_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance_documents WHERE id=p_document AND state='ready') THEN RAISE EXCEPTION 'Upload the original first'; END IF;
 INSERT INTO inventory_purchase_links(id,purchase_id,document_id,kind,created_by) VALUES(p_id,p_purchase,p_document,p_kind,auth.uid());
 RETURN p_id;
END $$;
CREATE FUNCTION public.operations_labels(p_operation uuid,p_line uuid,p_quantity integer,p_location text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.inventory_purchase_lines; prior public.warehouse_operations; v_result jsonb; body jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 body=jsonb_build_object('line',p_line,'quantity',p_quantity,'location',p_location);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,7));
 SELECT * INTO prior FROM warehouse_operations WHERE id=p_operation;
 IF FOUND THEN IF prior.actor_id<>auth.uid() OR prior.payload IS DISTINCT FROM body THEN RAISE EXCEPTION 'Operation mismatch'; END IF; RETURN prior.result; END IF;
 SELECT * INTO l FROM inventory_purchase_lines WHERE id=p_line FOR UPDATE;
 IF NOT FOUND OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 200 OR p_location IS NULL OR length(trim(p_location)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid label batch'; END IF;
 IF p_quantity+(SELECT count(*) FROM inventory_units WHERE purchase_line_id=p_line)>l.quantity THEN RAISE EXCEPTION 'Labels exceed ordered quantity'; END IF;
 -- Existing label generator validates active variant and QR activation, and locks stock.
 v_result=warehouse_admin('labels',jsonb_build_object('variantId',l.variant_id,'quantity',p_quantity,'location',trim(p_location)),p_operation);
 UPDATE inventory_units SET purchase_line_id=p_line WHERE batch_id=p_operation;
 SELECT jsonb_agg(x || jsonb_build_object('unit_number',u.unit_number)) INTO v_result FROM jsonb_array_elements(v_result) x JOIN inventory_units u ON u.id=(x->>'id')::uuid;
 UPDATE warehouse_operations SET payload=body,result=v_result WHERE id=p_operation;
 RETURN v_result;
END $$;
CREATE FUNCTION public.operations_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('purchases',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('lines',(
 SELECT jsonb_agg(jsonb_build_object('id',l.id,'variant',v.variant_value,'name',pr.name,'quantity',l.quantity,'labelled',(SELECT count(*) FROM inventory_units WHERE purchase_line_id=l.id),'received',(SELECT count(*) FROM inventory_units u WHERE purchase_line_id=l.id AND EXISTS(SELECT 1 FROM inventory_events e WHERE e.unit_id=u.id AND e.new_state='available')))) FROM inventory_purchase_lines l JOIN product_variants v ON v.id=l.variant_id JOIN products pr ON pr.id=v.product_id WHERE l.purchase_id=p.id), 'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'kind',x.kind)),'[]'::jsonb) FROM inventory_purchase_links x JOIN finance_documents d ON d.id=x.document_id WHERE x.purchase_id=p.id))) FROM (SELECT id,supplier,reference,ordered_on,document_id FROM inventory_purchases ORDER BY created_at DESC LIMIT 100)p),'[]'::jsonb));
END $$;
CREATE FUNCTION public.operations_unit(p_code text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.inventory_units; result jsonb;
BEGIN
 IF NOT (public.is_admin() OR EXISTS(SELECT 1 FROM warehouse_staff WHERE user_id=auth.uid() AND cardinality(permissions)>0)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_code IS NULL OR length(p_code)>100 THEN RAISE EXCEPTION 'Invalid unit code'; END IF;
 SELECT * INTO u FROM inventory_units WHERE unit_number=upper(trim(p_code)) OR 'KPT:UNIT:1:'||id::text=trim(p_code);
 IF NOT FOUND THEN RAISE EXCEPTION 'Unit not found'; END IF;
 SELECT jsonb_build_object('id',u.id,'unit_number',u.unit_number,'name',p.name,'variant',v.variant_value,'state',u.state,'location',u.location,'price',round((p.price+coalesce(v.price_modifier,0))*100)::text,'events',coalesce((SELECT jsonb_agg(jsonb_build_object('at',e.created_at,'from',e.old_state,'to',e.new_state,'actor',coalesce(pr.full_name,'System'),'reason',e.reason,'order',e.order_id,'location',e.new_location) ORDER BY e.id DESC) FROM inventory_events e LEFT JOIN profiles pr ON pr.id=e.actor_id WHERE unit_id=u.id),'[]'::jsonb)) INTO result FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.id=u.product_id AND v.id=u.variant_id;
 IF public.is_admin() THEN
 result=result||jsonb_build_object('purchase',(SELECT jsonb_build_object('reference',p.reference,'supplier',p.supplier,'date',p.ordered_on,'document',p.document_id) FROM inventory_purchase_lines l JOIN inventory_purchases p ON p.id=l.purchase_id WHERE l.id=u.purchase_line_id));
 END IF;
 RETURN result;
END $$;
-- Preserve old QR payloads; enrich existing and reprinted labels with the new ID.
ALTER FUNCTION public.warehouse_dashboard(boolean,text,uuid) RENAME TO warehouse_dashboard_before_unit_numbers;
CREATE FUNCTION public.warehouse_dashboard(p_admin boolean DEFAULT false,p_order text DEFAULT NULL,p_batch uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; labels jsonb;
BEGIN
 r=warehouse_dashboard_before_unit_numbers(p_admin,p_order,p_batch);
 IF r ? 'labels' THEN
 SELECT coalesce(jsonb_agg(x||jsonb_build_object('unit_number',u.unit_number)),'[]'::jsonb) INTO labels FROM jsonb_array_elements(r->'labels') x JOIN inventory_units u ON u.id=(x->>'id')::uuid;
 r=jsonb_set(r,'{labels}',labels);
 END IF;
 RETURN r;
END $$;
ALTER FUNCTION public.warehouse_admin(text,jsonb,uuid) RENAME TO warehouse_admin_before_unit_numbers;
CREATE FUNCTION public.warehouse_admin(p_action text,p_data jsonb,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 r=warehouse_admin_before_unit_numbers(p_action,p_data,p_operation);
 IF p_action='labels' THEN
 SELECT jsonb_agg(x||jsonb_build_object('unit_number',u.unit_number)) INTO r FROM jsonb_array_elements(r) x JOIN inventory_units u ON u.id=(x->>'id')::uuid;
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.warehouse_admin_before_unit_numbers(text,jsonb,uuid),public.warehouse_admin(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_admin(text,jsonb,uuid) TO authenticated;
CREATE FUNCTION public.operations_move(p_operation uuid,p_unit uuid,p_location text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.inventory_units; prior public.warehouse_operations; body jsonb; r jsonb;
BEGIN
 IF NOT public.warehouse_allowed('receive') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_location IS NULL OR length(trim(p_location)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Select a warehouse or shelf'; END IF;
 body=jsonb_build_object('action','move','unit',p_unit,'location',trim(p_location));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,7));
 SELECT * INTO prior FROM warehouse_operations WHERE id=p_operation;
 IF FOUND THEN IF prior.actor_id<>auth.uid() OR prior.payload IS DISTINCT FROM body THEN RAISE EXCEPTION 'Operation mismatch'; END IF; RETURN prior.result; END IF;
 SELECT * INTO u FROM inventory_units WHERE id=p_unit;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unit not found'; END IF;
 PERFORM 1 FROM products WHERE id=u.product_id FOR UPDATE;
 PERFORM 1 FROM product_variants WHERE product_id=u.product_id ORDER BY id FOR UPDATE;
 SELECT * INTO u FROM inventory_units WHERE id=p_unit FOR UPDATE;
 IF u.state NOT IN ('available','quarantine','damaged') THEN RAISE EXCEPTION 'Receive goods before moving; assigned or sold units cannot be moved'; END IF;
 PERFORM set_config('warehouse.reason','Location transfer',true);
 UPDATE inventory_units SET location=trim(p_location),updated_at=now() WHERE id=p_unit;
 r=jsonb_build_object('id',u.id,'location',trim(p_location));
 INSERT INTO warehouse_operations VALUES(p_operation,auth.uid(),body,r,now());
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.operations_move(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operations_move(uuid,uuid,text) TO authenticated;
-- A scan basket is a quotation, not a payment or stock reservation. Completion
-- must be connected to the selected payment / fiscal receipt integration.
CREATE TABLE public.festival_baskets(id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES auth.users(id),event text NOT NULL,units uuid[] NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.festival_baskets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.festival_baskets FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.festival_basket(p_id uuid,p_event text,p_units uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.festival_baskets; result jsonb; sorted uuid[];
BEGIN
 IF NOT public.warehouse_allowed('sell') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_event IS NULL OR length(trim(p_event)) NOT BETWEEN 1 AND 120 OR p_units IS NULL OR cardinality(p_units) NOT BETWEEN 1 AND 100 OR cardinality(p_units)<>(SELECT count(DISTINCT x) FROM unnest(p_units) x) THEN RAISE EXCEPTION 'Invalid basket'; END IF;
 SELECT array_agg(x ORDER BY x) INTO sorted FROM unnest(p_units) x;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,21));
 SELECT * INTO prior FROM festival_baskets WHERE id=p_id;
 IF FOUND THEN IF prior.actor_id<>auth.uid() OR prior.event<>trim(p_event) OR prior.units<>sorted THEN RAISE EXCEPTION 'Retry content differs'; END IF; RETURN prior.snapshot; END IF;
 PERFORM 1 FROM products WHERE id IN (SELECT product_id FROM inventory_units WHERE id=ANY(sorted)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM product_variants WHERE id IN (SELECT variant_id FROM inventory_units WHERE id=ANY(sorted)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM inventory_units WHERE id=ANY(sorted) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM inventory_units WHERE id=ANY(sorted) AND state='available')<>cardinality(sorted) THEN RAISE EXCEPTION 'A scanned unit is no longer available. Check the basket again.'; END IF;
 SELECT jsonb_build_object('id',p_id,'event',trim(p_event),'seller',auth.uid(),'total',sum(round((p.price+coalesce(v.price_modifier,0))*100))::text,'items',jsonb_agg(jsonb_build_object('id',u.id,'unit_number',u.unit_number,'name',p.name,'variant',v.variant_value,'price',round((p.price+coalesce(v.price_modifier,0))*100)::text) ORDER BY u.unit_number)) INTO result FROM inventory_units u JOIN products p ON p.id=u.product_id JOIN product_variants v ON v.id=u.variant_id WHERE u.id=ANY(sorted);
 INSERT INTO festival_baskets VALUES(p_id,auth.uid(),trim(p_event),sorted,result,now());
 RETURN result;
END $$;
CREATE FUNCTION public.festival_baskets_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.warehouse_allowed('sell') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'event',event,'created_at',created_at,'snapshot',snapshot)) FROM (SELECT * FROM festival_baskets WHERE actor_id=auth.uid() ORDER BY created_at DESC LIMIT 20)x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.festival_baskets_list() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.festival_baskets_list() TO authenticated;
REVOKE ALL ON FUNCTION public.festival_basket(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.festival_basket(uuid,text,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.inventory_unit_identity(),public.operations_purchase(uuid,jsonb),public.operations_purchase_document(uuid,uuid,uuid,text),public.operations_labels(uuid,uuid,integer,text),public.operations_list(),public.operations_unit(text),public.warehouse_dashboard_before_unit_numbers(boolean,text,uuid),public.warehouse_dashboard(boolean,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operations_purchase(uuid,jsonb),public.operations_purchase_document(uuid,uuid,uuid,text),public.operations_labels(uuid,uuid,integer,text),public.operations_list(),public.operations_unit(text),public.warehouse_dashboard(boolean,text,uuid) TO authenticated;
REVOKE ALL ON SEQUENCE public.inventory_unit_numbers FROM PUBLIC,anon,authenticated;
COMMIT;
