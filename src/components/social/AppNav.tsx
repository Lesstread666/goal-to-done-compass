import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useUnread } from "@/lib/unread";
import { LayoutGrid, ListChecks, LogOut, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

/** Desktop side rail + phone bottom bar shared by the signed-in pages. */
export function AppNav() {
  const signOut = useSignOut();
  const path = useLocation({ select: (l) => l.pathname });
  const { total } = useUnread({ notify: path !== "/teams", notifyGroups: true });
  const badge = (to: string) =>
    to === "/teams" && total > 0 ? (
      <span aria-label={`${total} unread messages`} className="absolute -top-1 right-1/2 translate-x-4 rounded-full bg-destructive px-1.5 text-[10px] leading-4 font-bold text-destructive-foreground">{total > 9 ? "9+" : total}</span>
    ) : null;
  const cls = "flex flex-col items-center gap-1 text-xs";
  return (
    <>
      <nav className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-6 md:flex">
        <div className="mb-6 text-primary"><ListChecks className="h-7 w-7" /></div>
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={`${cls} w-full border-l-2 border-transparent py-3 text-sidebar-foreground hover:text-foreground`} activeProps={{ className: "!border-primary bg-sidebar-accent !text-sidebar-accent-foreground" }}>
            <span className="relative flex flex-col items-center gap-1"><Icon className="h-5 w-5" />{badge(to)}</span> {label}
          </Link>
        ))}
        <button onClick={signOut} className={`${cls} mt-auto text-sidebar-foreground hover:text-foreground`}><LogOut className="h-5 w-5" /> Sign out</button>
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-sidebar/95 py-2 backdrop-blur md:hidden">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={`${cls} px-3 text-sidebar-foreground`} activeProps={{ className: "!text-primary" }}>
            <span className="relative flex flex-col items-center gap-1"><Icon className="h-5 w-5" />{badge(to)}</span> {label}
          </Link>
        ))}
        <button onClick={signOut} className={`${cls} px-3 text-sidebar-foreground`}><LogOut className="h-5 w-5" /> Sign out</button>
      </nav>
    </>
  );
}
