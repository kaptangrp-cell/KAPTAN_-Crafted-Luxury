-- Apply after payment-first checkout. Does not convert existing inventory automatically.
BEGIN;
ALTER TABLE public.products ADD COLUMN qr_inventory boolean NOT NULL DEFAULT false;
CREATE TABLE public.warehouse_staff (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 permissions text[] NOT NULL DEFAULT '{}',
 CHECK (permissions <@ ARRAY['receive','dispatch','return','inspect','sell']),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inventory_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
 batch_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'expected' CHECK(state IN ('expected','available','reserved','packed','dispatched','sold','quarantine','damaged')),
 location text NOT NULL DEFAULT 'Main',
 order_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_units_stock ON public.inventory_units(product_id,variant_id,state);
CREATE INDEX inventory_units_order ON public.inventory_units(order_id);
CREATE TABLE public.inventory_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
 actor_id uuid,
 old_state text,
 new_state text NOT NULL,
 order_id uuid,
 reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.warehouse_operations (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouse_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_staff,public.inventory_units,public.inventory_events,public.warehouse_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.warehouse_staff,public.inventory_units,public.inventory_events,public.warehouse_operations TO service_role;

CREATE FUNCTION public.warehouse_allowed(action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_admin() OR EXISTS(SELECT 1 FROM warehouse_staff WHERE user_id=auth.uid() AND action=ANY(permissions));
$$;
CREATE FUNCTION public.warehouse_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('admin',public.is_admin(),'permissions',CASE WHEN public.is_admin() THEN ARRAY['receive','dispatch','return','inspect','sell'] ELSE coalesce((SELECT permissions FROM warehouse_staff WHERE user_id=auth.uid()),'{}'::text[]) END);
$$;
-- A profile editor must never allow an employee/customer to promote themselves.
CREATE FUNCTION public.warehouse_protect_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND
 ((TG_OP='INSERT' AND NEW.role <> 'customer') OR (TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER warehouse_protect_role BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.warehouse_protect_role();

CREATE FUNCTION public.inventory_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO inventory_events(unit_id,actor_id,old_state,new_state,order_id,reason)
 VALUES(NEW.id,auth.uid(),CASE WHEN TG_OP='UPDATE' THEN OLD.state ELSE NULL END,NEW.state,NEW.order_id,nullif(current_setting('warehouse.reason',true),''));
 UPDATE product_variants SET stock_quantity=(SELECT count(*) FROM inventory_units WHERE variant_id=NEW.variant_id AND state='available') WHERE id=NEW.variant_id;
 UPDATE products SET stock_quantity=(SELECT count(*) FROM inventory_units WHERE product_id=NEW.product_id AND state='available') WHERE id=NEW.product_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER inventory_sync AFTER INSERT OR UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.inventory_sync();
CREATE FUNCTION public.inventory_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE managed boolean;
BEGIN
 IF TG_TABLE_NAME='products' THEN
  IF TG_OP='UPDATE' AND OLD.qr_inventory AND NOT NEW.qr_inventory THEN RAISE EXCEPTION 'QR inventory cannot be disabled'; END IF;
  IF NEW.qr_inventory AND NEW.stock_quantity IS DISTINCT FROM (SELECT count(*)::int FROM inventory_units WHERE product_id=NEW.id AND state='available') THEN RAISE EXCEPTION 'QR stock changes require a scan'; END IF;
 ELSE
  SELECT qr_inventory INTO managed FROM products WHERE id=coalesce(NEW.product_id,OLD.product_id);
  IF managed THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive QR variants instead of deleting them'; END IF;
   IF TG_OP='UPDATE' AND (NEW.product_id<>OLD.product_id OR NEW.variant_type<>OLD.variant_type OR NEW.variant_value<>OLD.variant_value) THEN RAISE EXCEPTION 'QR variant identity cannot be changed'; END IF;
   IF NEW.stock_quantity IS DISTINCT FROM (SELECT count(*)::int FROM inventory_units WHERE variant_id=NEW.id AND state='available') THEN RAISE EXCEPTION 'QR stock changes require a scan'; END IF;
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER inventory_product_guard BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.inventory_guard();
CREATE TRIGGER inventory_variant_guard BEFORE INSERT OR UPDATE OR DELETE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.inventory_guard();

CREATE FUNCTION public.warehouse_admin(p_action text,p_data jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; prior warehouse_operations%ROWTYPE; pid uuid; vid uuid; n int; batch uuid; target uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,7));
 SELECT * INTO prior FROM warehouse_operations WHERE id=p_operation;
 IF FOUND THEN
  IF prior.actor_id<>auth.uid() OR prior.payload<>jsonb_build_object('action',p_action,'data',p_data) THEN RAISE EXCEPTION 'Operation mismatch'; END IF;
  RETURN prior.result;
 END IF;
 IF p_action='staff' THEN
  SELECT id INTO target FROM auth.users WHERE lower(email)=lower(trim(p_data->>'email')) AND email_confirmed_at IS NOT NULL;
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=target) THEN RAISE EXCEPTION 'Registered, verified account not found'; END IF;
  INSERT INTO warehouse_staff(user_id,permissions) VALUES(target,ARRAY(SELECT jsonb_array_elements_text(p_data->'permissions')))
  ON CONFLICT(user_id) DO UPDATE SET permissions=excluded.permissions,updated_at=now();
  result=jsonb_build_object('saved',true);
 ELSIF p_action='enable' THEN
  pid=(p_data->>'productId')::uuid;
  PERFORM 1 FROM products WHERE id=pid AND NOT qr_inventory FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product missing or already QR managed'; END IF;
  PERFORM 1 FROM product_variants WHERE product_id=pid ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=pid AND o.status NOT IN ('delivered','cancelled')) OR
   EXISTS(SELECT 1 FROM checkout_drafts d JOIN order_checkouts c ON c.order_id=d.id CROSS JOIN LATERAL jsonb_array_elements(d.item_data) i WHERE c.state='reserved' AND (i->>'product_id')::uuid=pid) THEN RAISE EXCEPTION 'Finish or reconcile existing orders and payment holds before QR activation'; END IF;
  IF EXISTS(SELECT 1 FROM product_variants WHERE product_id=pid GROUP BY lower(trim(variant_type)),lower(trim(variant_value)) HAVING count(*)>1) THEN RAISE EXCEPTION 'Resolve duplicate variants first'; END IF;
  IF EXISTS(SELECT 1 FROM product_variants WHERE product_id=pid AND lower(variant_type) IN ('color','colour','farbe')) AND EXISTS(SELECT 1 FROM product_variants WHERE product_id=pid AND lower(variant_type) IN ('size','größe')) THEN RAISE EXCEPTION 'Create combined colour / size variants before QR activation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM product_variants WHERE product_id=pid) THEN
   INSERT INTO product_variants(product_id,variant_type,variant_value,stock_quantity,is_available,price_modifier) VALUES(pid,'Size','One size',0,true,0);
  END IF;
  result=jsonb_build_object('enabled',true,'previous_stock',(SELECT stock_quantity FROM products WHERE id=pid),'previous_variants',(SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock_quantity)) FROM product_variants WHERE product_id=pid));
  UPDATE product_variants SET stock_quantity=0 WHERE product_id=pid;
  UPDATE products SET stock_quantity=0,qr_inventory=true WHERE id=pid;
 ELSIF p_action='labels' THEN
  vid=(p_data->>'variantId')::uuid; n=(p_data->>'quantity')::int; batch=p_operation;
  IF n NOT BETWEEN 1 AND 200 OR length(coalesce(p_data->>'location','')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Choose 1–200 labels and a location'; END IF;
  SELECT product_id INTO pid FROM product_variants WHERE id=vid;
  PERFORM 1 FROM products WHERE id=pid AND qr_inventory FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enable QR inventory first'; END IF;
  PERFORM 1 FROM product_variants WHERE id=vid AND is_available IS DISTINCT FROM false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Variant unavailable'; END IF;
  INSERT INTO inventory_units(product_id,variant_id,batch_id,location) SELECT pid,vid,batch,p_data->>'location' FROM generate_series(1,n);
  SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',p.name,'variant',v.variant_value,'sku','KPT-'||upper(replace(v.id::text,'-','')),'location',u.location)) INTO result FROM inventory_units u JOIN products p ON p.id=u.product_id JOIN product_variants v ON v.id=u.variant_id WHERE u.batch_id=batch;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
 INSERT INTO warehouse_operations(id,actor_id,payload,result) VALUES(p_operation,auth.uid(),jsonb_build_object('action',p_action,'data',p_data),result);
 RETURN result;
END; $$;

CREATE FUNCTION public.warehouse_scan(p_unit uuid,p_action text,p_order text,p_reason text,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u inventory_units%ROWTYPE; prior warehouse_operations%ROWTYPE; payload jsonb; result jsonb; oid uuid; substitute uuid; permission text;
BEGIN
 permission=CASE WHEN p_action IN ('pack','dispatch') THEN 'dispatch' WHEN p_action IN ('pass','reject','unpack') THEN 'inspect' ELSE p_action END;
 IF NOT warehouse_allowed(permission) THEN RAISE EXCEPTION 'Forbidden: scanning permission required'; END IF;
 payload=jsonb_build_object('unit',p_unit,'action',p_action,'order',p_order,'reason',p_reason);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,7));
 SELECT * INTO prior FROM warehouse_operations WHERE id=p_operation;
 IF FOUND THEN
  IF prior.actor_id<>auth.uid() OR prior.payload<>payload THEN RAISE EXCEPTION 'Operation mismatch'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO u FROM inventory_units WHERE id=p_unit;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown QR code'; END IF;
 -- Same product/variant lock order as checkout. Unit assignment is read again under lock.
 PERFORM 1 FROM products WHERE id=u.product_id FOR UPDATE;
 PERFORM 1 FROM product_variants WHERE product_id=u.product_id ORDER BY id FOR UPDATE;
 SELECT * INTO u FROM inventory_units WHERE id=p_unit FOR UPDATE;
 PERFORM set_config('warehouse.reason',left(coalesce(p_reason,''),300),true);
 IF p_action IN ('pack','dispatch') THEN
  SELECT id INTO oid FROM orders WHERE (id::text=p_order OR order_number=p_order) AND payment_status='paid' AND status NOT IN ('cancelled','delivered') FOR UPDATE;
  IF oid IS NULL THEN RAISE EXCEPTION 'Select a paid, active order'; END IF;
 END IF;
 IF p_action='receive' AND u.state='expected' THEN
  UPDATE inventory_units SET state='available',updated_at=now() WHERE id=u.id;
 ELSIF p_action='pack' THEN
  IF u.state='reserved' AND u.order_id=oid THEN
   UPDATE inventory_units SET state='packed',updated_at=now() WHERE id=u.id;
  ELSIF u.state='available' THEN
   SELECT id INTO substitute FROM inventory_units WHERE variant_id=u.variant_id AND order_id=oid AND state='reserved' ORDER BY id LIMIT 1 FOR UPDATE;
   IF substitute IS NULL THEN RAISE EXCEPTION 'Wrong variant or order quantity already packed'; END IF;
   UPDATE inventory_units SET state='available',order_id=NULL,updated_at=now() WHERE id=substitute;
   UPDATE inventory_units SET state='packed',order_id=oid,updated_at=now() WHERE id=u.id;
  ELSE RAISE EXCEPTION 'Unit is not available for this order'; END IF;
 ELSIF p_action='dispatch' AND u.state='packed' AND u.order_id=oid THEN
  UPDATE inventory_units SET state='dispatched',updated_at=now() WHERE id=u.id;
 ELSIF p_action='return' AND u.state IN ('dispatched','sold') THEN
  UPDATE inventory_units SET state='quarantine',updated_at=now() WHERE id=u.id;
 ELSIF p_action='unpack' AND u.state IN ('reserved','packed') AND EXISTS(SELECT 1 FROM orders WHERE id=u.order_id AND status='cancelled') THEN
  UPDATE inventory_units SET state='quarantine',updated_at=now() WHERE id=u.id;
 ELSIF p_action='pass' AND u.state='quarantine' THEN
  UPDATE inventory_units SET state='available',order_id=NULL,updated_at=now() WHERE id=u.id;
 ELSIF p_action='reject' AND u.state IN ('quarantine','available','expected') AND length(trim(coalesce(p_reason,'')))>0 THEN
  UPDATE inventory_units SET state='damaged',updated_at=now() WHERE id=u.id;
 ELSIF p_action='sell' AND u.state='available' AND length(trim(coalesce(p_reason,'')))>0 THEN
  UPDATE inventory_units SET state='sold',updated_at=now() WHERE id=u.id;
 ELSE RAISE EXCEPTION 'Invalid scan for current status: %. Already processed or wrong action.',u.state; END IF;
 IF oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=oid AND NOT p.qr_inventory) THEN
  IF p_action='pack' AND NOT EXISTS(SELECT 1 FROM inventory_units WHERE order_id=oid AND state='reserved') THEN
   UPDATE orders SET status='packaging' WHERE id=oid;
  ELSIF p_action='dispatch' AND NOT EXISTS(SELECT 1 FROM inventory_units WHERE order_id=oid AND state IN ('reserved','packed')) THEN
   UPDATE orders SET status='out_for_delivery' WHERE id=oid;
  END IF;
 END IF;
 SELECT jsonb_build_object('id',x.id,'state',x.state,'name',p.name,'variant',v.variant_value,'location',x.location) INTO result FROM inventory_units x JOIN products p ON p.id=x.product_id JOIN product_variants v ON v.id=x.variant_id WHERE x.id=u.id;
 INSERT INTO warehouse_operations VALUES(p_operation,auth.uid(),payload,result,now());
 RETURN result;
