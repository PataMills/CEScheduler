-- material_ready: true when no open/partial PO exists for job
CREATE OR REPLACE FUNCTION public.job_material_ready(p_job_id bigint)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.job_id = p_job_id
      AND COALESCE(po.status, 'open') <> 'received'
  );
$$;
