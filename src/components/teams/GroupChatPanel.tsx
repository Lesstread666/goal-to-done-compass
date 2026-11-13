import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, LogOut, MoreVertical, Paperclip, Pencil, Plus, Send, SmilePlus, UserMinus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { contactsQuery, meQuery, type Profile } from "@/lib/social";
import {
  attachmentUrl, formatBytes, groupMembersQuery, groupMessagesQuery, groupPermissions, groupReactions,
  MAX_ATTACHMENT_BYTES, REACTION_EMOJIS, type GroupMessage, type GroupSummary,
} from "@/lib/group-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/social/UserAvatar";
import { cn } from "@/lib/utils";

export function GroupChatPanel({ group, onClose, onLeft }: { group: GroupSummary; onClose: () => void; onLeft: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery());
  const { data: members = [] } = useQuery(groupMembersQuery(group.id));
  const { data } = useQuery(groupMessagesQuery(group.id));
  const messages = data?.messages ?? [];
  const reactions = data?.reactions ?? [];
  const perms = groupPermissions(group, me?.id);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [dialog, setDialog] = useState<null | "rename" | "add" | "members" | "leave">(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: ["group-messages", group.id] });
    const ch = supabase.channel(`group-${group.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages", filter: `group_id=eq.${group.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_reactions", filter: `group_id=eq.${group.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members", filter: `group_id=eq.${group.id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["group-members", group.id] });
        void qc.invalidateQueries({ queryKey: ["group-chats"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [group.id, qc]);

  const lastId = messages.at(-1)?.id ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    if (lastId) void supabase.rpc("mark_group_read", { p_group: group.id, p_message_id: lastId }).then(() => qc.invalidateQueries({ queryKey: ["group-chats"] }));
  }, [lastId, group.id, qc]);

  async function toggleReaction(m: GroupMessage, emoji: string) {
    if (!me) return;
    const mine = reactions.some((r) => r.message_id === m.id && r.user_id === me.id && r.emoji === emoji);
    const { error } = mine
      ? await supabase.from("chat_group_reactions").delete().match({ message_id: m.id, user_id: me.id, emoji })
      : await supabase.from("chat_group_reactions").insert({ message_id: m.id, group_id: group.id, user_id: me.id, emoji });
    if (error) toast.error("Could not update reaction.");
    void qc.invalidateQueries({ queryKey: ["group-messages", group.id] });
  }

  let lastDay = "";
  return (
    <aside className="glass fixed inset-0 z-50 flex flex-col bg-background lg:sticky lg:top-8 lg:z-auto lg:h-[calc(100vh-4rem)] lg:rounded-2xl lg:bg-transparent">
      <header className="flex items-center gap-2 border-b p-3 sm:gap-3 sm:p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted sm:h-12 sm:w-12"><Users className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{group.name}</h2>
          <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setDialog("members")}>{members.length} member{members.length === 1 ? "" : "s"}</button>
        </div>
        <div className="hidden -space-x-2 sm:flex">
          {members.slice(0, 4).map((m) => <UserAvatar key={m.id} username={m.username} url={m.avatar_url} className="h-9 w-9 ring-2 ring-background" />)}
          {members.length > 4 && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-background">+{members.length - 4}</span>}
        </div>
        {perms.canAddMembers && <Button size="icon" variant="outline" className="rounded-full" aria-label="Add members" onClick={() => setDialog("add")}><Plus /></Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label="Group options"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog("rename")}><Pencil /> Rename group</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("members")}><Users /> {perms.canRemoveMembers ? "Manage members" : "View members"}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDialog("leave")}><LogOut /> Leave group</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" variant="ghost" aria-label="Close chat" onClick={onClose}><X /></Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length && <p className="text-center text-sm text-muted-foreground">Fresh group, zero messages. Kick things off 🚀</p>}
        {messages.map((m) => {
          const mine = m.sender_id === me?.id;
          const sender = byId.get(m.sender_id);
          const day = new Date(m.created_at).toDateString();
          const showDay = day !== lastDay; lastDay = day;
          const groups = groupReactions(reactions, m.id, me?.id);
          const dayPill = showDay && <div className="mb-3 flex justify-center"><span className="rounded-full bg-muted px-3 py-1 text-xs">{day === new Date().toDateString() ? "Today" : new Date(m.created_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span></div>;
          if (m.kind === "system") return (
            <div key={m.id}>{dayPill}<p role="status" className="text-center text-xs text-muted-foreground"><span className="rounded-full border px-3 py-1">{m.body} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></p></div>
          );
          return (
            <div key={m.id}>
              {dayPill}
              <div className="group flex gap-3">
                <UserAvatar username={sender?.username ?? "former"} url={sender?.avatar_url ?? null} className="h-10 w-10" />
                <div className="min-w-0 max-w-[80%] space-y-1.5">
                  <div className="flex items-baseline gap-2 text-sm"><span className="font-semibold">{mine ? "You" : sender ? sender.username : "Former member"}</span><span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                  {m.body.trim() && <p className={cn("w-fit rounded-xl px-3 py-2 text-sm break-words whitespace-pre-wrap", mine ? "bg-primary/80 text-primary-foreground" : "bg-muted")}>{m.body}</p>}
                  {m.attachment_path && <Attachment m={m} />}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {groups.map((g) => (
                      <button key={g.emoji} onClick={() => toggleReaction(m, g.emoji)} aria-pressed={g.mine} aria-label={`${g.emoji} ${g.count}`} className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm", g.mine ? "border-primary bg-primary/15" : "bg-muted/50")}>
                        {g.emoji} <span className="text-xs">{g.count}</span>
                      </button>
                    ))}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button aria-label="Add reaction" className={cn("rounded-full border p-1 text-muted-foreground hover:text-foreground", !groups.length && "opacity-0 group-hover:opacity-100 focus:opacity-100")}><SmilePlus className="h-4 w-4" /></button>
                      </PopoverTrigger>
                      <PopoverContent className="flex w-auto gap-1 p-1.5">
                        {REACTION_EMOJIS.map((e) => <button key={e} className="rounded p-1 text-lg hover:bg-muted" onClick={() => toggleReaction(m, e)} aria-label={`React ${e}`}>{e}</button>)}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <Composer groupId={group.id} meId={me?.id} />

      <RenameDialog open={dialog === "rename"} group={group} onClose={() => setDialog(null)} />
      <AddMembersDialog open={dialog === "add"} group={group} members={members} onClose={() => setDialog(null)} />
      <MembersDialog open={dialog === "members"} group={group} members={members} meId={me?.id} canRemove={perms.canRemoveMembers} onClose={() => setDialog(null)} />
      <LeaveDialog open={dialog === "leave"} group={group} isOwner={perms.canRemoveMembers} onClose={() => setDialog(null)} onLeft={onLeft} />
    </aside>
  );
}

function Attachment({ m }: { m: GroupMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = m.attachment_type?.startsWith("image/");
  useEffect(() => { if (isImage && m.attachment_path) void attachmentUrl(m.attachment_path).then(setUrl).catch(() => {}); }, [isImage, m.attachment_path]);
  async function download() {
    try { window.open(await attachmentUrl(m.attachment_path!), "_blank", "noopener"); } catch { toast.error("Could not open the file."); }
  }
  return (
    <div className="w-fit max-w-full rounded-xl border bg-muted/60 p-2">
      {isImage && url && <img src={url} alt={m.attachment_name ?? "Attachment"} className="mb-2 max-h-60 rounded-lg object-contain" />}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background"><FileText className="h-5 w-5" /></span>
        <div className="min-w-0"><div className="truncate text-sm font-medium">{m.attachment_name}</div><div className="text-xs text-muted-foreground">{formatBytes(m.attachment_size)}</div></div>
        <Button size="icon" variant="ghost" className="rounded-full" aria-label={`Download ${m.attachment_name}`} onClick={download}><Download /></Button>
      </div>
    </div>
  );
}

function Composer({ groupId, meId }: { groupId: string; meId?: string | undefined }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) return void toast.error("Files can be up to 20 MB.");
    setFile(f);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim().slice(0, 2000);
    if ((!body && !file) || !meId || busy) return;
    setBusy(true);
    let attachment = {};
    if (file) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${groupId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, file, file.type ? { contentType: file.type } : {});
      if (error) { setBusy(false); return void toast.error("Upload failed. Try again."); }
      attachment = { attachment_path: path, attachment_name: file.name, attachment_size: file.size, attachment_type: file.type || null };
    }
    const { error } = await supabase.from("chat_group_messages").insert({ group_id: groupId, sender_id: meId, body, ...attachment });
    setBusy(false);
    if (error) return void toast.error("Message not sent. Try again.");
    setText(""); setFile(null);
    void qc.invalidateQueries({ queryKey: ["group-messages", groupId] });
    void qc.invalidateQueries({ queryKey: ["group-chats"] });
  }
  return (
    <form onSubmit={send} className="border-t p-3">
      {file && <div className="mb-2 flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm"><FileText className="h-4 w-4" /><span className="max-w-60 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span><button type="button" aria-label="Remove attachment" onClick={() => setFile(null)}><X className="h-4 w-4" /></button></div>}
      <div className="flex items-center gap-2 rounded-2xl border bg-background/40 p-1.5">
        <input ref={input} type="file" className="hidden" aria-label="Attach file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" size="icon" variant="ghost" aria-label="Attach a file" onClick={() => input.current?.click()}><Paperclip /></Button>
        <Input className="border-0 bg-transparent shadow-none focus-visible:ring-0" placeholder="Type a message…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-label="Message" />
        <Button type="submit" size="icon" aria-label="Send" disabled={busy || (!text.trim() && !file)}><Send /></Button>
      </div>
    </form>
  );
}

function RenameDialog({ open, group, onClose }: { open: boolean; group: GroupSummary; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  useEffect(() => { if (open) setName(group.name); }, [open, group.name]);
  async function save() {
    const { error } = await supabase.rpc("rename_group_chat", { p_group: group.id, p_name: name });
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["group-chats"] });
    toast.success("Group renamed");
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Rename group</DialogTitle><DialogDescription>Any member can change the name.</DialogDescription></DialogHeader>
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Group name" />
        <DialogFooter><Button onClick={save} disabled={!name.trim() || name.trim() === group.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({ open, group, members, onClose }: { open: boolean; group: GroupSummary; members: Profile[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: contacts = [] } = useQuery(contactsQuery());
  const inGroup = new Set(members.map((m) => m.id));
  async function add(p: Profile) {
    const { error } = await supabase.rpc("add_group_member", { p_group: group.id, p_user: p.id });
    if (error) return void toast.error(error.message);
    toast.success(`@${p.username} added`);
    void qc.invalidateQueries({ queryKey: ["group-members", group.id] });
    void qc.invalidateQueries({ queryKey: ["group-chats"] });
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Add to {group.name}</DialogTitle><DialogDescription>Pick from your team.</DialogDescription></DialogHeader>
        <div className="space-y-1">
          {!contacts.length && <p className="text-sm text-muted-foreground">No teammates yet.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <UserAvatar username={c.username} url={c.avatar_url} className="h-8 w-8" />
              <span className="flex-1 text-sm">@{c.username}</span>
              {inGroup.has(c.id) ? <span className="text-xs text-muted-foreground">In group</span> : <Button size="sm" onClick={() => add(c)}>Add</Button>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ open, group, members, meId, canRemove, onClose }: { open: boolean; group: GroupSummary; members: Profile[]; meId?: string | undefined; canRemove: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  async function remove(p: Profile) {
    const { error } = await supabase.rpc("remove_group_member", { p_group: group.id, p_user: p.id });
    if (error) return void toast.error(error.message);
    toast.success(`@${p.username} removed`);
    void qc.invalidateQueries({ queryKey: ["group-members", group.id] });
    void qc.invalidateQueries({ queryKey: ["group-chats"] });
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Members</DialogTitle><DialogDescription>{members.length} in {group.name}</DialogDescription></DialogHeader>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <UserAvatar username={m.username} url={m.avatar_url} className="h-8 w-8" />
              <span className="flex-1 text-sm">@{m.username}{m.id === meId && " (you)"}</span>
              {m.id === group.owner_id && <span className="text-xs text-primary">Owner</span>}
              {canRemove && m.id !== meId && <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Remove ${m.username}`} onClick={() => remove(m)}><UserMinus /> Remove</Button>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeaveDialog({ open, group, isOwner, onClose, onLeft }: { open: boolean; group: GroupSummary; isOwner: boolean; onClose: () => void; onLeft: () => void }) {
  const qc = useQueryClient();
  async function leave() {
    const { error } = await supabase.rpc("leave_group_chat", { p_group: group.id });
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["group-chats"] });
    toast.success(`You left ${group.name}`);
    onClose(); onLeft();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Leave {group.name}?</DialogTitle>
          <DialogDescription>You'll lose access to this chat and its history.{isOwner && " The longest-standing member becomes the new owner."}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" onClick={leave}>Leave group</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