END; $$;

CREATE FUNCTION public.warehouse_dashboard(p_admin boolean DEFAULT false,p_order text DEFAULT NULL,p_batch uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT (is_admin() OR EXISTS(SELECT 1 FROM warehouse_staff WHERE user_id=auth.uid() AND cardinality(permissions)>0)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 result=warehouse_access() || jsonb_build_object('counts',coalesce((SELECT jsonb_object_agg(state,n) FROM (SELECT state,count(*)::int n FROM inventory_units GROUP BY state) counts),'{}'::jsonb));
 IF p_admin THEN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  result=result || jsonb_build_object(
   'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.user_id,'name',p.full_name,'email',a.email,'permissions',s.permissions)) FROM warehouse_staff s JOIN profiles p ON p.id=s.user_id JOIN auth.users a ON a.id=s.user_id),'[]'::jsonb),
   'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'managed',p.qr_inventory,'stock',p.stock_quantity,'variants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.variant_value,'stock',v.stock_quantity)) FROM product_variants v WHERE v.product_id=p.id),'[]'::jsonb))) FROM products p),'[]'::jsonb),
   'batches',coalesce((SELECT jsonb_agg(b) FROM (SELECT batch_id,min(created_at) created_at,count(*) quantity FROM inventory_units GROUP BY batch_id ORDER BY min(created_at) DESC LIMIT 50) b),'[]'::jsonb),
   'events',coalesce((SELECT jsonb_agg(e) FROM (SELECT * FROM inventory_events ORDER BY id DESC LIMIT 100) e),'[]'::jsonb));
  IF p_batch IS NOT NULL THEN
   result=result || jsonb_build_object('labels',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',p.name,'variant',v.variant_value,'sku','KPT-'||upper(replace(v.id::text,'-','')),'location',u.location)) FROM inventory_units u JOIN products p ON p.id=u.product_id JOIN product_variants v ON v.id=u.variant_id WHERE u.batch_id=p_batch),'[]'::jsonb));
  END IF;
 END IF;
 IF p_order IS NOT NULL THEN
  IF NOT warehouse_allowed('dispatch') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  result=result || jsonb_build_object('order', (SELECT jsonb_build_object('number',o.order_number,'status',o.status,'units',coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.name,'variant',v.variant_value,'state',u.state,'location',u.location)) FROM inventory_units u JOIN products p ON p.id=u.product_id JOIN product_variants v ON v.id=u.variant_id WHERE u.order_id=o.id),'[]'::jsonb)) FROM orders o WHERE (o.id::text=p_order OR o.order_number=p_order) AND o.payment_status='paid'));
 END IF;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.create_checkout_draft(
  p_request_key uuid, p_owner_hash text, p_request_hash text, p_user_id uuid, p_order jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
<<create_checkout_draft>>
DECLARE
  selected_units uuid[];
  existing public.order_checkouts%ROWTYPE;
  product public.products%ROWTYPE;
  variant public.product_variants%ROWTYPE;
  line record;
  order_id uuid := gen_random_uuid();
  order_number text := 'KPT-' || upper(replace(order_id::text, '-', ''));
  subtotal numeric(10,2) := 0;
  shipping numeric(10,2);
  unit_price numeric(10,2);
  lines jsonb := '[]'::jsonb;
BEGIN
  -- Serializes retries before creating anything; the unique key also guards collisions.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  SELECT * INTO existing FROM public.order_checkouts WHERE request_key = p_request_key;
  IF FOUND THEN
    IF existing.owner_hash <> p_owner_hash OR existing.request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'Checkout request does not match';
    END IF;
    IF existing.state = 'released' THEN RAISE EXCEPTION 'Checkout expired. Start a new checkout.'; END IF;
    RETURN jsonb_build_object('orderId', existing.order_id, 'orderNumber', coalesce((SELECT order_data->>'order_number' FROM public.checkout_drafts WHERE id = existing.order_id), (SELECT o.order_number FROM public.orders o WHERE id = existing.order_id)));
  END IF;
  IF jsonb_array_length(p_order->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid cart'; END IF;
  IF p_order->>'payment_method' NOT IN ('card','paypal') THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_hash, 1));
  IF (SELECT count(*) FROM public.order_checkouts WHERE owner_hash = p_owner_hash AND state = 'reserved') >= 5 THEN RAISE EXCEPTION 'Too many pending checkouts. Complete or cancel an earlier checkout.'; END IF;

  -- Always lock products in the same order, then variants. Concurrent carts cannot oversell.
  PERFORM 1 FROM public.products WHERE id IN
    (SELECT (i->>'productId')::uuid FROM jsonb_array_elements(p_order->'items') i) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.product_variants WHERE product_id IN
    (SELECT (i->>'productId')::uuid FROM jsonb_array_elements(p_order->'items') i) ORDER BY id FOR UPDATE;

  FOR line IN
    SELECT (i->>'productId')::uuid AS product_id, sum((i->>'quantity')::int) AS quantity
    FROM jsonb_array_elements(p_order->'items') i GROUP BY 1 ORDER BY 1
  LOOP
    SELECT * INTO product FROM public.products WHERE id = line.product_id;
    IF NOT FOUND OR product.is_available IS FALSE THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    IF line.quantity NOT BETWEEN 1 AND 50 OR (product.stock_quantity IS NOT NULL AND product.stock_quantity < line.quantity) THEN
      RAISE EXCEPTION 'Insufficient stock for %', product.name;
    END IF;
  END LOOP;

  FOR line IN
    SELECT (i->>'productId')::uuid AS product_id, (i->>'variantId')::uuid AS variant_id,
      sum((i->>'quantity')::int)::int AS quantity
    FROM jsonb_array_elements(p_order->'items') i GROUP BY 1,2 ORDER BY 1,2
  LOOP
    SELECT * INTO product FROM public.products WHERE id = line.product_id;
    variant := NULL;
    IF line.variant_id IS NOT NULL THEN
      SELECT * INTO variant FROM public.product_variants WHERE id = line.variant_id AND product_id = product.id;
      IF NOT FOUND OR variant.is_available IS FALSE THEN RAISE EXCEPTION 'Invalid or unavailable variant'; END IF;
      IF variant.stock_quantity IS NOT NULL AND variant.stock_quantity < line.quantity THEN RAISE EXCEPTION 'Variant out of stock'; END IF;
    ELSIF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = product.id) THEN
      RAISE EXCEPTION 'Choose a product option';
    END IF;
    unit_price := product.price + coalesce(variant.price_modifier, 0);
    IF unit_price < 0 THEN RAISE EXCEPTION 'Invalid product price'; END IF;
    subtotal := subtotal + unit_price * line.quantity;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'product_id', product.id, 'variant_id', variant.id, 'product_name', product.name,
      'variant_info', CASE WHEN variant.id IS NULL THEN NULL ELSE variant.variant_type || ': ' || variant.variant_value END,
      'quantity', line.quantity, 'unit_price', unit_price, 'line_total', unit_price * line.quantity));
  END LOOP;

  shipping := CASE WHEN subtotal > 50 THEN 0 ELSE 5.99 END;
  IF round((p_order->>'expectedTotal')::numeric, 2) IS DISTINCT FROM subtotal + shipping THEN RAISE EXCEPTION 'Prices changed. Remove the affected items and add them again before paying.'; END IF;
  -- Private payment attempt only. No order exists until verified settlement.
  INSERT INTO public.checkout_drafts(id, order_data, item_data)
  VALUES (order_id, jsonb_build_object(
    'id', order_id, 'order_number', order_number, 'user_id', p_user_id,
    'customer_name', p_order->>'customer_name', 'customer_email', lower(p_order->>'customer_email'),
    'customer_phone', p_order->>'customer_phone', 'shipping_address', p_order->'shipping_address',
    'payment_method', p_order->>'payment_method', 'payment_status', 'pending', 'status', 'pending',
    'subtotal', subtotal, 'shipping_cost', shipping, 'total', subtotal + shipping,
    'discount', 0, 'admin_notes', p_order->>'notes', 'created_at', now(), 'updated_at', now()
  ), lines);

  UPDATE public.products p SET stock_quantity = p.stock_quantity - q.quantity FROM (
    SELECT x.product_id, sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(product_id uuid, quantity int) GROUP BY x.product_id
  ) q WHERE p.id = q.product_id AND p.stock_quantity IS NOT NULL AND NOT p.qr_inventory;
  UPDATE public.product_variants v SET stock_quantity = v.stock_quantity - x.quantity
    FROM jsonb_to_recordset(lines) AS x(variant_id uuid, quantity int) WHERE v.id = x.variant_id AND v.stock_quantity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM products p WHERE p.id=v.product_id AND p.qr_inventory);
  FOR line IN SELECT x.* FROM jsonb_to_recordset(lines) AS x(product_id uuid,variant_id uuid,quantity int) JOIN products p ON p.id=x.product_id WHERE p.qr_inventory LOOP
    SELECT array_agg(id) INTO selected_units FROM (SELECT id FROM inventory_units WHERE variant_id=line.variant_id AND state='available' ORDER BY created_at,id LIMIT line.quantity FOR UPDATE) units;
    IF coalesce(cardinality(selected_units),0)<>line.quantity THEN RAISE EXCEPTION 'Insufficient QR stock'; END IF;
    UPDATE inventory_units SET state='reserved',order_id=create_checkout_draft.order_id,updated_at=now() WHERE id=ANY(selected_units);
  END LOOP;
  INSERT INTO public.order_checkouts(order_id, request_key, owner_hash, request_hash, draft_version)
    VALUES (order_id, p_request_key, p_owner_hash, p_request_hash, 2);
  RETURN jsonb_build_object('orderId', order_id, 'orderNumber', order_number);
