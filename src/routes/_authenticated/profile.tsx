import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, isValidUsername, normalizeUsername, contactsQuery } from "@/lib/social";
import { goalsQuery } from "@/lib/goals";
import { AppNav } from "@/components/social/AppNav";
import { UserAvatar } from "@/components/social/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Ticklist" },
      { name: "description", content: "Your Ticklist username, avatar and bio." },
      { property: "og:title", content: "Your profile — Ticklist" },
      { property: "og:description", content: "Your Ticklist username, avatar and bio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me } = useSuspenseQuery(meQuery());
  const { data: goals = [] } = useQuery(goalsQuery());
  const { data: contacts = [] } = useQuery(contactsQuery());
  const qc = useQueryClient();
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setUsername(me.username); setBio(me.bio); }, [me]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const u = normalizeUsername(username);
    if (!isValidUsername(u)) return void toast.error("Usernames are 3–20 characters: letters, numbers or _.");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ username: u, bio: bio.slice(0, 280) }).eq("id", me.id);
    setBusy(false);
    if (error) return void toast.error(error.code === "23505" ? "That username is taken." : "Could not save your profile.");
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  async function upload(f: File) {
    if (!f.type.startsWith("image/")) return void toast.error("Please choose an image.");
    if (f.size > 5 * 1024 * 1024) return void toast.error("Images must be under 5 MB.");
    setUploading(true);
    const path = `${me.id}/${Date.now()}.${f.name.split(".").pop() || "png"}`;
    const up = await supabase.storage.from("avatars").upload(path, f, { upsert: true, contentType: f.type });
    const signed = up.error ? null : await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const url = signed?.data?.signedUrl;
    if (url) await supabase.from("profiles").update({ avatar_url: url }).eq("id", me.id);
    setUploading(false);
    if (!url) return void toast.error("Could not upload your photo.");
    toast.success("Looking good!");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="flex min-h-screen pb-20 md:pb-0">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <div className="text-sm text-muted-foreground">Dashboard › <span className="text-foreground">Profile</span></div>
        <section className="glass mt-4 flex flex-col items-center gap-4 rounded-2xl p-6 text-center sm:flex-row sm:text-left">
          <button type="button" onClick={() => file.current?.click()} className="group relative" aria-label="Change avatar">
            <UserAvatar username={me.username} url={me.avatar_url} className="h-24 w-24 text-2xl" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 transition group-hover:opacity-100">
              {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
            </span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">@{me.username}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{me.bio || "Add a short bio so teammates know what you're great at."}</p>
            <div className="mt-3 flex justify-center gap-6 text-sm sm:justify-start">
              <span><b>{goals.length}</b> <span className="text-muted-foreground">projects</span></span>
              <Link to="/teams" className="hover:text-primary"><b>{contacts.length}</b> <span className="text-muted-foreground">teammates</span></Link>
            </div>
          </div>
        </section>

        <form onSubmit={save} className="glass mt-6 space-y-4 rounded-2xl p-6">
          <h2 className="font-semibold">Edit profile</h2>
          <div className="space-y-1.5">
            <Label htmlFor="p-username">Username</Label>
            <Input id="p-username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <p className="text-xs text-muted-foreground">Others find you by this. 3–20 letters, numbers or _.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-bio">Bio</Label>
            <Textarea id="p-bio" rows={3} maxLength={280} placeholder="Designer who loves deadlines (really)." value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="glow" disabled={busy}>Save changes</Button>
            <Button type="button" variant="outline" onClick={() => file.current?.click()} disabled={uploading}><Camera /> Upload photo</Button>
          </div>
        </form>
      </main>
    </div>
  );
}
