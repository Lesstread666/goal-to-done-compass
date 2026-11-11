DROP FUNCTION IF EXISTS public.publish_goal(uuid);
COMMENT ON TABLE public.plan_chat IS 'DEPRECATED: plan review feature removed';
COMMENT ON TABLE public.plan_proposals IS 'DEPRECATED: plan review feature removed';
COMMENT ON TABLE public.plan_reviews IS 'DEPRECATED: plan review feature removed';
COMMENT ON COLUMN public.tasks.manually_edited IS 'DEPRECATED: plan review feature removed';
COMMENT ON COLUMN public.goals.pending_invitees IS 'DEPRECATED: plan review feature removed';
COMMENT ON COLUMN public.goals.status IS 'DEPRECATED: plan review feature removed';