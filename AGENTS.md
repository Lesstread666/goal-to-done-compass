<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI plan generation lives in `src/lib/plan.functions.ts` (authenticated server fn, Responses API with strict json_schema) — keeps prompts server-side and output parseable.
- Goals/tasks are read and updated from the browser via the Supabase client under per-user RLS; "delayed" is derived (`isDelayed` in `src/lib/goals.ts`), never stored — avoids scheduled jobs.
- Goal and participant edits use the invoker-rights `edit_goal_team` database function so participant changes and task assignments persist atomically under owner RLS; task editing and confirmed deletions use the browser client.
- The assistant (MCP) server lives in `src/lib/mcp/` with OAuth via the backend auth issuer; tools use the caller-scoped client so RLS limits them to the caller's goals, and AI planning is shared via `src/lib/plan-core.ts`.
