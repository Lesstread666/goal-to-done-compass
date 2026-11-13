import { useUnread, markRead } from "@/lib/unread";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ChevronDown, ChevronUp, MessageCircle, Search, Send, UserPlus, Users as UsersIcon, X } from "lucide-react";
import { dmListQuery, groupsQuery, listTime } from "@/lib/group-chat";
import { CreateGroupDialog } from "@/components/teams/CreateGroupDialog";
import { GroupChatPanel } from "@/components/teams/GroupChatPanel";
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
  validateSearch: z.object({ chat: z.string().optional(), group: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Teams — Ticklist" },
      { name: "description", content: "Your Ticklist teammates, group chats, invites and messages." },
      { property: "og:title", content: "Teams — Ticklist" },
      { property: "og:description", content: "Your Ticklist teammates, group chats, invites and messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const { counts: unread } = useUnread();
  const { chat, group: groupId } = Route.useSearch();
  const navigate = useNavigate({ from: "/teams" });
  const qc = useQueryClient();
  const [tab, setTab] = useState<"conversations" | "people">("conversations");
  const [term, setTerm] = useState("");
  const [openGroups, setOpenGroups] = useState(true);
  const [openDms, setOpenDms] = useState(true);
  const { data: me } = useQuery(meQuery());
  const { data: contacts = [], isLoading } = useQuery(contactsQuery());
  const { data: groups = [] } = useQuery(groupsQuery());
  const { data: dms = [] } = useQuery(dmListQuery());
  const { data: partner } = useQuery({ ...profileByUsernameQuery(chat ?? ""), enabled: !!chat });
  const activeGroup = groups.find((g) => g.id === groupId);
  const open = (p: Profile | null) => navigate({ search: p ? { chat: p.username } : {} });
  const openGroup = (id: string | null) => navigate({ search: id ? { group: id } : {} });
  const q = term.trim().toLowerCase().replace(/^@/, "");
  const shownGroups = groups.filter((g) => g.name.toLowerCase().includes(q));
  const shownDms = dms.filter((d) => d.partner.username.includes(q));
  const shownContacts = contacts.filter((c) => c.username.includes(q));

  useEffect(() => {
    const refresh = () => { void qc.invalidateQueries({ queryKey: ["group-chats"] }); void qc.invalidateQueries({ queryKey: ["dm-list"] }); };
    const ch = supabase.channel(`teams-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);

  async function add(p: Profile) {
    await addContact(p.id);
    qc.invalidateQueries({ queryKey: ["contacts"] });
    toast.success(`@${p.username} joined your team`);
  }
  const sender = (id: string | null) => (id === me?.id ? "You" : contacts.find((c) => c.id === id)?.username ?? "Someone");

  return (
    <div className="flex min-h-screen pb-20 md:pb-0">
      <AppNav />
      <main className="w-full space-y-5 p-4 md:p-8">
        <div>
          <div className="text-sm text-muted-foreground">Dashboard › <span className="text-foreground">Teams</span></div>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">Your team</h1>
          <p className="text-sm text-muted-foreground">Chat with your teammates, collaborate in groups, and manage your team.</p>
        </div>
        <InvitesBanner onJoined={(id) => navigate({ to: "/dashboard", search: { goal: id } })} />
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,440px)_1fr]">
          <section className="h-fit space-y-4 lg:glass lg:sticky lg:top-8 lg:rounded-2xl lg:p-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1" role="tablist">
              {(["conversations", "people"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium capitalize", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t === "conversations" ? <MessageCircle className="h-4 w-4" /> : <UsersIcon className="h-4 w-4" />} {t}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search conversations or people" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search conversations or people" />
            </div>
            {tab === "conversations" ? (
              <>
                <CreateGroupDialog onCreated={(id) => openGroup(id)} />
                <ListSection title={`Group chats (${groups.length})`} open={openGroups} onToggle={() => setOpenGroups((v) => !v)}>
                  {!shownGroups.length && <p className="px-2 text-sm text-muted-foreground">{groups.length ? "No matching groups." : "No group chats yet."}</p>}
                  {shownGroups.map((g) => (
                    <ConvoRow key={g.id} active={g.id === groupId} onClick={() => openGroup(g.id)} icon={<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted"><UsersIcon className="h-5 w-5" /></span>}
                      title={g.name} time={listTime(g.last_at ?? g.created_at)} unread={g.unread}
                      preview={g.last_kind === "system" ? (g.last_body ?? "") : g.last_at ? `${sender(g.last_sender)}: ${g.last_body?.trim() || (g.last_has_attachment ? "📎 Attachment" : "")}` : `${g.member_count} members`} />
                  ))}
                </ListSection>
                <ListSection title={`Direct messages (${dms.length})`} open={openDms} onToggle={() => setOpenDms((v) => !v)}>
                  {!shownDms.length && <p className="px-2 text-sm text-muted-foreground">{dms.length ? "No matching chats." : "No direct messages yet."}</p>}
                  {shownDms.map(({ partner: p, last }) => (
                    <ConvoRow key={p.id} active={partner?.id === p.id} onClick={() => open(p)} icon={<UserAvatar username={p.username} url={p.avatar_url} className="h-11 w-11" />}
                      title={`@${p.username}`} time={listTime(last.created_at)} unread={unread[p.id] ?? 0} preview={(last.sender_id === me?.id ? "You: " : "") + last.body} />
                  ))}
                </ListSection>
              </>
            ) : (
              <div className="space-y-4">
                <UserSearch placeholder="Find new people by username" action={(p) => contacts.some((c) => c.id === p.id) ? <span className="text-xs text-muted-foreground">In team</span> : <Button size="sm" onClick={() => add(p)}><UserPlus /> Add</Button>} />
                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Teammates ({contacts.length})</h2>
                {isLoading ? <p className="text-muted-foreground">Loading…</p> : !shownContacts.length ? (
                  <p className="text-sm text-muted-foreground">{contacts.length ? "No matching teammates." : "No teammates yet — search a username above, or invite someone to a project."}</p>
                ) : shownContacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-panel/60 p-3">
                    <UserAvatar username={c.username} url={c.avatar_url} className="h-10 w-10" />
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">@{c.username}</div><div className="truncate text-xs text-muted-foreground">{c.bio || "Ticklist teammate"}</div></div>
                    <Button size="icon" variant="outline" aria-label={`Message ${c.username}`} className="relative" onClick={() => open(c)}><MessageCircle />{unread[c.id] ? <span className="absolute -top-1 -right-1 rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread[c.id]}</span> : null}</Button>
                    <Button size="sm" variant="outline" asChild><Link to="/u/$username" params={{ username: c.username }}>Profile</Link></Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          {activeGroup ? <GroupChatPanel key={activeGroup.id} group={activeGroup} onClose={() => openGroup(null)} onLeft={() => openGroup(null)} />
            : partner ? <ChatPanel partner={partner} onClose={() => open(null)} /> : (
            <aside className="glass hidden h-fit rounded-2xl p-6 text-center text-sm text-muted-foreground lg:block">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 text-primary" /> Pick a conversation, or start a group chat with your team.
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function ListSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="lg:border-t lg:pt-3">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title} {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-2 space-y-1 rounded-2xl border bg-panel/40 p-1 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">{children}</div>}
    </div>
  );
}

function ConvoRow({ active, onClick, icon, title, preview, time, unread }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; preview: string; time: string; unread: number }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left hover:bg-muted/50", active && "border-primary bg-primary/10")}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{title}</span><span className="shrink-0 text-xs text-muted-foreground">{time}</span></span>
        <span className="flex items-center justify-between gap-2"><span className="truncate text-sm text-muted-foreground">{preview}</span>{unread > 0 && <span aria-label={`${unread} unread`} className="shrink-0 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}</span>
      </span>
    </button>
  );
}

function ChatPanel({ partner, onClose }: { partner: Profile; onClose: () => void }) {
  const { data: me } = useQuery(meQuery());
  const [messages, setMessages] = useState<Message[]>([]);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    supabase.from("messages").select("*")
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${partner.id}),and(sender_id.eq.${partner.id},recipient_id.eq.${me.id})`)
      .order("created_at").limit(200)
      .then(({ data }) => { if (alive) setMessages((data ?? []) as Message[]); });
    void markRead(partner.id).then(() => qc.invalidateQueries({ queryKey: ["unread"] }));
    const channel = supabase
      .channel(`dm-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: m }) => {
        const msg = m as Message;
        const ours = (msg.sender_id === me.id && msg.recipient_id === partner.id) || (msg.sender_id === partner.id && msg.recipient_id === me.id);
        if (ours && msg.sender_id === partner.id) void markRead(partner.id).then(() => qc.invalidateQueries({ queryKey: ["unread"] }));
        if (ours) setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [me, partner.id, qc]);

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
