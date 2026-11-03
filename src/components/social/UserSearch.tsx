import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchProfiles, currentUserId, type Profile } from "@/lib/social";
import { UserAvatar } from "./UserAvatar";

export function UserSearch({ action, placeholder = "Search by username" }: { action: (p: Profile) => ReactNode; placeholder?: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => void currentUserId().then(setMe), []);
  useEffect(() => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchProfiles(term, me).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [term, me]);
  return (
    <div>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search people by username" />
      </div>
      {term.trim() && (
        <ul className="mt-2 space-y-1">
          {results.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border bg-card/60 px-3 py-2">
              <UserAvatar username={p.username} url={p.avatar_url} className="h-8 w-8" />
              <span className="flex-1 truncate text-sm font-medium">@{p.username}</span>
              {action(p)}
            </li>
          ))}
          {!results.length && <li className="px-1 text-sm text-muted-foreground">No one found with that username.</li>}
        </ul>
      )}
    </div>
  );
}