END; $$;


CREATE OR REPLACE FUNCTION public.settle_checkout_order(p_order_id uuid, p_state text, p_provider_id text DEFAULT NULL, p_provider_kind text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  checkout public.order_checkouts%ROWTYPE;
  draft public.checkout_drafts%ROWTYPE;
  lines jsonb;
BEGIN
  IF p_state NOT IN ('paid','released') THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  SELECT * INTO checkout FROM public.order_checkouts WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout not found'; END IF;
  IF checkout.state = p_state THEN RETURN; END IF;
  IF p_state = 'released' AND checkout.provider_kind = 'paypal' AND checkout.capture_started THEN RAISE EXCEPTION 'Payment capture requires reconciliation'; END IF;
  IF p_state = 'released' AND (checkout.provider_id IS DISTINCT FROM p_provider_id OR checkout.provider_kind IS DISTINCT FROM p_provider_kind) THEN RAISE EXCEPTION 'Payment initialization changed. Retry cancellation.'; END IF;
  IF checkout.state <> 'reserved' THEN RAISE EXCEPTION 'Checkout already settled'; END IF;

  SELECT * INTO draft FROM public.checkout_drafts WHERE id = p_order_id;
  IF checkout.draft_version = 2 AND NOT FOUND THEN RAISE EXCEPTION 'Checkout draft missing'; END IF;
  IF draft.id IS NOT NULL THEN
    lines := draft.item_data;
    IF p_state = 'paid' AND (checkout.provider_id IS NULL OR checkout.provider_kind IS NULL) THEN
      RAISE EXCEPTION 'Payment provider is not bound';
    END IF;
  ELSE
    -- Preserve settlement of attempts created before this migration.
    SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) INTO lines FROM public.order_items i WHERE order_id = p_order_id;
  END IF;
  PERFORM 1 FROM public.products WHERE id IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(lines) x) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.product_variants WHERE id IN (SELECT (x->>'variant_id')::uuid FROM jsonb_array_elements(lines) x) ORDER BY id FOR UPDATE;

  IF p_state = 'paid' THEN
    IF draft.id IS NOT NULL THEN
      -- Atomic promotion: order and items appear together, exactly once, already paid.
      INSERT INTO public.orders SELECT (jsonb_populate_record(NULL::public.orders,
        draft.order_data || jsonb_build_object('payment_status','paid','status','ordered','created_at',now(),'updated_at',now()))).*;
      INSERT INTO public.order_items(order_id,product_id,variant_id,product_name,variant_info,quantity,unit_price,line_total)
      SELECT p_order_id,x.product_id,x.variant_id,x.product_name,x.variant_info,x.quantity,x.unit_price,x.line_total
      FROM jsonb_to_recordset(lines) AS x(product_id uuid,variant_id uuid,product_name text,variant_info text,quantity int,unit_price numeric,line_total numeric);
    ELSE
      UPDATE public.orders SET payment_status = 'paid' WHERE id = p_order_id;
    END IF;
    UPDATE public.products p SET sold_count = coalesce(p.sold_count,0) + q.quantity FROM
      (SELECT x.product_id,sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(product_id uuid,quantity int) GROUP BY x.product_id) q WHERE p.id = q.product_id;
  ELSE
    UPDATE inventory_units SET state='available',order_id=NULL,updated_at=now() WHERE order_id=p_order_id AND state='reserved';
    UPDATE public.products p SET stock_quantity = p.stock_quantity + q.quantity FROM
      (SELECT x.product_id,sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(product_id uuid,quantity int) GROUP BY x.product_id) q WHERE p.id = q.product_id AND p.stock_quantity IS NOT NULL AND NOT p.qr_inventory;
    UPDATE public.product_variants v SET stock_quantity = v.stock_quantity + q.quantity FROM
      (SELECT x.variant_id,sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(variant_id uuid,quantity int) GROUP BY x.variant_id) q WHERE v.id = q.variant_id AND v.stock_quantity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM products p WHERE p.id=v.product_id AND p.qr_inventory);
    IF draft.id IS NOT NULL THEN
      UPDATE public.checkout_drafts SET order_data = order_data || '{"status":"cancelled","payment_status":"failed"}'::jsonb WHERE id = p_order_id;
    ELSE
      UPDATE public.orders SET status = 'cancelled', payment_status = 'failed' WHERE id = p_order_id;
    END IF;
  END IF;
  UPDATE public.order_checkouts SET state = p_state WHERE order_id = p_order_id;
