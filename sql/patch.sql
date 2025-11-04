-- ensure helper exists (you already have this)
-- CREATE FUNCTION public.digits_only(t text) RETURNS text
--   LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN t IS NULL THEN NULL ELSE regexp_replace(t, '\\D', '', 'g') END $$;

CREATE OR REPLACE VIEW public.install_tasks_for_day AS
SELECT
  t.id              AS task_id,
  t.job_id,
  t.type,
  t.name,
  t.status,
  t.duration_min,
  t.window_start,
  t.window_end,
  r.id              AS resource_id,
  r.name            AS resource_name,
  j.customer_name,
  (COALESCE(j.address_line1,'') || ' ' || COALESCE(j.city,'') || ', ' || COALESCE(j.state,'') || ' ' || COALESCE(j.zip,'')) AS address,
  j.cust_contact_phone,
  j.lat,
  j.lng
FROM public.install_tasks t
JOIN public.install_jobs  j
  ON public.digits_only(j.id) = public.digits_only(t.job_id)   -- robust join
LEFT JOIN public.resources r
  ON r.id = t.resource_id;

-- Optional but recommended indexes (support that join)
CREATE INDEX IF NOT EXISTS idx_install_jobs_id_digits
  ON public.install_jobs (public.digits_only(id));

CREATE INDEX IF NOT EXISTS idx_install_tasks_job_id_digits
  ON public.install_tasks (public.digits_only(job_id));
