import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ClarifyInput, PlanInput, clarifyGoal, generateAndSavePlan } from "./plan-core";

export const createGoalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { goalId, warning } = await generateAndSavePlan(context.supabase, context.userId, data);
    return { goalId, warning };
  });

export const clarifyGoalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClarifyInput.parse(d))
  .handler(async ({ data }) => clarifyGoal(data));
