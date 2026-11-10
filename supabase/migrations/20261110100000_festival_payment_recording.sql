BEGIN;
CREATE TABLE public.festival_sales (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES auth.users(id),
 event text NOT NULL, units uuid[] NOT NULL, payment_method text NOT NULL CHECK(payment_method IN ('cash','card_terminal')),
 payment_reference text NOT NULL, total bigint NOT NULL CHECK(total>=0), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.festival_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.festival_sales FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.festival_complete(p_id uuid,p_event text,p_units uuid[],p_method text,p_reference text,p_total bigint,p_received boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.festival_sales; sorted uuid[]; result jsonb; actual bigint;
BEGIN
 IF NOT public.warehouse_allowed('sell') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_received IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm payment received before completing the sale'; END IF;
 IF p_method IS NULL OR p_method NOT IN ('cash','card_terminal') OR p_event IS NULL OR length(trim(p_event)) NOT BETWEEN 1 AND 120
 OR p_reference IS NULL OR length(trim(p_reference))>120 OR (p_method='card_terminal' AND length(trim(p_reference))=0)
 OR p_units IS NULL OR cardinality(p_units) NOT BETWEEN 1 AND 100 OR cardinality(p_units)<>(SELECT count(DISTINCT x) FROM unnest(p_units) x)
 THEN RAISE EXCEPTION 'Check event, payment method, terminal reference and basket'; END IF;
 SELECT array_agg(x ORDER BY x) INTO sorted FROM unnest(p_units) x;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,22));
 SELECT * INTO prior FROM festival_sales WHERE id=p_id;
 IF FOUND THEN
  IF prior.actor_id<>auth.uid() OR prior.event<>trim(p_event) OR prior.units<>sorted OR prior.payment_method<>p_method OR prior.payment_reference<>trim(p_reference) OR prior.total IS DISTINCT FROM p_total THEN RAISE EXCEPTION 'Retry content differs'; END IF;
  RETURN prior.snapshot;
 END IF;
 PERFORM 1 FROM products WHERE id IN (SELECT product_id FROM inventory_units WHERE id=ANY(sorted)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM product_variants WHERE id IN (SELECT variant_id FROM inventory_units WHERE id=ANY(sorted)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM inventory_units WHERE id=ANY(sorted) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM inventory_units WHERE id=ANY(sorted) AND state='available' AND order_id IS NULL)<>cardinality(sorted) THEN RAISE EXCEPTION 'An item is no longer available. Check the basket before taking payment.'; END IF;
 SELECT sum(round((p.price+coalesce(v.price_modifier,0))*100))::bigint,
 jsonb_build_object('id',p_id,'event',trim(p_event),'seller',auth.uid(),'payment_method',p_method,'payment_reference',trim(p_reference),'total',sum(round((p.price+coalesce(v.price_modifier,0))*100))::text,'created_at',now(),
 'items',jsonb_agg(jsonb_build_object('id',u.id,'unit_number',u.unit_number,'name',p.name,'variant',v.variant_value,'price',round((p.price+coalesce(v.price_modifier,0))*100)::text) ORDER BY u.unit_number))
 INTO actual,result FROM inventory_units u JOIN products p ON p.id=u.product_id JOIN product_variants v ON v.id=u.variant_id WHERE u.id=ANY(sorted);
 IF actual IS NULL OR actual IS DISTINCT FROM p_total THEN RAISE EXCEPTION 'Prices changed. Reload the items and confirm the correct payment amount.'; END IF;
 INSERT INTO festival_sales VALUES(p_id,auth.uid(),trim(p_event),sorted,p_method,trim(p_reference),actual,result,now());
 PERFORM set_config('warehouse.reason','Festival payment recorded: '||p_method||' / '||p_id::text,true);
 UPDATE inventory_units SET state='sold',updated_at=now() WHERE id=ANY(sorted);
 UPDATE products p SET sold_count=coalesce(sold_count,0)+q.n FROM (SELECT product_id,count(*)::int n FROM inventory_units WHERE id=ANY(sorted) GROUP BY product_id) q WHERE p.id=q.product_id;
 RETURN result;
END $$;
CREATE FUNCTION public.festival_sales_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.warehouse_allowed('sell') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN coalesce((SELECT jsonb_agg(snapshot ORDER BY created_at DESC) FROM (SELECT snapshot,created_at FROM festival_sales WHERE actor_id=auth.uid() OR public.is_admin() ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.festival_complete(uuid,text,uuid[],text,text,bigint,boolean),public.festival_sales_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.festival_complete(uuid,text,uuid[],text,text,bigint,boolean),public.festival_sales_list() TO authenticated;
COMMIT;
