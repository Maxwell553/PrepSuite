-- Optional charging path. Analysis charging remains disabled unless BILLING_ENABLED=true.
CREATE TABLE public.credit_reservations (
 request_id TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reserved INTEGER NOT NULL CHECK(reserved>=0),charged INTEGER NOT NULL DEFAULT 0 CHECK(charged>=0),
 status TEXT NOT NULL CHECK(status IN('reserved','settled','released')),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_reservations FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.reserve_analysis_credits(p_request_id TEXT,p_user_id UUID,p_amount INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.credit_reservations;
BEGIN
 IF p_amount<0 OR p_amount>1000000 THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
 -- One row serializes retries of the same logical request.
 INSERT INTO public.credit_reservations(request_id,user_id,reserved,status) VALUES(p_request_id,p_user_id,0,'released') ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.credit_reservations WHERE request_id=p_request_id FOR UPDATE;
 IF r.user_id<>p_user_id THEN RAISE EXCEPTION 'Reservation owner mismatch'; END IF;
 IF r.status IN ('reserved','settled') THEN RETURN TRUE; END IF;
 UPDATE public.profiles SET credits=credits-p_amount,updated_at=now() WHERE id=p_user_id AND credits>=p_amount;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 UPDATE public.credit_reservations SET reserved=p_amount,charged=0,status='reserved',updated_at=now() WHERE request_id=p_request_id;
 RETURN TRUE;
END;
$$;
CREATE OR REPLACE FUNCTION public.settle_analysis_credits(p_request_id TEXT,p_amount INTEGER,p_success BOOLEAN)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.credit_reservations; final_charge INTEGER;
BEGIN
 SELECT * INTO r FROM public.credit_reservations WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reservation missing'; END IF;
 IF r.status<>'reserved' THEN RETURN r.charged; END IF;
 final_charge=CASE WHEN p_success THEN p_amount ELSE 0 END;
 IF final_charge<0 OR final_charge>r.reserved THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
 UPDATE public.profiles SET credits=credits+r.reserved-final_charge,updated_at=now() WHERE id=r.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile missing'; END IF;
 UPDATE public.credit_reservations SET charged=final_charge,status=CASE WHEN p_success THEN 'settled' ELSE 'released' END,updated_at=now() WHERE request_id=p_request_id;
 RETURN final_charge;
END;
$$;
CREATE OR REPLACE FUNCTION public.release_expired_credit_reservations()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r RECORD; total INTEGER=0;
BEGIN
 FOR r IN SELECT request_id FROM public.credit_reservations WHERE status='reserved' AND updated_at<now()-interval '10 minutes' FOR UPDATE SKIP LOCKED LOOP
  PERFORM public.settle_analysis_credits(r.request_id,0,FALSE);total=total+1;
 END LOOP;
 RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_analysis_credits(TEXT,UUID,INTEGER) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_analysis_credits(TEXT,INTEGER,BOOLEAN) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_expired_credit_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_analysis_credits(TEXT,UUID,INTEGER),public.settle_analysis_credits(TEXT,INTEGER,BOOLEAN),public.release_expired_credit_reservations() TO service_role;
