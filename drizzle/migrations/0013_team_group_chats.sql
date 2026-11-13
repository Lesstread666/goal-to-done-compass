CREATE TABLE public.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chat_group_members (
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE public.chat_group_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  attachment_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(body)) > 0 OR attachment_path IS NOT NULL)
);
CREATE INDEX chat_group_messages_group_idx ON public.chat_group_messages(group_id, id DESC);
CREATE TABLE public.chat_group_reactions (
  message_id bigint NOT NULL REFERENCES public.chat_group_messages(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  emoji text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

GRANT SELECT ON public.chat_groups TO authenticated;
GRANT SELECT ON public.chat_group_members TO authenticated;
GRANT SELECT, INSERT ON public.chat_group_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_group_reactions TO authenticated;
GRANT ALL ON public.chat_groups, public.chat_group_members, public.chat_group_messages, public.chat_group_reactions TO service_role;

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_reactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_member(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_group_members WHERE group_id = p_group AND user_id = auth.uid())
$$;

CREATE POLICY "members read groups" ON public.chat_groups FOR SELECT TO authenticated USING (public.is_chat_member(id));
CREATE POLICY "members read members" ON public.chat_group_members FOR SELECT TO authenticated USING (public.is_chat_member(group_id));
CREATE POLICY "members read messages" ON public.chat_group_messages FOR SELECT TO authenticated USING (public.is_chat_member(group_id));
CREATE POLICY "members send messages" ON public.chat_group_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(group_id)
    AND (attachment_path IS NULL OR split_part(attachment_path, '/', 1) = group_id::text));
CREATE POLICY "members read reactions" ON public.chat_group_reactions FOR SELECT TO authenticated USING (public.is_chat_member(group_id));
CREATE POLICY "members react" ON public.chat_group_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_chat_member(group_id)
    AND EXISTS (SELECT 1 FROM public.chat_group_messages m WHERE m.id = message_id AND m.group_id = chat_group_reactions.group_id));
CREATE POLICY "remove own reactions" ON public.chat_group_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_group_chat(p_name text, p_members uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gid uuid; m uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF length(trim(coalesce(p_name,''))) = 0 THEN RAISE EXCEPTION 'Group name is required'; END IF;
  IF coalesce(array_length(p_members,1),0) = 0 THEN RAISE EXCEPTION 'Pick at least one teammate'; END IF;
  FOREACH m IN ARRAY p_members LOOP
    IF m <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE user_id = auth.uid() AND contact_id = m) THEN
      RAISE EXCEPTION 'You can only add people from your team';
    END IF;
  END LOOP;
  INSERT INTO public.chat_groups(name, owner_id) VALUES (left(trim(p_name),60), auth.uid()) RETURNING id INTO gid;
  INSERT INTO public.chat_group_members(group_id, user_id) VALUES (gid, auth.uid());
  INSERT INTO public.chat_group_members(group_id, user_id, joined_at)
    SELECT gid, x, now() + interval '1 microsecond' FROM unnest(p_members) x WHERE x <> auth.uid() ON CONFLICT DO NOTHING;
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.add_group_member(p_group uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_groups WHERE id = p_group AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Only the group owner can add members'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE user_id = auth.uid() AND contact_id = p_user) THEN RAISE EXCEPTION 'You can only add people from your team'; END IF;
  INSERT INTO public.chat_group_members(group_id, user_id, last_read_id)
    VALUES (p_group, p_user, 0) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_group uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_groups WHERE id = p_group AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Only the group owner can remove members'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'Use Leave group to leave'; END IF;
  DELETE FROM public.chat_group_members WHERE group_id = p_group AND user_id = p_user;
END $$;

CREATE OR REPLACE FUNCTION public.leave_group_chat(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_owner uuid;
BEGIN
  IF NOT public.is_chat_member(p_group) THEN RAISE EXCEPTION 'Not a member of this group'; END IF;
  DELETE FROM public.chat_group_members WHERE group_id = p_group AND user_id = auth.uid();
  IF EXISTS (SELECT 1 FROM public.chat_groups WHERE id = p_group AND owner_id = auth.uid()) THEN
    SELECT user_id INTO next_owner FROM public.chat_group_members WHERE group_id = p_group ORDER BY joined_at, user_id LIMIT 1;
    IF next_owner IS NULL THEN DELETE FROM public.chat_groups WHERE id = p_group;
    ELSE UPDATE public.chat_groups SET owner_id = next_owner WHERE id = p_group; END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rename_group_chat(p_group uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_chat_member(p_group) THEN RAISE EXCEPTION 'Not a member of this group'; END IF;
  IF length(trim(coalesce(p_name,''))) = 0 THEN RAISE EXCEPTION 'Group name is required'; END IF;
  UPDATE public.chat_groups SET name = left(trim(p_name),60) WHERE id = p_group;
END $$;

CREATE OR REPLACE FUNCTION public.mark_group_read(p_group uuid, p_message_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.chat_group_members SET last_read_id = greatest(last_read_id, p_message_id)
  WHERE group_id = p_group AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_group_chats()
RETURNS TABLE(id uuid, name text, owner_id uuid, member_count bigint, last_body text, last_sender uuid, last_at timestamptz, last_has_attachment boolean, unread bigint, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.owner_id,
    (SELECT count(*) FROM public.chat_group_members x WHERE x.group_id = g.id),
    l.body, l.sender_id, l.created_at, l.attachment_path IS NOT NULL,
    (SELECT count(*) FROM public.chat_group_messages m WHERE m.group_id = g.id AND m.sender_id <> auth.uid() AND m.id > me.last_read_id),
    g.created_at
  FROM public.chat_group_members me JOIN public.chat_groups g ON g.id = me.group_id
  LEFT JOIN LATERAL (SELECT * FROM public.chat_group_messages m WHERE m.group_id = g.id ORDER BY m.id DESC LIMIT 1) l ON true
  WHERE me.user_id = auth.uid()
  ORDER BY coalesce(l.created_at, g.created_at) DESC
$$;

REVOKE EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]), public.add_group_member(uuid, uuid), public.remove_group_member(uuid, uuid), public.leave_group_chat(uuid), public.rename_group_chat(uuid, text), public.mark_group_read(uuid, bigint), public.my_group_chats(), public.is_chat_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]), public.add_group_member(uuid, uuid), public.remove_group_member(uuid, uuid), public.leave_group_chat(uuid), public.rename_group_chat(uuid, text), public.mark_group_read(uuid, bigint), public.my_group_chats(), public.is_chat_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_profile(p_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT p_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.team_contacts WHERE (user_id = auth.uid() AND contact_id = p_id) OR (user_id = p_id AND contact_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.goal_members a JOIN public.goal_members b ON a.goal_id = b.goal_id WHERE a.user_id = auth.uid() AND b.user_id = p_id)
    OR EXISTS (SELECT 1 FROM public.goal_invites i WHERE (i.invitee_id = p_id AND public.is_goal_member(i.goal_id)) OR (i.invitee_id = auth.uid() AND i.inviter_id = p_id))
    OR EXISTS (SELECT 1 FROM public.messages m WHERE (m.sender_id = auth.uid() AND m.recipient_id = p_id) OR (m.sender_id = p_id AND m.recipient_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.chat_group_members a JOIN public.chat_group_members b ON a.group_id = b.group_id WHERE a.user_id = auth.uid() AND b.user_id = p_id)
$function$;

CREATE POLICY "chat members read attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND public.is_chat_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "chat members upload attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND public.is_chat_member(((storage.foldername(name))[1])::uuid));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_members;