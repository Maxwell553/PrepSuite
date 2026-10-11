CREATE TABLE public.analysis_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 input JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','complete','failed','cancelled')),
 progress JSONB, result JSONB, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 lease_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own jobs" ON public.analysis_jobs FOR SELECT TO authenticated USING(auth.uid()=user_id);
REVOKE ALL ON public.analysis_jobs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.analysis_jobs FROM authenticated;
GRANT SELECT ON public.analysis_jobs TO authenticated;
GRANT ALL ON public.analysis_jobs TO service_role;
CREATE INDEX ON public.analysis_jobs(status, created_at);
CREATE OR REPLACE FUNCTION public.claim_analysis_job()
RETURNS SETOF public.analysis_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job_id UUID;
BEGIN
 -- Serialize capacity checks; at most four global workers.
 PERFORM pg_advisory_xact_lock(703261010);
 DELETE FROM public.analysis_jobs WHERE status IN ('complete','failed','cancelled') AND updated_at < now()-interval '7 days';
 UPDATE public.analysis_jobs SET status='failed',error='Analysis interrupted. Please retry.',updated_at=now()
 WHERE status='running' AND lease_until<now() AND attempts>=3;
 IF (SELECT count(*) FROM public.analysis_jobs WHERE status='running' AND lease_until>now()) >= 4 THEN RETURN; END IF;
 SELECT id INTO job_id FROM public.analysis_jobs
 WHERE (status='queued' OR (status='running' AND lease_until<now())) AND attempts<3
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF job_id IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE public.analysis_jobs SET status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes',updated_at=now()
 WHERE id=job_id RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_analysis_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_analysis_job() TO service_role;
