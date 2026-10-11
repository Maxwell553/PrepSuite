-- Privileged billing writes must never be exposed to browser roles.
REVOKE ALL ON FUNCTION public.add_credits(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER) TO service_role;
ALTER FUNCTION public.add_credits(UUID, INTEGER) SET search_path = '';
ALTER FUNCTION public.deduct_credits(UUID, INTEGER) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';

CREATE TABLE IF NOT EXISTS public.billing_events (
  event_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL UNIQUE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.fulfill_credit_purchase(p_event_id TEXT, p_session_id TEXT, p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_amount <= 0 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Invalid credit amount'; END IF;
  INSERT INTO public.billing_events(event_id, object_id) VALUES(p_event_id,p_session_id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE public.profiles SET credits = credits + p_amount, updated_at = now() WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfill_credit_purchase(TEXT,TEXT,UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_credit_purchase(TEXT,TEXT,UUID,INTEGER) TO service_role;

-- Global request windows shared across Cloud Run instances.
CREATE TABLE IF NOT EXISTS public.request_limits (
  key TEXT PRIMARY KEY, window_started TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL
);
ALTER TABLE public.request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_limits FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_request_limit(p_key TEXT, p_limit INTEGER, p_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.request_limits AS r(key,window_started,count) VALUES(p_key,now(),1)
  ON CONFLICT(key) DO UPDATE SET
    count = CASE WHEN r.window_started < now() - make_interval(secs=>p_seconds) THEN 1 ELSE r.count + 1 END,
    window_started = CASE WHEN r.window_started < now() - make_interval(secs=>p_seconds) THEN now() ELSE r.window_started END
  RETURNING count INTO n;
  DELETE FROM public.request_limits WHERE window_started < now() - interval '2 days';
  RETURN n <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_request_limit(TEXT,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_request_limit(TEXT,INTEGER,INTEGER) TO service_role;
