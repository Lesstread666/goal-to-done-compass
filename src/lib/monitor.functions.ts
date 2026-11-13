import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { monitorProject } from "./monitor-core";

export const monitorProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ goalId: z.string().uuid(), force: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      return await monitorProject(context.supabase, data.goalId, data.force);
    } catch (e) {
      console.error("monitorProject failed", e);
      return { skipped: true, error: "AI insights are unavailable right now." };
    }
  });
