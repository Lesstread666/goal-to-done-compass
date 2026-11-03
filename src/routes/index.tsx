import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, ListChecks } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ticklist — Turn big goals into small tasks" },
      { name: "description", content: "Enter a goal. AI breaks it into prioritized tasks, assigns roles and tracks your team's progress." },
      { property: "og:title", content: "Ticklist — Turn big goals into small tasks" },
      { property: "og:description", content: "Enter a goal. AI breaks it into prioritized tasks, assigns roles and tracks your team's progress." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground glow">
        <ListChecks className="h-7 w-7" />
      </div>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight md:text-6xl">
        Big goal? <span className="text-primary">Take it step by step.</span>
      </h1>
      <p className="mt-5 max-w-lg text-muted-foreground">
        Describe what you want to achieve. Ticklist breaks it into small tasks with priorities, roles and deadlines — and
        flags anything that falls behind.
      </p>
      <Button asChild size="lg" className="mt-8 glow">
        <Link to="/dashboard">
          Open dashboard <ArrowRight />
        </Link>
      </Button>
    </main>
  );
}
