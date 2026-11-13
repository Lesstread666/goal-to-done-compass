ALTER TABLE public.deleted_tasks ADD COLUMN IF NOT EXISTS assignee text, ADD COLUMN IF NOT EXISTS position integer, ADD COLUMN IF NOT EXISTS restored_at timestamptz, ADD COLUMN IF NOT EXISTS restored_task_id uuid;
ALTER TABLE public.project_insights ADD COLUMN IF NOT EXISTS deleted_id uuid, ADD COLUMN IF NOT EXISTS suggested_deadline date, ADD COLUMN IF NOT EXISTS proposal jsonb;

CREATE OR REPLACE FUNCTION public.archive_deleted_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.goals WHERE id = OLD.goal_id) THEN
    INSERT INTO public.deleted_tasks (goal_id, task_id, title, description, priority, status, deadline, assignee, position)
    VALUES (OLD.goal_id, OLD.id, OLD.title, OLD.description, OLD.priority, OLD.status, OLD.deadline, OLD.assignee, OLD.position);
  END IF;
  RETURN OLD;
END $$;

-- Invoker rights: membership RLS on tasks/deleted_tasks/project_insights applies. Restores at most once.
CREATE OR REPLACE FUNCTION public.restore_deleted_task(p_deleted_id uuid, p_deadline date) RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d public.deleted_tasks; g public.goals; new_id uuid; who text;
BEGIN
  SELECT * INTO d FROM public.deleted_tasks WHERE id = p_deleted_id FOR UPDATE;
  IF d.id IS NULL OR NOT public.is_goal_member(d.goal_id) THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF d.restored_at IS NOT NULL THEN RAISE EXCEPTION 'This task was already restored'; END IF;
  SELECT * INTO g FROM public.goals WHERE id = d.goal_id;
  IF p_deadline IS NOT NULL AND g.deadline IS NOT NULL AND p_deadline >= g.deadline THEN RAISE EXCEPTION 'Deadline must be before the project deadline'; END IF;
  who := CASE WHEN d.assignee IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(g.participants) p WHERE p->>'name' = d.assignee) THEN d.assignee END;
  INSERT INTO public.tasks (goal_id, title, description, priority, assignee, status, deadline, position)
  VALUES (d.goal_id, d.title, d.description, d.priority, who, CASE WHEN d.status = 'in_progress' THEN 'in_progress' ELSE 'todo' END, p_deadline,
    COALESCE(d.position, (SELECT COALESCE(max(position), -1) + 1 FROM public.tasks WHERE goal_id = d.goal_id)))
  RETURNING id INTO new_id;
  UPDATE public.deleted_tasks SET restored_at = now(), restored_task_id = new_id WHERE id = d.id;
  UPDATE public.project_insights SET status = 'accepted', resolved_at = now() WHERE deleted_id = d.id AND status = 'open';
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.restore_deleted_task(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_task(uuid, date) TO authenticated;