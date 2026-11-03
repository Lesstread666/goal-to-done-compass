import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { oauthReturnPath } from "@/lib/oauth-return-path";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Ticklist" },
      { name: "description", content: "Sign in to plan your goals with Ticklist." },
      { property: "og:title", content: "Sign in — Ticklist" },
      { property: "og:description", content: "Sign in to plan your goals with Ticklist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: typeof s["next"] === "string" ? s["next"] : undefined }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = next ? oauthReturnPath(next) : "/dashboard";
  const go = () => (target === "/dashboard" ? navigate({ to: "/dashboard" }) : navigate({ href: target }));
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) go();
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL(target, window.location.origin).href } });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "up" && !data.session) toast.success("Check your email to confirm your account.");
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: next ? new URL(`/auth?next=${encodeURIComponent(target)}`, window.location.origin).href : window.location.origin + "/auth" });
    if (r.error) toast.error(String(r.error.message ?? r.error));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-sm rounded-2xl p-7">
        <h1 className="text-2xl font-bold">{mode === "in" ? "Welcome back" : "Create account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plan big goals, one step at a time.</p>
        <Button variant="outline" className="mt-6 w-full" onClick={google}>
          Continue with Google
        </Button>
        <div className="my-5 text-center text-xs text-muted-foreground">or</div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full glow" disabled={busy}>
            {mode === "in" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <button className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
