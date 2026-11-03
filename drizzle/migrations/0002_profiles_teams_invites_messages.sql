CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_url text,
  bio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by signed-in users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(nullif(NEW.raw_user_meta_data->>'username',''), split_part(NEW.email,'@',1), 'user'), '[^a-zA-Z0-9_]', '', 'g'));
  IF length(base) < 3 THEN base := base || 'user'; END IF;
  base := left(base, 16);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    n := n + 1;
    candidate := base || floor(random()*9000+1000)::int::text;
    EXIT WHEN n > 20;
  END LOOP;
  INSERT INTO public.profiles (id, username, avatar_url) VALUES (NEW.id, candidate, NEW.raw_user_meta_data->>'avatar_url') ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- backfill existing users
INSERT INTO public.profiles (id, username)
SELECT u.id, left(lower(regexp_replace(coalesce(split_part(u.email,'@',1),'user'), '[^a-zA-Z0-9_]', '', 'g')) || 'user', 12) || substr(replace(u.id::text,'-',''),1,6)
FROM auth.users u ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.username_available(p_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(p_username))
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

-- project membership
CREATE TABLE public.goal_members (
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, user_id)
);
GRANT SELECT, DELETE ON public.goal_members TO authenticated;
GRANT ALL ON public.goal_members TO service_role;
ALTER TABLE public.goal_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_goal_member(p_goal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.goal_members WHERE goal_id = p_goal_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.goals WHERE id = p_goal_id AND user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.is_goal_member(uuid) TO authenticated;

CREATE POLICY "members see members" ON public.goal_members FOR SELECT TO authenticated USING (public.is_goal_member(goal_id));
CREATE POLICY "leave or remove members" ON public.goal_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_goal_member(goal_id));

INSERT INTO public.goal_members (goal_id, user_id, role) SELECT id, user_id, 'owner' FROM public.goals ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_goal_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.goal_members (goal_id, user_id, role) VALUES (NEW.id, NEW.user_id, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER goals_add_owner AFTER INSERT ON public.goals FOR EACH ROW EXECUTE FUNCTION public.add_goal_owner();

-- shared access on goals and tasks
DROP POLICY "own goals" ON public.goals;
CREATE POLICY "members read goals" ON public.goals FOR SELECT TO authenticated USING (public.is_goal_member(id));
CREATE POLICY "create own goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members update goals" ON public.goals FOR UPDATE TO authenticated USING (public.is_goal_member(id)) WITH CHECK (public.is_goal_member(id));
CREATE POLICY "members delete goals" ON public.goals FOR DELETE TO authenticated USING (public.is_goal_member(id));

DROP POLICY "own tasks" ON public.tasks;
CREATE POLICY "members manage tasks" ON public.tasks FOR ALL TO authenticated USING (public.is_goal_member(goal_id)) WITH CHECK (public.is_goal_member(goal_id));

-- invites
CREATE TABLE public.goal_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL DEFAULT auth.uid(),
  invitee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, invitee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_invites TO authenticated;
GRANT ALL ON public.goal_invites TO service_role;
ALTER TABLE public.goal_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own invites" ON public.goal_invites FOR SELECT TO authenticated USING (invitee_id = auth.uid() OR public.is_goal_member(goal_id));
CREATE POLICY "members invite" ON public.goal_invites FOR INSERT TO authenticated WITH CHECK (inviter_id = auth.uid() AND public.is_goal_member(goal_id) AND status = 'pending');
CREATE POLICY "invitee declines" ON public.goal_invites FOR UPDATE TO authenticated USING (invitee_id = auth.uid()) WITH CHECK (invitee_id = auth.uid() AND status = 'declined');
CREATE POLICY "members cancel invites" ON public.goal_invites FOR DELETE TO authenticated USING (public.is_goal_member(goal_id) OR invitee_id = auth.uid());

-- goal title visible to invitee via function
CREATE OR REPLACE FUNCTION public.my_pending_invites()
RETURNS TABLE (id uuid, goal_id uuid, goal_title text, inviter_username text, inviter_avatar text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.goal_id, g.title, p.username, p.avatar_url, i.created_at
  FROM public.goal_invites i JOIN public.goals g ON g.id = i.goal_id LEFT JOIN public.profiles p ON p.id = i.inviter_id
  WHERE i.invitee_id = auth.uid() AND i.status = 'pending' ORDER BY i.created_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.my_pending_invites() TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_goal_invite(p_invite_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.goal_invites; uname text;
BEGIN
  SELECT * INTO inv FROM public.goal_invites WHERE id = p_invite_id AND invitee_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  UPDATE public.goal_invites SET status = 'accepted' WHERE id = inv.id;
  INSERT INTO public.goal_members (goal_id, user_id) VALUES (inv.goal_id, auth.uid()) ON CONFLICT DO NOTHING;
  SELECT username INTO uname FROM public.profiles WHERE id = auth.uid();
  UPDATE public.goals SET participants = participants || jsonb_build_array(jsonb_build_object('name', uname, 'role', 'Teammate'))
  WHERE id = inv.goal_id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(participants) e WHERE e->>'name' = uname);
  INSERT INTO public.team_contacts (user_id, contact_id) VALUES (auth.uid(), inv.inviter_id), (inv.inviter_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN inv.goal_id;
END $$;

-- team contacts
CREATE TABLE public.team_contacts (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  contact_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id),
  CHECK (user_id <> contact_id)
);
GRANT SELECT, INSERT, DELETE ON public.team_contacts TO authenticated;
GRANT ALL ON public.team_contacts TO service_role;
ALTER TABLE public.team_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contacts" ON public.team_contacts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT EXECUTE ON FUNCTION public.accept_goal_invite(uuid) TO authenticated;

-- direct messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  recipient_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_pair_idx ON public.messages (sender_id, recipient_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own messages" ON public.messages FOR SELECT TO authenticated USING (auth.uid() IN (sender_id, recipient_id));
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- avatar storage policies
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars own upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars own update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars own delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);