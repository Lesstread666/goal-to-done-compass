import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string } | null;
  redirect_uri?: string;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  user?: { email?: string } | null;
};
type OAuthResult = { data: OAuthDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "Share your email address",
  profile: "Share your basic profile",
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connect an assistant — Ticklist" },
      { name: "description", content: "Let an AI assistant use Ticklist on your behalf." },
      { property: "og:title", content: "Connect an assistant — Ticklist" },
      { property: "og:description", content: "Let an AI assistant use Ticklist on your behalf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its authorization id. Start again from your assistant.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message || "This connection request has expired. Start again from your assistant.");
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: u } = await supabase.auth.getUser();
    return { details: data, email: u.user?.email ?? "" };
  },
  pendingComponent: () => (
    <main className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></main>
  ),
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-7">
        <h1 className="text-xl font-bold">Couldn't load this connection request</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    </main>
  ),
  component: Consent,
});

function Consent() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = details?.client?.name ?? details?.client?.client_name ?? "An assistant";
  const redirectUri = details?.client?.redirect_uri ?? details?.redirect_uri;
  const scopes = (details?.scope ?? "openid email profile").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve ? await oauth().approveAuthorization(authorization_id) : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("The sign-in service didn't say where to go next. Please try again from your assistant.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-2xl p-7">
        <div className="flex items-center gap-2 text-primary"><ListChecks /> <span className="font-semibold">Ticklist</span></div>
        <h1 className="mt-4 text-2xl font-bold">Connect {client} to Ticklist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {client} will be able to read your goals and tasks, update tasks and create new plans — as you{email ? ` (${email})` : ""}.
        </p>
        {redirectUri && <p className="mt-2 break-all text-xs text-muted-foreground">Returns to: {redirectUri}</p>}
        <ul className="mt-4 space-y-1 text-sm">
          {scopes.map((s) => <li key={s}>• {SCOPE_LABELS[s] ?? `Additional permission requested: ${s}`}</li>)}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">This doesn't bypass Ticklist's permissions — it only sees your own projects.</p>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-3">
          <Button className="flex-1 glow" disabled={busy} onClick={() => decide(true)}>Approve</Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>Cancel connection</Button>
        </div>
      </div>
    </main>
  );
}
