CREATE OR REPLACE FUNCTION public.edit_goal_team(p_goal_id uuid, p_title text, p_description text, p_deadline date, p_participants jsonb, p_assignments jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.goals WHERE id = p_goal_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'Goal not found'; END IF;
 IF length(trim(p_title)) = 0 THEN RAISE EXCEPTION 'Goal title is required'; END IF;
 IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_participants) < 1 THEN RAISE EXCEPTION 'Add at least one participant'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) p WHERE coalesce(trim(p->>'name'),'') = '') THEN RAISE EXCEPTION 'Participant names are required'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_participants)) <> (SELECT count(DISTINCT lower(trim(p->>'name'))) FROM jsonb_array_elements(p_participants) p) THEN RAISE EXCEPTION 'Participant names must be unique'; END IF;
 IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Assignments are required'; END IF;
 IF EXISTS (SELECT 1 FROM public.tasks t WHERE t.goal_id = p_goal_id AND NOT (p_assignments ? t.id::text)) THEN RAISE EXCEPTION 'Tasks changed. Reopen the editor'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_each_text(p_assignments) a WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id::text = a.key AND t.goal_id = p_goal_id) OR (a.value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) p WHERE p->>'name' = a.value))) THEN RAISE EXCEPTION 'Invalid task assignment'; END IF;
 UPDATE public.goals SET title = trim(p_title), description = p_description, deadline = p_deadline, participants = p_participants WHERE id = p_goal_id AND user_id = auth.uid();
 UPDATE public.tasks t SET assignee = p_assignments->>t.id::text WHERE t.goal_id = p_goal_id AND t.user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.edit_goal_team(uuid,text,text,date,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_goal_team(uuid,text,text,date,jsonb,jsonb) TO authenticated;