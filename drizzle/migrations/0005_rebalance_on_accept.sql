CREATE OR REPLACE FUNCTION public.accept_goal_invite(p_invite_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.goal_invites; uname text; added boolean; names text[]; n int;
BEGIN
  SELECT * INTO inv FROM public.goal_invites WHERE id = p_invite_id AND invitee_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  UPDATE public.goal_invites SET status = 'accepted' WHERE id = inv.id;
  INSERT INTO public.goal_members (goal_id, user_id) VALUES (inv.goal_id, auth.uid()) ON CONFLICT DO NOTHING;
  SELECT username INTO uname FROM public.profiles WHERE id = auth.uid();
  UPDATE public.goals SET participants = participants || jsonb_build_array(jsonb_build_object('name', uname, 'role', 'Teammate'))
  WHERE id = inv.goal_id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(participants) e WHERE e->>'name' = uname);
  added := FOUND;
  IF added THEN
    SELECT array_agg(e->>'name' ORDER BY ord) INTO names
    FROM public.goals g, jsonb_array_elements(g.participants) WITH ORDINALITY AS x(e, ord) WHERE g.id = inv.goal_id;
    n := coalesce(array_length(names, 1), 0);
    IF n > 0 THEN
      UPDATE public.tasks t SET assignee = names[((s.rn - 1) % n) + 1]
      FROM (SELECT id, row_number() OVER (ORDER BY deadline NULLS LAST, position, created_at) AS rn
            FROM public.tasks WHERE goal_id = inv.goal_id AND status = 'todo') s
      WHERE t.id = s.id;
    END IF;
  END IF;
  INSERT INTO public.team_contacts (user_id, contact_id) VALUES (auth.uid(), inv.inviter_id), (inv.inviter_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN inv.goal_id;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_goal_invite(uuid) TO authenticated;