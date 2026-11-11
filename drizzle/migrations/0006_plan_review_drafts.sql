ALTER TABLE public.goals ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE public.goals ADD COLUMN pending_invitees jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN manually_edited boolean NOT NULL DEFAULT false;

CREATE TABLE public.plan_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  score numeric NOT NULL,
  summary text NOT NULL DEFAULT '',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_reviews TO authenticated;
GRANT ALL ON public.plan_reviews TO service_role;
ALTER TABLE public.plan_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage reviews" ON public.plan_reviews FOR ALL TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));

CREATE TABLE public.plan_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source text NOT NULL DEFAULT 'review',
  summary text NOT NULL DEFAULT '',
  op jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_proposals TO authenticated;
GRANT ALL ON public.plan_proposals TO service_role;
ALTER TABLE public.plan_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage proposals" ON public.plan_proposals FOR ALL TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));

CREATE TABLE public.plan_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_chat TO authenticated;
GRANT ALL ON public.plan_chat TO service_role;
ALTER TABLE public.plan_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage plan chat" ON public.plan_chat FOR ALL TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));

CREATE INDEX plan_reviews_goal_idx ON public.plan_reviews(goal_id, created_at);
CREATE INDEX plan_proposals_goal_idx ON public.plan_proposals(goal_id, created_at);
CREATE INDEX plan_chat_goal_idx ON public.plan_chat(goal_id, created_at);

CREATE OR REPLACE FUNCTION public.publish_goal(p_goal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  g public.goals;
  inv uuid;
  sent integer := 0;
BEGIN
  SELECT * INTO g FROM public.goals WHERE id = p_goal_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF g.status <> 'draft' THEN RETURN 0; END IF;
  UPDATE public.goals SET status = 'active' WHERE id = p_goal_id;
  FOR inv IN SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(g.pending_invitees) x LOOP
    IF inv <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.goal_invites WHERE goal_id = p_goal_id AND invitee_id = inv) THEN
      INSERT INTO public.goal_invites (goal_id, invitee_id) VALUES (p_goal_id, inv);
      sent := sent + 1;
    END IF;
  END LOOP;
  RETURN sent;
END;
$$;
GRANT EXECUTE ON FUNCTION public.publish_goal(uuid) TO authenticated;