import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import type { NavGroup } from "@/components/app-sidebar";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const session = await auth();
  const user = session?.user;
  const clientId = user?.clientId ?? null;
  const agencyId = user?.agencyId ?? null;

  const [client, unread] = await Promise.all([
    clientId
      ? prisma.client.findUnique({
          where: { id: clientId },
          select: { name: true },
        })
      : null,
    clientId && agencyId
      ? prisma.submission.count({
          where: { agencyId, site: { clientId }, status: "NEW" },
        })
      : 0,
  ]);

  const groups: NavGroup[] = [
    {
      items: [
        { href: "/client", label: "Enquiries", icon: "inbox", exact: true, badge: unread },
      ],
    },
  ];

  return (
    <AppShell
      groups={groups}
      workspaceName={client?.name ?? "FormHub"}
      workspaceMeta="Website owner"
      user={{ name: user?.name ?? "Website owner", email: user?.email ?? "" }}
    >
      {children}
    </AppShell>
  );
}
