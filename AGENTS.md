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
- AI returns effort, phases and dependencies only; `src/lib/plan-schedule.ts` deterministically sets deadlines, priorities and balance — keeps plans within the deadline and testable.
- Goals/tasks are read and updated from the browser via the Supabase client under per-user RLS; "delayed" is derived (`isDelayed` in `src/lib/goals.ts`), never stored — avoids scheduled jobs.
- Goal and participant edits use the invoker-rights `edit_goal_team` database function so participant changes and task assignments persist atomically under owner RLS; task editing and confirmed deletions use the browser client.
- Project edit/delete controls use the authenticated identity and immutable creator ID; database policies enforce creator-only writes, while task writes remain membership-scoped, so hiding controls is not the security boundary.
- The assistant (MCP) server lives in `src/lib/mcp/` with OAuth via the backend auth issuer; tools use the caller-scoped client so RLS limits them to the caller's goals, and AI planning is shared via `src/lib/plan-core.ts`.
- Projects are shared through `goal_members` (owner row added by trigger); goal/task RLS uses `is_goal_member`, and joining only happens via the `accept_goal_invite` function — keeps access invite-only and atomic.
- Profiles (username, avatar, bio) are created by an `auth.users` trigger from signup metadata; avatars live in a private bucket and are stored as long-lived signed URLs because the workspace blocks public buckets.
- Direct messages use the `messages` table with Realtime; teammates are per-user `team_contacts` rows.
- Project group chat shares member-scoped messages and per-user monotonic read cursors across viewports with Realtime and polling fallback; desktop overlays only charts, while mobile opens a body-portaled full-screen dialog from the team row with scroll lock, focus containment and an explicit close control.
- The Goal Clarifier (`clarifyGoal` in `src/lib/plan-core.ts`) is stateless: the dialog sends the whole chat each round and passes the confirmed summary to the planner as `context` — no database storage needed.
- Derive project-local teammate load in `src/lib/workload.ts` for both reassessment and overload flags; use open task counts because effort and availability are not stored, and never change assignments during reassessment.
- Completion reassessment records per-task before/after fields in browser-local undo history; both board and card reopening restore unchanged automatic fields, with priority-only recalculation when history is unavailable, to avoid schema changes and overwriting later edits.
- Derive goal status (completed/failed/at risk/on track) in `src/lib/goal-status.ts` from task data, never stored — keeps sidebar, mobile picker and badges consistent.
