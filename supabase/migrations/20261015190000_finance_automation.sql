BEGIN;
CREATE TABLE public.finance_automation(id boolean PRIMARY KEY DEFAULT true CHECK(id),sales boolean NOT NULL DEFAULT false,stock boolean NOT NULL DEFAULT false,authorized_by uuid REFERENCES auth.users(id),enabled_from timestamptz NOT NULL DEFAULT now());
INSERT INTO public.finance_automation(id) VALUES(true);
ALTER TABLE public.finance_automation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_automation FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.finance_automation_settings(p_sales boolean DEFAULT NULL,p_stock boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_sales IS NOT NULL OR p_stock IS NOT NULL THEN
 IF public.finance_role() IS DISTINCT FROM 'owner' OR p_sales IS NULL OR p_stock IS NULL THEN RAISE EXCEPTION 'Owner must confirm both automation settings'; END IF;
 UPDATE public.finance_automation SET sales=p_sales,stock=p_stock,authorized_by=auth.uid(),enabled_from=now() WHERE id;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(auth.uid(),'automation_policy','future_events',jsonb_build_object('sales',p_sales,'stock',p_stock));
 END IF;
 RETURN (SELECT to_jsonb(a) FROM public.finance_automation a WHERE id);
END $$;
CREATE FUNCTION public.finance_auto_run() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.finance_automation;old_sub text:=current_setting('request.jwt.claim.sub',true);initiator uuid:=auth.uid();failure text;result jsonb;
BEGIN
 SELECT * INTO cfg FROM public.finance_automation WHERE id;
 IF cfg.authorized_by IS NULL OR NEW.created_at<cfg.enabled_from OR (TG_TABLE_NAME='finance_sales_events' AND NOT cfg.sales) OR (TG_TABLE_NAME='finance_stock_events' AND NOT cfg.stock) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=cfg.authorized_by AND role='admin') THEN RETURN NULL; END IF;
 -- Execute only the policy-approved handlers as the approving owner, then restore the caller identity.
 -- No caller-supplied actor is accepted; authorization is stored by the owner-only settings RPC.
 BEGIN
 PERFORM set_config('request.jwt.claim.sub',cfg.authorized_by::text,true);
 IF TG_TABLE_NAME='finance_sales_events' THEN result=public.finance_sales_complete(NEW.id); ELSE result=public.finance_stock_process(NEW.id); END IF;
 failure=result->>'error';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 IF failure IS NOT NULL THEN
 IF TG_TABLE_NAME='finance_sales_events' THEN UPDATE public.finance_sales_events SET last_error=left(failure,500) WHERE id=NEW.id AND journal_id IS NULL;
 ELSE UPDATE public.finance_stock_events SET last_error=left(failure,500) WHERE id=NEW.id AND processed_at IS NULL; END IF;
 END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES(cfg.authorized_by,'automatic_finance_event',NEW.id::text,jsonb_build_object('source',TG_TABLE_NAME,'initiator',initiator::text,'error',left(failure,500)));
 RETURN NULL;
END $$;
CREATE TRIGGER finance_auto_sales AFTER INSERT ON public.finance_sales_events FOR EACH ROW EXECUTE FUNCTION public.finance_auto_run();
CREATE TRIGGER finance_auto_stock AFTER INSERT ON public.finance_stock_events FOR EACH ROW EXECUTE FUNCTION public.finance_auto_run();
REVOKE ALL ON FUNCTION public.finance_auto_run(),public.finance_automation_settings(boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_automation_settings(boolean,boolean) TO authenticated;
COMMIT;
