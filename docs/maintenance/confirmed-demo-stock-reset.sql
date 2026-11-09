-- One-time cleanup: user confirmed ABC GmbH / ABC-12345 and KPLWB-1..7
-- are demo records on 2026-11-09. Run as database owner in Supabase SQL Editor.
-- Preserves products, variants, customer orders, financial documents and numbering.
-- Creates a private backup first; any failed check rolls back the whole transaction.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.inventory_units, public.inventory_events,
  public.inventory_purchases, public.inventory_purchase_lines,
  public.inventory_purchase_links, public.finance_stock_events,
  public.finance_unit_costs, public.festival_baskets, public.warehouse_operations
  IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE reset_units(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO reset_units VALUES
('557bcd3f-ffba-4697-82e2-c5dfc376c6db'),
('5f2ed983-ae34-4f84-ba36-0c47a34b7be2'),
('9a44cf1a-bdce-491a-9470-1a3ca0795a0b'),
('6c2f3a02-d746-4ec0-aa75-695459922ff3'),
('1e593a2d-137c-4068-8310-3a372f830c1e'),
('8ae624ee-fd64-429a-bd6e-b83556c4560e'),
('a9a7608f-78a2-49f6-8590-4c3ceba22a48');

DO $$ BEGIN
 IF (SELECT count(*) FROM public.inventory_units WHERE id IN (SELECT id FROM reset_units)) <> 7
 THEN RAISE EXCEPTION 'Expected exactly seven confirmed demo units. Stop and inspect.'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_units WHERE id IN (SELECT id FROM reset_units)
   AND (state <> 'expected' OR order_id IS NOT NULL OR purchase_line_id IS NOT NULL))
 THEN RAISE EXCEPTION 'A demo unit has been used or linked since inspection. Cleanup stopped.'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_events WHERE unit_id IN (SELECT id FROM reset_units)
   AND (old_state IS NOT NULL OR new_state <> 'expected' OR order_id IS NOT NULL))
 THEN RAISE EXCEPTION 'Unit has operational history. Cleanup stopped.'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_unit_costs WHERE unit_id IN (SELECT id FROM reset_units))
 OR EXISTS(SELECT 1 FROM public.finance_stock_events WHERE unit_id IN (SELECT id FROM reset_units)
   AND (journal_id IS NOT NULL OR processed_at IS NOT NULL OR delta IS NOT NULL OR old_state IS NOT NULL OR new_state <> 'expected'))
 THEN RAISE EXCEPTION 'Unit has accounting activity. Cleanup stopped.'; END IF;
 IF EXISTS(SELECT 1 FROM public.festival_baskets WHERE units && ARRAY(SELECT id FROM reset_units))
 THEN RAISE EXCEPTION 'Unit is linked to a sale. Cleanup stopped.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_purchases
   WHERE id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e' AND supplier='ABC GmbH' AND reference='ABC-12345')
 THEN RAISE EXCEPTION 'Purchase does not match confirmed demo record.'; END IF;
 IF (SELECT count(*) FROM public.inventory_purchase_lines WHERE purchase_id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e') <> 1
 OR NOT EXISTS(SELECT 1 FROM public.inventory_purchase_lines WHERE id='8f5188aa-b4d6-4a62-9b07-bf0ef8305050'
   AND purchase_id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e' AND quantity=1)
 OR EXISTS(SELECT 1 FROM public.inventory_units WHERE purchase_line_id IN
   (SELECT id FROM public.inventory_purchase_lines WHERE purchase_id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e'))
 OR EXISTS(SELECT 1 FROM public.inventory_purchase_links WHERE purchase_id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e')
 THEN RAISE EXCEPTION 'Purchase has changed or gained links. Cleanup stopped.'; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS maintenance_private;
REVOKE ALL ON SCHEMA maintenance_private FROM PUBLIC, anon, authenticated;
-- Deliberately fails if this backup already exists: do not overwrite a prior reset.
CREATE TABLE maintenance_private.stock_reset_20261109(source text NOT NULL, row_data jsonb NOT NULL);
REVOKE ALL ON maintenance_private.stock_reset_20261109 FROM PUBLIC, anon, authenticated;
INSERT INTO maintenance_private.stock_reset_20261109
 SELECT 'inventory_units',to_jsonb(t) FROM public.inventory_units t WHERE id IN (SELECT id FROM reset_units)
 UNION ALL SELECT 'inventory_events',to_jsonb(t) FROM public.inventory_events t WHERE unit_id IN (SELECT id FROM reset_units)
 UNION ALL SELECT 'finance_stock_events',to_jsonb(t) FROM public.finance_stock_events t WHERE unit_id IN (SELECT id FROM reset_units)
 UNION ALL SELECT 'inventory_purchases',to_jsonb(t) FROM public.inventory_purchases t WHERE id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e'
 UNION ALL SELECT 'inventory_purchase_lines',to_jsonb(t) FROM public.inventory_purchase_lines t WHERE purchase_id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e'
 UNION ALL SELECT 'warehouse_operations',to_jsonb(t) FROM public.warehouse_operations t
   WHERE EXISTS(SELECT 1 FROM reset_units u WHERE t.result::text LIKE '%'||u.id::text||'%');

-- Only unprocessed demo creation events pass the checks above. Restore the guard
-- inside this same locked transaction; it is never disabled for normal app traffic.
ALTER TABLE public.finance_stock_events DISABLE TRIGGER finance_stock_guard;
DELETE FROM public.finance_stock_events WHERE unit_id IN (SELECT id FROM reset_units);
ALTER TABLE public.finance_stock_events ENABLE TRIGGER finance_stock_guard;
DELETE FROM public.inventory_events WHERE unit_id IN (SELECT id FROM reset_units);
DELETE FROM public.inventory_units WHERE id IN (SELECT id FROM reset_units);
DELETE FROM public.inventory_purchase_lines WHERE purchase_id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e';
DELETE FROM public.inventory_purchases WHERE id='3a9d42ef-c4c3-47ee-9aeb-ca561ceac58e';
DELETE FROM public.warehouse_operations WHERE id IN (
 SELECT (row_data->>'id')::uuid FROM maintenance_private.stock_reset_20261109 WHERE source='warehouse_operations'
);
COMMIT;
SELECT source, count(*) AS backed_up_records FROM maintenance_private.stock_reset_20261109 GROUP BY source ORDER BY source;
