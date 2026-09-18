import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { kickDelivery } from "@/lib/delivery/kick";
import type { NavGroup } from "@/components/app-sidebar";

export default async function AgencyLayout({ children }: LayoutProps<"/agency">) {
  const session = await auth();
  const user = session?.user;
  const agencyId = user?.agencyId ?? null;

  // Badges surface the two things that need a human, from anywhere in the app.
  const [agency, newSubmissions, failedDeliveries] = await Promise.all([
    agencyId
      ? prisma.agency.findUnique({
          where: { id: agencyId },
          select: { name: true },
        })
      : null,
    agencyId
      ? prisma.submission.count({ where: { agencyId, status: "NEW" } })
      : 0,
    agencyId
      ? prisma.deliveryJob.count({ where: { agencyId, status: "DEAD" } })
      : 0,
  ]);

  // Any agency page view also drains due delivery jobs, so retries don't wait
  // on the external scheduler. Throttled per instance: every navigation and
  // server action re-renders this layout.
  if (agencyId) {
    kickDelivery({ batchSize: 10, budgetMs: 8_000, minIntervalMs: 60_000 });
  }

  const groups: NavGroup[] = [
    {
      items: [
        { href: "/agency", label: "Overview", icon: "dashboard", exact: true },
        {
          href: "/agency/submissions",
          label: "Submissions",
          icon: "inbox",
          badge: newSubmissions,
        },
        {
          href: "/agency/deliveries",
          label: "Deliveries",
          icon: "send",
          badge: failedDeliveries,
        },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/agency/clients", label: "Clients", icon: "users" },
        { href: "/agency/sites", label: "Sites", icon: "globe" },
        { href: "/agency/settings", label: "Settings", icon: "settings" },
      ],
    },
  ];

  return (
    <AppShell
      groups={groups}
      workspaceName={agency?.name ?? "FormHub"}
      workspaceMeta="Agency workspace"
      user={{ name: user?.name ?? "Agency user", email: user?.email ?? "" }}
    >
      {children}
    </AppShell>
  );
}
