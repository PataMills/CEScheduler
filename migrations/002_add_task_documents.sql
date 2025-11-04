-- Task-level attachments for service/installation tasks
CREATE TABLE IF NOT EXISTS public.task_documents (
  id           BIGSERIAL PRIMARY KEY,
  task_id      BIGINT NOT NULL REFERENCES public.install_tasks(id) ON DELETE CASCADE,
  name         TEXT,
  url          TEXT NOT NULL,
  mime_type    TEXT,
  uploaded_by  TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_documents_task_idx ON public.task_documents (task_id);
