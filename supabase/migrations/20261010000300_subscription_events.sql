ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_event_created BIGINT NOT NULL DEFAULT 0;
CREATE TABLE public.subscription_events(event_id TEXT PRIMARY KEY,received_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_events FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.sync_subscription_event(p_event_id TEXT,p_created BIGINT,p_user_id UUID,p_subscription_id TEXT,p_status TEXT,p_period_end TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous BIGINT;
BEGIN
 SELECT stripe_event_created INTO previous FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
 INSERT INTO public.subscription_events(event_id) VALUES(p_event_id) ON CONFLICT DO NOTHING;
 IF NOT FOUND OR previous>p_created THEN RETURN FALSE; END IF;
 UPDATE public.profiles SET stripe_subscription_id=p_subscription_id,subscription_status=p_status,current_period_end=p_period_end,stripe_event_created=p_created,updated_at=now() WHERE id=p_user_id;
 RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_subscription_event(TEXT,BIGINT,UUID,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_event(TEXT,BIGINT,UUID,TEXT,TEXT,TIMESTAMPTZ) TO service_role;
