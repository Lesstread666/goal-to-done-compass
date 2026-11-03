ALTER TABLE public.messages ADD COLUMN read_at timestamptz;
CREATE POLICY "recipient marks read" ON public.messages FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_sender uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.messages SET read_at = now() WHERE recipient_id = auth.uid() AND sender_id = p_sender AND read_at IS NULL;
$$;