import { initials } from "@/lib/goals";
import { cn } from "@/lib/utils";

const tones = ["bg-primary/80 text-primary-foreground", "bg-accent text-accent-foreground", "bg-chart-2 text-background", "bg-chart-3 text-background", "bg-chart-4 text-background", "bg-chart-5 text-background"];

export function UserAvatar({ username, url, className }: { username: string; url?: string | null; className?: string }) {
  const tone = tones[[...username].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  return url ? (
    <img src={url} alt={`${username}'s avatar`} className={cn("h-9 w-9 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", tone, className)}>{initials(username.replace(/_/g, " "))}</span>
  );
}
