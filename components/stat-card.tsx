import Link from "next/link";
import { cn } from "@/lib/utils";

export type Stat = {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  /** Draws attention when the number is one someone should act on. */
  tone?: "default" | "attention";
};

function StatBody({ stat }: { stat: Stat }) {
  const Icon = stat.icon;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm font-medium">
          {stat.label}
        </span>
        <Icon
          className={cn(
            "size-4",
            stat.tone === "attention" && Number(stat.value) > 0
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        />
      </div>
      <div className="space-y-1">
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums tracking-tight",
            stat.tone === "attention" &&
              Number(stat.value) > 0 &&
              "text-destructive",
          )}
        >
          {stat.value}
        </p>
        {stat.hint ? (
          <p className="text-muted-foreground text-xs">{stat.hint}</p>
        ) : null}
      </div>
    </>
  );
}

export function StatCard({ stat }: { stat: Stat }) {
  const className =
    "bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5 shadow-xs";

  if (stat.href) {
    return (
      <Link
        href={stat.href}
        className={cn(className, "hover:border-ring/40 transition-colors")}
      >
        <StatBody stat={stat} />
      </Link>
    );
  }

  return (
    <div className={className}>
      <StatBody stat={stat} />
    </div>
  );
}

export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}
