import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PlanInput, generateAndSavePlan } from "./plan-core";
import { reviewAndStore } from "./review-core";

const CreateInput = PlanInput.extend({ invitees: z.array(z.string().uuid()).max(12).default([]) });

export const createGoalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { invitees, ...plan } = data;
    // New web projects start as drafts: no invites go out until the owner publishes.
    const { goalId, warning } = await generateAndSavePlan(context.supabase, context.userId, plan, { draft: true, invitees });
    // Separate AI pass: review the fresh plan. A failed review must not lose the draft.
    try { await reviewAndStore(context.supabase, goalId); } catch (e) { console.error("plan review failed", e); }
    return { goalId, warning };
  });
