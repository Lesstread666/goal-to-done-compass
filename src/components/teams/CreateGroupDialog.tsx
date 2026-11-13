import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { contactsQuery } from "@/lib/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/social/UserAvatar";

export function CreateGroupDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { data: contacts = [] } = useQuery(contactsQuery());
  const shown = contacts.filter((c) => c.username.includes(filter.trim().toLowerCase().replace(/^@/, "")));

  async function create() {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_group_chat", { p_name: name, p_members: picked });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`“${name.trim()}” is ready to chat`);
    await qc.invalidateQueries({ queryKey: ["group-chats"] });
    setOpen(false); setName(""); setPicked([]); setFilter("");
    onCreated(data as string);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="h-11 w-full border-primary text-primary hover:bg-primary/10 hover:text-primary"><Plus /> Create Group Chat</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>Name it, then pick people from your team.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Group name, e.g. Marketing Team" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Group name" />
          <Input placeholder="Filter teammates" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter teammates" />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {!contacts.length && <p className="text-sm text-muted-foreground">Your team is empty. Add teammates first from the People tab.</p>}
            {shown.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                <UserAvatar username={c.username} url={c.avatar_url} className="h-8 w-8" />
                <span className="text-sm">@{c.username}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={busy || !name.trim() || !picked.length}>{busy ? "Creating…" : `Create with ${picked.length} teammate${picked.length === 1 ? "" : "s"}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
