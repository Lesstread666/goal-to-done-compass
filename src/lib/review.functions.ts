import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatAndStore, reviewAndStore } from "./review-core";

export const reviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ goalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await reviewAndStore(context.supabase, data.goalId);
    return { ok: true };
  });

export const chatPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ goalId: z.string().uuid(), message: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await chatAndStore(context.supabase, data.goalId, data.message);
    return { ok: true };
  });
