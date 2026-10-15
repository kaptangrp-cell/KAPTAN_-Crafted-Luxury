BEGIN;
CREATE TABLE public.finance_validations(extraction_id uuid PRIMARY KEY REFERENCES public.finance_extractions(id),state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','finished','error')),lease uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,result jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
ALTER TABLE public.finance_validations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_validations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_validations TO authenticated;
CREATE POLICY finance_read ON public.finance_validations FOR SELECT TO authenticated USING(public.finance_role() IS NOT NULL);
CREATE FUNCTION public.finance_validation_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO public.finance_validations(extraction_id) VALUES(NEW.id);RETURN NULL;END $$;
CREATE TRIGGER finance_validation_enqueue AFTER INSERT ON public.finance_extractions FOR EACH ROW EXECUTE FUNCTION public.finance_validation_enqueue();
CREATE FUNCTION public.finance_validation_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.finance_validations;token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO job FROM public.finance_validations WHERE state='queued' OR (state='processing' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.finance_validations SET state='processing',lease=token,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE extraction_id=job.extraction_id;
 RETURN (SELECT jsonb_build_object('id',job.extraction_id,'lease',token,'xml',result->>'xml','profile',result->>'profile') FROM public.finance_extractions WHERE id=job.extraction_id);
END $$;
CREATE FUNCTION public.finance_validation_finish(p_id uuid,p_lease uuid,p_result jsonb,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_result IS NOT NULL AND (jsonb_typeof(p_result->'accepted') IS DISTINCT FROM 'boolean' OR length(p_result::text)>5000000) THEN RAISE EXCEPTION 'Invalid validator result'; END IF;
 IF (p_result IS NULL)=(p_error IS NULL) THEN RAISE EXCEPTION 'Provide a report or an error'; END IF;
 UPDATE public.finance_validations SET state=CASE WHEN p_error IS NULL THEN 'finished' ELSE 'error' END,result=p_result,error=left(p_error,1000),finished_at=now(),lease=NULL,lease_until=NULL WHERE extraction_id=p_id AND state='processing' AND lease=p_lease AND lease_until>=now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Validation lease expired or superseded'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference,details) VALUES((SELECT created_by FROM public.finance_extractions WHERE id=p_id),'incoming_validation_finished',p_id::text,jsonb_build_object('execution','local_validation_worker','accepted',p_result->'accepted','error',left(p_error,1000)));
END $$;
CREATE FUNCTION public.finance_validation_retry(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(public.finance_role(),'') NOT IN ('owner','accountant','staff') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 -- Infrastructure errors only. Rejected immutable originals retain their official rejection report.
 UPDATE public.finance_validations SET state='queued',error=NULL,finished_at=NULL WHERE extraction_id=p_id AND state='error';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only failed validation infrastructure can retry'; END IF;
 INSERT INTO public.finance_audit(actor,event,reference) VALUES(auth.uid(),'incoming_validation_retry',p_id::text);
END $$;
CREATE OR REPLACE FUNCTION public.finance_document_details(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.finance_role() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('retention',(SELECT to_jsonb(r) FROM public.finance_document_retention r WHERE document_id=p_id),'extractions',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT e.id,e.engine,e.result,e.created_at,(SELECT jsonb_build_object('state',v.state,'accepted',v.result->'accepted','engine',v.result->>'engine','configuration',v.result->>'configuration','report',v.result->>'report','error',v.error,'attempts',v.attempts) FROM public.finance_validations v WHERE extraction_id=e.id) validation FROM public.finance_extractions e WHERE document_id=p_id ORDER BY created_at DESC LIMIT 10)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_validation_enqueue(),public.finance_validation_claim(),public.finance_validation_finish(uuid,uuid,jsonb,text),public.finance_validation_retry(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_validation_claim(),public.finance_validation_finish(uuid,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_validation_retry(uuid) TO authenticated;
COMMIT;
