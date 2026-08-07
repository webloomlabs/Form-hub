import { cn } from "@/lib/utils";

/** Consistent page title block, with room for actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Shown in place of a table when there is nothing yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
