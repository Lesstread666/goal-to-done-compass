CREATE OR REPLACE FUNCTION public.can_see_profile(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.team_contacts WHERE (user_id = auth.uid() AND contact_id = p_id) OR (user_id = p_id AND contact_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.goal_members a JOIN public.goal_members b ON a.goal_id = b.goal_id WHERE a.user_id = auth.uid() AND b.user_id = p_id)
    OR EXISTS (SELECT 1 FROM public.goal_invites i WHERE (i.invitee_id = p_id AND public.is_goal_member(i.goal_id)) OR (i.invitee_id = auth.uid() AND i.inviter_id = p_id))
    OR EXISTS (SELECT 1 FROM public.messages m WHERE (m.sender_id = auth.uid() AND m.recipient_id = p_id) OR (m.sender_id = p_id AND m.recipient_id = auth.uid()))
$$;

DROP POLICY IF EXISTS "profiles readable by signed-in users" ON public.profiles;
CREATE POLICY "profiles readable by related users" ON public.profiles FOR SELECT TO authenticated USING (public.can_see_profile(id));

CREATE OR REPLACE FUNCTION public.search_profiles(p_term text)
RETURNS SETOF public.profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.profiles
  WHERE auth.uid() IS NOT NULL AND length(trim(p_term)) >= 1
    AND username ILIKE '%' || replace(replace(replace(lower(trim(p_term)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  ORDER BY username LIMIT 8
$$;

CREATE OR REPLACE FUNCTION public.profile_by_username(p_username text)
RETURNS SETOF public.profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.profiles WHERE auth.uid() IS NOT NULL AND username = lower(trim(p_username)) LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.search_profiles(text), public.profile_by_username(text), public.can_see_profile(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_profiles(text), public.profile_by_username(text), public.can_see_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);