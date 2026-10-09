-- Apply after 20261006090000_checkout_integrity.sql, before deploying the matching app.
-- Existing payment attempts remain available for reconciliation; no historic data is deleted.
BEGIN;
CREATE TABLE public.checkout_drafts (
  id uuid PRIMARY KEY,
  order_data jsonb NOT NULL,
  item_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.checkout_drafts TO service_role;
ALTER TABLE public.order_checkouts DROP CONSTRAINT IF EXISTS order_checkouts_order_id_fkey;
ALTER TABLE public.order_checkouts ADD COLUMN IF NOT EXISTS draft_version int NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.create_checkout_draft(
  p_request_key uuid, p_owner_hash text, p_request_hash text, p_user_id uuid, p_order jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
  ) q WHERE p.id = q.product_id AND p.stock_quantity IS NOT NULL;
  UPDATE public.product_variants v SET stock_quantity = v.stock_quantity - x.quantity
    FROM jsonb_to_recordset(lines) AS x(variant_id uuid, quantity int) WHERE v.id = x.variant_id AND v.stock_quantity IS NOT NULL;
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
    UPDATE public.products p SET stock_quantity = p.stock_quantity + q.quantity FROM
      (SELECT x.product_id,sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(product_id uuid,quantity int) GROUP BY x.product_id) q WHERE p.id = q.product_id AND p.stock_quantity IS NOT NULL;
    UPDATE public.product_variants v SET stock_quantity = v.stock_quantity + q.quantity FROM
      (SELECT x.variant_id,sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(variant_id uuid,quantity int) GROUP BY x.variant_id) q WHERE v.id = q.variant_id AND v.stock_quantity IS NOT NULL;
    IF draft.id IS NOT NULL THEN
      UPDATE public.checkout_drafts SET order_data = order_data || '{"status":"cancelled","payment_status":"failed"}'::jsonb WHERE id = p_order_id;
    ELSE
      UPDATE public.orders SET status = 'cancelled', payment_status = 'failed' WHERE id = p_order_id;
    END IF;
  END IF;
  UPDATE public.order_checkouts SET state = p_state WHERE order_id = p_order_id;
END; $$;

-- Older app releases must not keep creating unpaid orders during a rolling deployment.
CREATE OR REPLACE FUNCTION public.create_checkout_order(p_request_key uuid,p_owner_hash text,p_request_hash text,p_user_id uuid,p_order jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Checkout has been upgraded. Please reload the store.'; END; $$;
REVOKE ALL ON FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_draft(uuid,text,text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.settle_checkout_order(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_checkout_order(uuid,text,text,text) TO service_role;
COMMIT;
