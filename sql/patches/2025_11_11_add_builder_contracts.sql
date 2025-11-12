-- Adds builder/contract PO fields used by /api/builder-pos/ingest
-- Safe to run multiple times; uses IF NOT EXISTS guards.

BEGIN;

-- bids table: ensure needed columns
ALTER TABLE IF EXISTS public.bids
  ADD COLUMN IF NOT EXISTS po_number text;

ALTER TABLE IF EXISTS public.bids
  ADD COLUMN IF NOT EXISTS contract_id integer;

ALTER TABLE IF EXISTS public.bids
  ADD COLUMN IF NOT EXISTS is_contract boolean DEFAULT false;

ALTER TABLE IF EXISTS public.bids
  ADD COLUMN IF NOT EXISTS po_received_at timestamptz;

-- stage column may already exist; add if missing
ALTER TABLE IF EXISTS public.bids
  ADD COLUMN IF NOT EXISTS stage text;

-- Optional: uniqueness on po_number (nullable unique allows multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='bids_po_number_unique'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX bids_po_number_unique ON public.bids (po_number) WHERE po_number IS NOT NULL;
    EXCEPTION WHEN others THEN
      -- ignore if index creation fails due to existing similar index
      NULL;
    END;
  END IF;
END$$;

-- resources table: add utilization column if referenced elsewhere
ALTER TABLE IF EXISTS public.resources
  ADD COLUMN IF NOT EXISTS utilization numeric;

COMMIT;
