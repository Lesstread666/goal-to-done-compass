CREATE TABLE public.project_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL DEFAULT auth.uid(),
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.project_messages TO authenticated;
GRANT ALL ON public.project_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.project_messages_id_seq TO authenticated, service_role;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project members read chat" ON public.project_messages FOR SELECT TO authenticated USING (public.is_goal_member(goal_id));
CREATE POLICY "project members send as themselves" ON public.project_messages FOR INSERT TO authenticated WITH CHECK (public.is_goal_member(goal_id) AND sender_id = auth.uid());
CREATE INDEX project_messages_goal_id_id ON public.project_messages(goal_id, id);
CREATE TABLE public.project_chat_reads (
 goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
 user_id uuid NOT NULL DEFAULT auth.uid(),
 last_read_id bigint NOT NULL DEFAULT 0,
 PRIMARY KEY (goal_id, user_id)
);
GRANT SELECT ON public.project_chat_reads TO authenticated;
GRANT ALL ON public.project_chat_reads TO service_role;
ALTER TABLE public.project_chat_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own chat cursor" ON public.project_chat_reads FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_goal_member(goal_id));
CREATE FUNCTION public.project_chat_unread(p_goal_id uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT count(*) FROM public.project_messages m WHERE m.goal_id = p_goal_id AND m.sender_id <> auth.uid() AND m.id > coalesce((SELECT r.last_read_id FROM public.project_chat_reads r WHERE r.goal_id = p_goal_id AND r.user_id = auth.uid()), 0);
$$;
REVOKE ALL ON FUNCTION public.project_chat_unread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_chat_unread(uuid) TO authenticated;
CREATE FUNCTION public.mark_project_chat_read(p_goal_id uuid, p_message_id bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_goal_member(p_goal_id) THEN RAISE EXCEPTION 'Project membership required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.project_messages WHERE goal_id = p_goal_id AND id = p_message_id) THEN RAISE EXCEPTION 'Message does not belong to project'; END IF;
 INSERT INTO public.project_chat_reads(goal_id, user_id, last_read_id) VALUES (p_goal_id, auth.uid(), p_message_id)
 ON CONFLICT (goal_id, user_id) DO UPDATE SET last_read_id = greatest(project_chat_reads.last_read_id, excluded.last_read_id);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_project_chat_read(uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_project_chat_read(uuid,bigint) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;