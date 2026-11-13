ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS requirements text NOT NULL DEFAULT '';

CREATE TABLE public.deleted_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'todo',
  deadline date,
  deleted_by uuid DEFAULT auth.uid(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  evaluated boolean NOT NULL DEFAULT false
);
GRANT SELECT, UPDATE ON public.deleted_tasks TO authenticated;
GRANT ALL ON public.deleted_tasks TO service_role;
ALTER TABLE public.deleted_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read deleted tasks" ON public.deleted_tasks FOR SELECT TO authenticated USING (public.is_goal_member(goal_id));
CREATE POLICY "members mark deleted tasks" ON public.deleted_tasks FOR UPDATE TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));

CREATE OR REPLACE FUNCTION public.archive_deleted_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.goals WHERE id = OLD.goal_id) THEN
    INSERT INTO public.deleted_tasks (goal_id, task_id, title, description, priority, status, deadline)
    VALUES (OLD.goal_id, OLD.id, OLD.title, OLD.description, OLD.priority, OLD.status, OLD.deadline);
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER tasks_archive_on_delete AFTER DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_task();

CREATE TABLE public.project_assessments (
  goal_id uuid PRIMARY KEY REFERENCES public.goals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'on_track',
  summary text NOT NULL DEFAULT '',
  uncertainty text NOT NULL DEFAULT '',
  fingerprint text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.project_assessments TO authenticated;
GRANT ALL ON public.project_assessments TO service_role;
ALTER TABLE public.project_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read assessments" ON public.project_assessments FOR SELECT TO authenticated USING (public.is_goal_member(goal_id));
CREATE POLICY "members write assessments" ON public.project_assessments FOR INSERT TO authenticated WITH CHECK (public.is_goal_member(goal_id));
CREATE POLICY "members update assessments" ON public.project_assessments FOR UPDATE TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));

CREATE TABLE public.project_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  task_id uuid,
  task_title text NOT NULL DEFAULT '',
  from_priority text,
  to_priority text,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (goal_id, dedupe_key)
);
GRANT SELECT, INSERT, UPDATE ON public.project_insights TO authenticated;
GRANT ALL ON public.project_insights TO service_role;
ALTER TABLE public.project_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read insights" ON public.project_insights FOR SELECT TO authenticated USING (public.is_goal_member(goal_id));
CREATE POLICY "members add insights" ON public.project_insights FOR INSERT TO authenticated WITH CHECK (public.is_goal_member(goal_id));
CREATE POLICY "members resolve insights" ON public.project_insights FOR UPDATE TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));