import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { MessageCircle, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { contactsQuery, addContact, meQuery, profileByUsernameQuery, type Message, type Profile } from "@/lib/social";
import { AppNav } from "@/components/social/AppNav";
import { UserAvatar } from "@/components/social/UserAvatar";
import { UserSearch } from "@/components/social/UserSearch";
import { InvitesBanner } from "@/components/social/InvitesBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/teams")({
  validateSearch: z.object({ chat: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Teams — Ticklist" },
      { name: "description", content: "Your Ticklist teammates, invites and messages." },
      { property: "og:title", content: "Teams — Ticklist" },
      { property: "og:description", content: "Your Ticklist teammates, invites and messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const { chat } = Route.useSearch();
  const navigate = useNavigate({ from: "/teams" });
  const qc = useQueryClient();
  const { data: contacts = [], isLoading } = useQuery(contactsQuery());
  const { data: partner } = useQuery({ ...profileByUsernameQuery(chat ?? ""), enabled: !!chat });
  const open = (p: Profile | null) => navigate({ search: p ? { chat: p.username } : {} });

  async function add(p: Profile) {
    await addContact(p.id);
    qc.invalidateQueries({ queryKey: ["contacts"] });
    toast.success(`@${p.username} joined your team`);
  }

  return (
    <div className="flex min-h-screen pb-20 md:pb-0">
      <AppNav />
      <main className="grid w-full gap-6 p-4 md:p-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="text-sm text-muted-foreground">Dashboard › <span className="text-foreground">Teams</span></div>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">Your team</h1>
            <p className="text-sm text-muted-foreground">Everyone you've teamed up with. Say hi, peek at profiles, plan the next big thing.</p>
          </div>
          <InvitesBanner onJoined={(id) => navigate({ to: "/dashboard", search: { goal: id } })} />
          <section className="glass rounded-2xl p-4">
            <h2 className="mb-3 text-sm font-semibold">Find people</h2>
            <UserSearch action={(p) => contacts.some((c) => c.id === p.id) ? <span className="text-xs text-muted-foreground">In team</span> : <Button size="sm" onClick={() => add(p)}><UserPlus /> Add</Button>} />
          </section>
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Teammates ({contacts.length})</h2>
            {isLoading ? <p className="text-muted-foreground">Loading…</p> : !contacts.length ? (
              <p className="text-sm text-muted-foreground">No teammates yet — search a username above, or invite someone to a project.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {contacts.map((c) => (
                  <div key={c.id} className={cn("rounded-2xl border bg-panel/60 p-4", partner?.id === c.id && "border-primary")}>
                    <div className="flex items-center gap-3">
                      <UserAvatar username={c.username} url={c.avatar_url} className="h-11 w-11" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">@{c.username}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.bio || "Ticklist teammate"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => open(c)}><MessageCircle /> Message</Button>
                      <Button size="sm" variant="outline" asChild><Link to="/u/$username" params={{ username: c.username }}>Profile</Link></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        {partner ? <ChatPanel partner={partner} onClose={() => open(null)} /> : (
          <aside className="glass hidden h-fit rounded-2xl p-6 text-center text-sm text-muted-foreground lg:block">
            <MessageCircle className="mx-auto mb-2 h-8 w-8 text-primary" /> Pick a teammate to start a conversation.
          </aside>
        )}
      </main>
    </div>
  );
}

function ChatPanel({ partner, onClose }: { partner: Profile; onClose: () => void }) {
  const { data: me } = useQuery(meQuery());
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    supabase.from("messages").select("*")
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${partner.id}),and(sender_id.eq.${partner.id},recipient_id.eq.${me.id})`)
      .order("created_at").limit(200)
      .then(({ data }) => alive && setMessages((data ?? []) as Message[]));
    const channel = supabase
      .channel(`dm-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: m }) => {
        const msg = m as Message;
        const ours = (msg.sender_id === me.id && msg.recipient_id === partner.id) || (msg.sender_id === partner.id && msg.recipient_id === me.id);
        if (ours) setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [me, partner.id]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim().slice(0, 2000);
    if (!body || !me) return;
    setText("");
    const { data, error } = await supabase.from("messages").insert({ sender_id: me.id, recipient_id: partner.id, body }).select().single();
    if (error) { setText(body); return void toast.error("Message not sent. Try again."); }
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]));
  }

  return (
    <aside className="glass fixed inset-0 z-50 flex flex-col bg-background lg:sticky lg:top-8 lg:z-auto lg:h-[calc(100vh-4rem)] lg:rounded-2xl lg:bg-transparent">
      <header className="flex items-center gap-3 border-b p-4">
        <UserAvatar username={partner.username} url={partner.avatar_url} />
        <Link to="/u/$username" params={{ username: partner.username }} className="flex-1 font-semibold hover:text-primary">@{partner.username}</Link>
        <Button size="icon" variant="ghost" aria-label="Close chat" onClick={onClose}><X /></Button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {!messages.length && <p className="text-center text-sm text-muted-foreground">No messages yet. Break the ice 👋</p>}
        {messages.map((m) => {
          const mine = m.sender_id === me?.id;
          return (
            <div key={m.id} className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              <p className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <Input placeholder={`Message @${partner.username}`} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-label="Message" />
        <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim()}><Send /></Button>
      </form>
    </aside>
  );
}