END; $$;


-- QR orders cannot bypass warehouse scans through the legacy order editor.
CREATE FUNCTION public.inventory_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('out_for_delivery','delivered') AND EXISTS(
  SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=NEW.id AND p.qr_inventory
  AND i.quantity > (SELECT count(DISTINCT e.unit_id) FROM inventory_events e JOIN inventory_units u ON u.id=e.unit_id WHERE e.order_id=NEW.id AND e.new_state='dispatched' AND u.variant_id=i.variant_id)
 ) THEN RAISE EXCEPTION 'Scan every QR unit at dispatch before updating delivery status'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER inventory_order_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.inventory_order_guard();
REVOKE ALL ON FUNCTION public.inventory_order_guard() FROM PUBLIC,anon,authenticated;

-- Explicit RPC allowlist. Internal trigger/helper functions are not callable by clients.
REVOKE ALL ON FUNCTION public.warehouse_allowed(text),public.warehouse_access(),public.warehouse_admin(text,jsonb,uuid),public.warehouse_scan(uuid,text,text,text,uuid),public.warehouse_dashboard(boolean,text,uuid),public.inventory_sync(),public.inventory_guard(),public.warehouse_protect_role() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_access(),public.warehouse_admin(text,jsonb,uuid),public.warehouse_scan(uuid,text,text,text,uuid),public.warehouse_dashboard(boolean,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb),public.settle_checkout_order(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb),public.settle_checkout_order(uuid,text,text,text) TO service_role;
-- Only existing public stock projections are broadcast; warehouse records remain private.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='products') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.products; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='product_variants') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variants; END IF;
 END IF;
END; $$;
COMMIT;
