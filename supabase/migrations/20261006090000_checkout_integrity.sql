-- Deploy before the matching application release. Existing orders remain intact.
ALTER TABLE public.product_images ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK
  (status IN ('pending','processing','shipped','ordered','packaging','out_for_delivery','delivered','cancelled'));

-- Provider references and guest credentials must never be readable through the public API.
CREATE TABLE public.order_checkouts (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  request_key uuid UNIQUE NOT NULL,
  owner_hash text NOT NULL,
  request_hash text NOT NULL,
  provider_kind text CHECK (provider_kind IN ('stripe_checkout','stripe_intent','paypal')),
  provider_id text UNIQUE,
  redirect_url text,
  capture_started boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','paid','released')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_checkouts FROM anon, authenticated;
GRANT ALL ON public.order_checkouts TO service_role;

-- Public callers must use the validated server checkout, never insert arbitrary orders.
REVOKE INSERT ON public.orders FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_checkout_order(
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
    RETURN (SELECT jsonb_build_object('orderId', id, 'orderNumber', o.order_number) FROM public.orders o WHERE id = existing.order_id);
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
  INSERT INTO public.orders (id, order_number, user_id, customer_name, customer_email, customer_phone,
    shipping_address, payment_method, payment_status, status, subtotal, shipping_cost, total, discount, admin_notes)
  VALUES (order_id, order_number, p_user_id, p_order->>'customer_name', lower(p_order->>'customer_email'),
    p_order->>'customer_phone', p_order->'shipping_address', p_order->>'payment_method', 'pending', 'ordered',
    subtotal, shipping, subtotal + shipping, 0, p_order->>'notes');

  INSERT INTO public.order_items (order_id, product_id, variant_id, product_name, variant_info, quantity, unit_price, line_total)
  SELECT order_id, x.product_id, x.variant_id, x.product_name, x.variant_info, x.quantity, x.unit_price, x.line_total
  FROM jsonb_to_recordset(lines) AS x(product_id uuid, variant_id uuid, product_name text, variant_info text, quantity int, unit_price numeric, line_total numeric);

  UPDATE public.products p SET stock_quantity = p.stock_quantity - q.quantity FROM (
    SELECT x.product_id, sum(x.quantity)::int quantity FROM jsonb_to_recordset(lines) AS x(product_id uuid, quantity int) GROUP BY x.product_id
  ) q WHERE p.id = q.product_id AND p.stock_quantity IS NOT NULL;
  UPDATE public.product_variants v SET stock_quantity = v.stock_quantity - x.quantity
    FROM jsonb_to_recordset(lines) AS x(variant_id uuid, quantity int) WHERE v.id = x.variant_id AND v.stock_quantity IS NOT NULL;
  INSERT INTO public.order_checkouts(order_id, request_key, owner_hash, request_hash)
    VALUES (order_id, p_request_key, p_owner_hash, p_request_hash);
  RETURN jsonb_build_object('orderId', order_id, 'orderNumber', order_number);
END; $$;

-- Only call after server verification of the bound provider payment or confirmed expiry.
CREATE OR REPLACE FUNCTION public.settle_checkout_order(p_order_id uuid, p_state text, p_provider_id text DEFAULT NULL, p_provider_kind text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE checkout public.order_checkouts%ROWTYPE;
BEGIN
  IF p_state NOT IN ('paid','released') THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  SELECT * INTO checkout FROM public.order_checkouts WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout not found'; END IF;
  IF checkout.state = p_state THEN RETURN; END IF;
  IF p_state = 'released' AND checkout.provider_kind = 'paypal' AND checkout.capture_started THEN RAISE EXCEPTION 'Payment capture requires reconciliation'; END IF;
  IF p_state = 'released' AND (checkout.provider_id IS DISTINCT FROM p_provider_id OR checkout.provider_kind IS DISTINCT FROM p_provider_kind) THEN RAISE EXCEPTION 'Payment initialization changed. Retry cancellation.'; END IF;
  IF checkout.state <> 'reserved' THEN RAISE EXCEPTION 'Checkout already settled'; END IF;
  PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM public.order_items WHERE order_id = p_order_id) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.product_variants WHERE id IN (SELECT variant_id FROM public.order_items WHERE order_id = p_order_id) ORDER BY id FOR UPDATE;
  IF p_state = 'paid' THEN
    UPDATE public.products p SET sold_count = coalesce(p.sold_count,0) + q.quantity FROM
      (SELECT product_id, sum(quantity)::int quantity FROM public.order_items WHERE order_id = p_order_id GROUP BY product_id) q WHERE p.id = q.product_id;
    UPDATE public.orders SET payment_status = 'paid' WHERE id = p_order_id;
  ELSE
    UPDATE public.products p SET stock_quantity = p.stock_quantity + q.quantity FROM
      (SELECT product_id, sum(quantity)::int quantity FROM public.order_items WHERE order_id = p_order_id GROUP BY product_id) q WHERE p.id = q.product_id AND p.stock_quantity IS NOT NULL;
    UPDATE public.product_variants v SET stock_quantity = v.stock_quantity + q.quantity FROM
      (SELECT variant_id, sum(quantity)::int quantity FROM public.order_items WHERE order_id = p_order_id GROUP BY variant_id) q WHERE v.id = q.variant_id AND v.stock_quantity IS NOT NULL;
    UPDATE public.orders SET status = 'cancelled', payment_status = 'failed' WHERE id = p_order_id;
  END IF;
  UPDATE public.order_checkouts SET state = p_state WHERE order_id = p_order_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_checkout_order(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_checkout_order(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_order(uuid,text,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_checkout_order(uuid,text,text,text) TO service_role;
