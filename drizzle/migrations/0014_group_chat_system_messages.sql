ALTER TABLE public.chat_group_messages ADD COLUMN kind text NOT NULL DEFAULT 'user' CHECK (kind IN ('user','system'));
CREATE POLICY "only user messages from clients" ON public.chat_group_messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (kind = 'user');

CREATE OR REPLACE FUNCTION public.add_group_member(p_group uuid, p_user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a text; b text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_groups WHERE id = p_group AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Only the group owner can add members'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE user_id = auth.uid() AND contact_id = p_user) THEN RAISE EXCEPTION 'You can only add people from your team'; END IF;
  INSERT INTO public.chat_group_members(group_id, user_id, last_read_id) VALUES (p_group, p_user, 0) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    SELECT username INTO a FROM public.profiles WHERE id = auth.uid();
    SELECT username INTO b FROM public.profiles WHERE id = p_user;
    INSERT INTO public.chat_group_messages(group_id, sender_id, body, kind) VALUES (p_group, auth.uid(), '@'||a||' added @'||b, 'system');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_group uuid, p_user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a text; b text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_groups WHERE id = p_group AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Only the group owner can remove members'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'Use Leave group to leave'; END IF;
  DELETE FROM public.chat_group_members WHERE group_id = p_group AND user_id = p_user;
  IF FOUND THEN
    SELECT username INTO a FROM public.profiles WHERE id = auth.uid();
    SELECT username INTO b FROM public.profiles WHERE id = p_user;
    INSERT INTO public.chat_group_messages(group_id, sender_id, body, kind) VALUES (p_group, auth.uid(), '@'||a||' removed @'||b, 'system');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.leave_group_chat(p_group uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE next_owner uuid; a text;
BEGIN
  IF NOT public.is_chat_member(p_group) THEN RAISE EXCEPTION 'Not a member of this group'; END IF;
  DELETE FROM public.chat_group_members WHERE group_id = p_group AND user_id = auth.uid();
  SELECT user_id INTO next_owner FROM public.chat_group_members WHERE group_id = p_group ORDER BY joined_at, user_id LIMIT 1;
  IF next_owner IS NULL THEN DELETE FROM public.chat_groups WHERE id = p_group; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.chat_groups WHERE id = p_group AND owner_id = auth.uid()) THEN
    UPDATE public.chat_groups SET owner_id = next_owner WHERE id = p_group;
  END IF;
  SELECT username INTO a FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.chat_group_messages(group_id, sender_id, body, kind) VALUES (p_group, auth.uid(), '@'||a||' left the group', 'system');
END $function$;

DROP FUNCTION public.my_group_chats();
CREATE FUNCTION public.my_group_chats()
 RETURNS TABLE(id uuid, name text, owner_id uuid, member_count bigint, last_body text, last_sender uuid, last_at timestamp with time zone, last_has_attachment boolean, last_kind text, unread bigint, created_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT g.id, g.name, g.owner_id,
    (SELECT count(*) FROM public.chat_group_members x WHERE x.group_id = g.id),
    l.body, l.sender_id, l.created_at, l.attachment_path IS NOT NULL, l.kind,
    (SELECT count(*) FROM public.chat_group_messages m WHERE m.group_id = g.id AND m.sender_id <> auth.uid() AND m.id > me.last_read_id),
    g.created_at
  FROM public.chat_group_members me JOIN public.chat_groups g ON g.id = me.group_id
  LEFT JOIN LATERAL (SELECT * FROM public.chat_group_messages m WHERE m.group_id = g.id ORDER BY m.id DESC LIMIT 1) l ON true
  WHERE me.user_id = auth.uid()
  ORDER BY coalesce(l.created_at, g.created_at) DESC
$function$;
GRANT EXECUTE ON FUNCTION public.my_group_chats() TO authenticated;