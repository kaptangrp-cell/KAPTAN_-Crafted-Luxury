-- OPTIONAL deployment step after the worker passes its production health check.
-- This file is not part of the automatic finance migration bundle.
-- Requires Supabase Cron, pg_net and Vault extensions already enabled.
-- Save INVOICE_WORKER_SECRET in Vault under kaptan_invoice_worker_secret first.
-- Installation is inactive. Explicitly enable only after reviewing queued orders.
BEGIN;
DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL
    OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Enable Supabase Cron, pg_net and Vault before installing the scheduler';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invoice_worker_schedule (
  mode text PRIMARY KEY CHECK (mode IN ('invoices','incoming')),
  enabled boolean NOT NULL DEFAULT false,
  last_dispatch_at timestamptz,
  last_request_id bigint
);
ALTER TABLE public.invoice_worker_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_worker_schedule FROM PUBLIC,anon,authenticated;
INSERT INTO public.invoice_worker_schedule(mode) VALUES ('invoices'),('incoming')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.dispatch_invoice_worker(p_mode text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE cfg public.invoice_worker_schedule; token text; pending boolean; request_id bigint;
BEGIN
  -- Serializes dispatcher calls without holding any customer record locks.
  SELECT * INTO cfg FROM public.invoice_worker_schedule WHERE mode=p_mode FOR UPDATE;
  IF NOT FOUND OR NOT cfg.enabled THEN RETURN NULL; END IF;
  IF cfg.last_dispatch_at > now()-interval '55 seconds' THEN RETURN NULL; END IF;
  IF p_mode='invoices' THEN
    SELECT EXISTS(SELECT 1 FROM public.invoices WHERE state='queued'
      OR (state='processing' AND lease_until<now()))
      OR EXISTS(SELECT 1 FROM public.invoice_delivery WHERE state='pending'
      OR (state='sending' AND lease_until<now())) INTO pending;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.finance_validations WHERE state='queued'
      OR (state='processing' AND lease_until<now())) INTO pending;
  END IF;
  IF NOT pending THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets
    WHERE name='kaptan_invoice_worker_secret';
  IF token IS NULL OR length(token)<32 THEN
    RAISE EXCEPTION 'Invoice worker Vault secret missing or too short';
  END IF;
  SELECT net.http_post(
    url := 'https://www.kaptangrp.com/api/invoice-worker?mode='||p_mode,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) INTO request_id;
  UPDATE public.invoice_worker_schedule SET last_dispatch_at=now(),last_request_id=request_id
    WHERE mode=p_mode;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_invoice_worker(text) FROM PUBLIC,anon,authenticated,service_role;
-- Cron commands contain no credential. The dispatcher also starts disabled.
SELECT cron.schedule('kaptan-invoices','* * * * *',
  $cmd$SELECT public.dispatch_invoice_worker('invoices');$cmd$);
SELECT cron.schedule('kaptan-incoming-validation','* * * * *',
  $cmd$SELECT public.dispatch_invoice_worker('incoming');$cmd$);
COMMIT;

-- Activate after the reviewed production health check:
-- UPDATE public.invoice_worker_schedule SET enabled=true;
-- Pause without deleting queues or evidence:
-- UPDATE public.invoice_worker_schedule SET enabled=false;
-- Inspect the most recent HTTP result (service/database owner only):
-- SELECT s.mode,s.enabled,s.last_dispatch_at,r.status_code,r.timed_out
-- FROM public.invoice_worker_schedule s
-- LEFT JOIN net._http_response r ON r.id=s.last_request_id;
