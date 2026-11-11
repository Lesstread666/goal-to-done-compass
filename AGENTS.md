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
- The assistant (MCP) server lives in `src/lib/mcp/` with OAuth via the backend auth issuer; tools use the caller-scoped client so RLS limits them to the caller's goals, and AI planning is shared via `src/lib/plan-core.ts`.
- Projects are shared through `goal_members` (owner row added by trigger); goal/task RLS uses `is_goal_member`, and joining only happens via the `accept_goal_invite` function — keeps access invite-only and atomic.
- Profiles (username, avatar, bio) are created by an `auth.users` trigger from signup metadata; avatars live in a private bucket and are stored as long-lived signed URLs because the workspace blocks public buckets.
- Direct messages use the `messages` table with Realtime; teammates are per-user `team_contacts` rows.
- New web projects start as `goals.status='draft'` with invitees held in `pending_invitees`; the invoker-rights `publish_goal` function flips to active and sends invites once — keeps drafts private and publishing idempotent.
- Plan review is a separate AI pass (`src/lib/review-core.ts`); the score is the mean of seven criterion scores (`src/lib/review-ops.ts`) and AI edits are stored as one-task `plan_proposals` applied only on owner Accept — keeps scores explainable and changes owner-approved.
