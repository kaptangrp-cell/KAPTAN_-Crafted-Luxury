BEGIN;
-- Permanent product prefixes and per-product counters survive deleted batches.
CREATE TABLE public.inventory_barcode_series (
 product_id uuid PRIMARY KEY REFERENCES public.products(id),
 product_code text NOT NULL UNIQUE,
 last_number bigint NOT NULL DEFAULT 0 CHECK(last_number >= 0)
);
ALTER TABLE public.inventory_barcode_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_barcode_series FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.inventory_unit_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pname text; vname text; vtype text; prefix text; colour text; sizecode text; serial bigint; candidate text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.unit_number IS DISTINCT FROM OLD.unit_number THEN RAISE EXCEPTION 'Unit number is permanent'; END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.variant_id IS DISTINCT FROM OLD.variant_id THEN RAISE EXCEPTION 'Unit identity is permanent'; END IF;
  RETURN NEW;
 END IF;
 -- Serialize prefix assignment across products; batch allocation is transactional.
 PERFORM pg_advisory_xact_lock(18112026);
 SELECT name INTO pname FROM products WHERE id=NEW.product_id;
 SELECT lower(variant_value),lower(variant_type) INTO vname,vtype FROM product_variants WHERE id=NEW.variant_id AND product_id=NEW.product_id;
 IF vname IS NULL THEN RAISE EXCEPTION 'Variant does not belong to product'; END IF;
 SELECT product_code INTO prefix FROM inventory_barcode_series WHERE product_id=NEW.product_id;
 IF prefix IS NULL THEN
  prefix=CASE
   WHEN pname ~* 'fire.*bowl|schalen' THEN 'FBL'
   WHEN pname ~* 'ball shape|ball salt|kugel' THEN 'BSL'
   WHEN pname ~* 'cylinder|zylinder' THEN 'CYL'
   WHEN pname ~* 'penny' THEN 'PCL'
   WHEN pname ~* 'cube|würfel' THEN 'CUB'
   WHEN pname ~* 'fire.*bowl|schalen' THEN 'FBL'
   WHEN pname ~* 'camel|kamel' THEN 'CSL'
   WHEN pname ~* 'heart.*star' THEN 'HSC'
   WHEN pname ~* 'heart|herz' THEN 'HCH'
   WHEN pname ~* 'star.*candle|stern' THEN 'SCH'
   WHEN pname ~* 'belt|gürtel' THEN 'CLB'
   WHEN pname ~* 'laptop' THEN 'LLB'
   ELSE NULL END;
  IF prefix IS NULL THEN
   SELECT left(string_agg(left(w,1),''),8) INTO prefix FROM regexp_split_to_table(upper(regexp_replace(pname,'[^a-zA-Z0-9 ]','','g')), '\s+') w WHERE w<>'';
   prefix=coalesce(nullif(prefix,''),'PRD');
  END IF;
  candidate=prefix;
  IF EXISTS(SELECT 1 FROM inventory_barcode_series WHERE product_code=candidate) THEN
   candidate=prefix||upper(left(replace(NEW.product_id::text,'-',''),8));
  END IF;
  INSERT INTO inventory_barcode_series(product_id,product_code) VALUES(NEW.product_id,candidate);
  prefix=candidate;
 END IF;
 colour=CASE
  WHEN vname ~ 'pink|rosa' THEN 'PK' WHEN vname ~ 'black|schwarz' THEN 'BK'
  WHEN vname ~ 'brown|braun' THEN 'BR' WHEN vname ~ 'green|grün' THEN 'GR'
  WHEN vname ~ 'blue|blau' THEN 'BL' WHEN vname ~ 'white|weiß' THEN 'WH'
  WHEN vname ~ 'beige' THEN 'BE' WHEN vname ~ 'red|rot' THEN 'RD'
  WHEN vname ~ 'grey|gray|grau' THEN 'GY'
  ELSE 'NA' END;
 sizecode=CASE WHEN vname LIKE '%/%' THEN trim(split_part(vname,'/',2))
  WHEN vtype IN ('size','größe') THEN vname ELSE 'OS' END;
 sizecode=CASE WHEN sizecode IN ('one size','onesize','einheitsgröße','os','') THEN 'OS'
  WHEN sizecode IN ('small','klein') THEN 'S' WHEN sizecode IN ('medium','mittel') THEN 'M'
  WHEN sizecode IN ('large','groß') THEN 'L' ELSE upper(regexp_replace(sizecode,'[^a-zA-Z0-9]','','g')) END;
 sizecode=coalesce(nullif(left(sizecode,8),''),'OS');
 UPDATE inventory_barcode_series SET last_number=last_number+1 WHERE product_id=NEW.product_id RETURNING last_number INTO serial;
 NEW.unit_number='KP-'||prefix||'-'||colour||'-'||sizecode||'-'||lpad(serial::text,greatest(4,length(serial::text)),'0');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inventory_unit_identity() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.inventory_default_variant(p_product uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM 1 FROM products WHERE id=p_product AND qr_inventory FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Enable tracking for this product first'; END IF;
 IF NOT EXISTS(SELECT 1 FROM product_variants WHERE product_id=p_product) THEN
  INSERT INTO product_variants(product_id,variant_type,variant_value,stock_quantity,is_available,price_modifier)
  VALUES(p_product,'Size','One size',0,true,0);
 END IF;
 RETURN jsonb_build_object('saved',true);
END $$;
REVOKE ALL ON FUNCTION public.inventory_default_variant(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_default_variant(uuid) TO authenticated;
COMMIT;
