import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { MessageCircle, UserPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { profileByUsernameQuery, contactsQuery, addContact, meQuery } from "@/lib/social";
import { AppNav } from "@/components/social/AppNav";
import { UserAvatar } from "@/components/social/UserAvatar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Ticklist` },
      { name: "description", content: `See @${params.username}'s Ticklist profile and team up.` },
      { property: "og:title", content: `@${params.username} — Ticklist` },
      { property: "og:description", content: `See @${params.username}'s Ticklist profile and team up.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(profileByUsernameQuery(params.username)),
  component: UserPage,
});

function UserPage() {
  const { username } = Route.useParams();
  const { data: p } = useSuspenseQuery(profileByUsernameQuery(username));
  const { data: me } = useQuery(meQuery());
  const { data: contacts = [] } = useQuery(contactsQuery());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inTeam = !!p && contacts.some((c) => c.id === p.id);
  const isMe = p && me && p.id === me.id;

  return (
    <div className="flex min-h-screen pb-20 md:pb-0">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <div className="text-sm text-muted-foreground"><Link to="/teams" className="hover:text-foreground">Teams</Link> › <span className="text-foreground">@{username}</span></div>
        {!p ? (
          <p className="mt-10 text-center text-muted-foreground">No one goes by @{username} yet.</p>
        ) : (
          <section className="glass mt-4 flex flex-col items-center gap-4 rounded-2xl p-6 text-center sm:flex-row sm:text-left">
            <UserAvatar username={p.username} url={p.avatar_url} className="h-24 w-24 text-2xl" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold">@{p.username}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{p.bio || "No bio yet."}</p>
              <p className="mt-1 text-xs text-muted-foreground">On Ticklist since {new Date(p.created_at).toLocaleDateString()}</p>
            </div>
            {!isMe && (
              <div className="flex gap-2">
                {inTeam ? (
                  <Button variant="outline" disabled><Check /> In your team</Button>
                ) : (
                  <Button variant="outline" onClick={async () => { await addContact(p.id); qc.invalidateQueries({ queryKey: ["contacts"] }); toast.success(`@${p.username} added to your team`); }}><UserPlus /> Add to team</Button>
                )}
                <Button className="glow" onClick={() => navigate({ to: "/teams", search: { chat: p.username } })}><MessageCircle /> Message</Button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
