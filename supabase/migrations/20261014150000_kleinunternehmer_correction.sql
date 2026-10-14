-- Correction of the merchant declaration: §19 Kleinunternehmer, not regular VAT.
-- Apply AFTER 20261014140000_invoice_archive.sql. Existing order snapshots stay intact.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_checkout_draft_before_billing(
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
    unit_price := round((product.price + coalesce(variant.price_modifier, 0)), 2);
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
    'tax_data', jsonb_build_object('version',1,'mode','kleinunternehmer','rate',0,'exemption_reason','Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG.','currency','EUR','prices','gross','net',round((SELECT sum(round((x->>'line_total')::numeric,2)) FROM jsonb_array_elements(lines) x) + round(shipping,2),2)),
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
REVOKE ALL ON FUNCTION public.create_checkout_draft_before_billing(uuid,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
