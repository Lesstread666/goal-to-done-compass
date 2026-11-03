import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PlanInput, generateAndSavePlan } from "./plan-core";

export const createGoalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { goalId } = await generateAndSavePlan(context.supabase, context.userId, data);
    return { goalId };
  });
