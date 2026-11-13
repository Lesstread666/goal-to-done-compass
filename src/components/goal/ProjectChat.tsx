import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/social";
import { projectMessagesQuery, projectUnreadQuery, type ProjectMessage } from "@/lib/project-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/social/UserAvatar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const ChatContext = createContext<{ open: () => void; count: number } | null>(null);

export function MobileProjectChatButton() {
  const chat = useContext(ChatContext);
  if (!chat) return null;
  return <div className="min-w-0 text-center md:hidden">
    <Button size="icon" variant="outline" onClick={chat.open} title="Open project chat" aria-label={chat.count ? `Open project chat, ${chat.count} unread messages` : "Open project chat"} className="relative mx-auto h-11 w-11 rounded-full border-primary/60 text-primary">
      <MessageCircle className="h-5 w-5" />
      {chat.count > 0 && <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">{chat.count > 99 ? "99+" : chat.count}</span>}
    </Button>
  </div>;
}

export function ProjectChat({ goalId, title, team, children }: { goalId: string; title: string; team: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const qc = useQueryClient();
  const unread = useQuery(projectUnreadQuery(goalId));
  useEffect(() => {
    const channel = supabase.channel(`project-chat-${goalId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_messages", filter: `goal_id=eq.${goalId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["project-chat-messages", goalId] });
        void qc.invalidateQueries({ queryKey: ["project-chat-unread", goalId] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [goalId, qc]);
  const count = unread.data ?? 0;
  return <ChatContext.Provider value={{ open: () => setOpen(true), count }}>
    {team}
    <div className="relative">
      <div className={cn("space-y-5", open && !mobile && "md:invisible")} aria-hidden={(open && !mobile) || undefined}>{children}</div>
      {open && (mobile
        ? createPortal(<ChatConversation goalId={goalId} title={title} mobile onClose={() => setOpen(false)} />, document.body)
        : <ChatConversation goalId={goalId} title={title} mobile={false} onClose={() => setOpen(false)} />)}
    </div>
    <Button variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="project-chat-panel" className={cn("hidden h-auto w-full justify-between rounded-lg p-3 text-left md:flex", count > 0 && "border-primary/70")}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative"><MessageCircle className="h-5 w-5" />{count > 0 && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />}</span>
        <span><span className="flex items-center gap-2">Messaging {count > 0 && <span aria-label={`${count} unread messages`} className="rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{count > 99 ? "99+" : count}</span>}</span>
          {count > 0 && <span className="mt-0.5 block text-xs text-primary">{count} unread message{count === 1 ? "" : "s"}</span>}
          {unread.isError && <span className="block text-xs text-destructive">Could not check unread messages</span>}
        </span>
      </span>
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
    </Button>
  </ChatContext.Provider>;
}

function ChatConversation({ goalId, title, mobile, onClose }: { goalId: string; title: string; mobile: boolean; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobile) return;
    const previousFocus = document.activeElement;
    const previousScroll = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((node) => node !== panel.current);
    const oldInert = siblings.map((node) => node.hasAttribute("inert"));
    siblings.forEach((node) => node.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const resize = () => {
      if (!panel.current || !viewport) return;
      panel.current.style.height = `${viewport.height}px`;
      panel.current.style.top = `${viewport.offsetTop}px`;
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach((node, index) => { if (!oldInert[index]) node.removeAttribute("inert"); });
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
      window.scrollTo({ top: previousScroll, behavior: "instant" });
    };
  }, [mobile]);
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery());
  const messages = useQuery(projectMessagesQuery(goalId));
  const members = useQuery({ queryKey: ["project-chat-members", goalId], queryFn: async () => {
    const { data, error } = await supabase.from("goal_members").select("user_id").eq("goal_id", goalId);
    if (error) throw error;
    const ids = (data ?? []).map((m) => m.user_id);
    if (!ids.length) return [];
    const profiles = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);
    if (profiles.error) throw profiles.error;
    return profiles.data ?? [];
  }});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState<ProjectMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const lastMarked = useRef(0);
  const atBottom = useRef(true);
  const rows = [...older, ...(messages.data ?? [])].filter((m, i, all) => all.findIndex((r) => r.id === m.id) === i).sort((a, b) => a.id - b.id);
  const latest = messages.data?.at(-1)?.id;
  async function markVisible() {
    const box = scroller.current;
    if (!box || document.visibilityState !== "visible" || !latest || !me || !atBottom.current || latest <= lastMarked.current) return;
    const rect = box.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
    lastMarked.current = latest;
    const { error } = await supabase.rpc("mark_project_chat_read", { p_goal_id: goalId, p_message_id: latest });
    if (error) { lastMarked.current = 0; return; }
    await qc.invalidateQueries({ queryKey: ["project-chat-unread", goalId] });
  }
  useEffect(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
    void markVisible();
    const onVisibility = () => { void markVisible(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onVisibility, { passive: true });
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("scroll", onVisibility); };
  }, [latest, me?.id, goalId]);

  async function loadOlder() {
    const first = rows[0];
    if (!first) return;
    setLoadingOlder(true);
    const box = scroller.current;
    const height = box?.scrollHeight ?? 0;
    const { data, error } = await supabase.from("project_messages").select("*").eq("goal_id", goalId).lt("id", first.id).order("id", { ascending: false }).limit(100);
    setLoadingOlder(false);
    if (error) return void toast.error("Could not load earlier messages.");
    setHasOlder((data?.length ?? 0) === 100);
    setOlder((prev) => [...(data ?? []).reverse(), ...prev]);
    requestAnimationFrame(() => { if (box) box.scrollTop += box.scrollHeight - height; });
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !me || sending) return;
    setSending(true);
    const { error } = await supabase.from("project_messages").insert({ goal_id: goalId, sender_id: me.id, body });
    setSending(false);
    if (error) return void toast.error("Message not sent. Please try again.");
    setText("");
    atBottom.current = true;
    await qc.invalidateQueries({ queryKey: ["project-chat-messages", goalId] });
  }
  return <section ref={panel} id="project-chat-panel" aria-label="Project chat" role={mobile ? "dialog" : "region"} aria-modal={mobile || undefined} className={cn("flex min-h-0 flex-col overflow-hidden bg-panel", mobile ? "fixed inset-x-0 top-0 z-[100] h-dvh" : "absolute inset-0 z-10 rounded-lg border")} onKeyDown={(e) => {
    if (!mobile || e.key !== "Tab") return;
    const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
    const first = controls?.[0];
    const last = controls?.[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <header className="flex shrink-0 items-center gap-2 border-b p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <MessageCircle className="h-5 w-5 text-primary" />
      <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">Project chat</h3>{mobile && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{title}</p>}<p className="text-xs text-muted-foreground">{members.data?.length ?? "…"} project members</p></div>
      <Button ref={closeButton} variant="ghost" size="icon" className="h-11 w-11 shrink-0 md:h-8 md:w-8" title="Close project chat" aria-label="Close project chat" onClick={onClose}><X className="h-4 w-4" /></Button>
    </header>
    <div ref={scroller} role="log" aria-label="Project messages" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" onScroll={() => {
      const box = scroller.current;
      if (box) atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
      void markVisible();
    }}>
      {(messages.data?.length ?? 0) >= 100 && hasOlder && <Button size="sm" variant="ghost" className="w-full" disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? "Loading…" : "Earlier messages"}</Button>}
      {messages.isPending && <p className="text-sm text-muted-foreground">Loading messages…</p>}
      {messages.isError && <div className="text-sm text-destructive">Could not load messages.<Button variant="ghost" size="sm" onClick={() => messages.refetch()}>Retry</Button></div>}
      {!messages.isPending && !messages.isError && !rows.length && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>}
      {rows.map((m) => {
        const mine = m.sender_id === me?.id;
        const sender = members.data?.find((p) => p.id === m.sender_id);
        const name = sender?.username ?? (mine ? me?.username : "Project member") ?? "Project member";
        return <div key={m.id} className={cn("flex items-start gap-2", mine && "flex-row-reverse")}>
          <UserAvatar username={name} url={sender?.avatar_url ?? null} className="h-7 w-7 text-[10px]" />
          <div className="min-w-0 max-w-[85%]"><div className={cn("mb-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground", mine && "justify-end")}><span className="font-semibold text-foreground">{mine ? "You" : name}</span><time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString()}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
            <p className={cn("rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]", mine ? "bg-accent text-accent-foreground" : "bg-muted text-foreground")}>{m.body}</p>
          </div>
        </div>;
      })}
    </div>
    <form onSubmit={send} className="flex shrink-0 gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Input aria-label="Project message" placeholder="Message your project…" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 text-base md:text-xs" />
      <Button size="icon" type="submit" title="Send message" aria-label="Send project message" disabled={!text.trim() || !me || sending}><Send className="h-4 w-4" /></Button>
    </form>
  </section>;
}